import * as fs from "fs";
import path from "path";
import { Client } from "revolt.js"
import { CommandHandler, CommandLoader, PrefixManager } from "./src/CommandHandler.mjs";
import { Message, MessageHandler, PageBuilder } from "./src/MessageHandler.mjs";
import { MySqlSettingsManager } from "./src/Settings.mjs";
import { Revoice } from "revoice.js";
import YTDlpWrapE from "yt-dlp-wrap-extended";
import { PlayerManager } from "./src/PlayerManager.mjs";
import Player from "./src/Player.mjs";
const YTDlpWrap = YTDlpWrapE.default;
import { Innertube, Platform } from "youtubei.js";
import { generate } from "youtube-po-token-generator";
import childProcess from "node:child_process";

class Remix {
  constructor() {
    const config = JSON.parse(fs.readFileSync("config.json"));
    this.config = config;

    const client = new Client({
      ...config["stoat.js"],
    });
    this.client = client;
    const messages = new MessageHandler(this.client);
    this.messages = messages;
    const commands = new CommandHandler(messages);
    const settings = new MySqlSettingsManager(config.mysql, "./storage/defaults.json");
    this.settingsMgr = settings;
    this.handler = commands;

    commands.setPrefixManager(new PrefixManager(settings));
    commands.onPing = (msg) => {
      msg.replyEmbed(this.handler.format("My prefix in this server is `$prefix`\n\nRun `$prefix$helpCmd` to get started!", msg.message.server.id), false, {
        icon_url: (msg.channel.channel.server.icon) ? "https://autumn.revolt.chat/icons/" + msg.channel.channel.server.icon.id : null,
        title: msg.channel.channel.server.name
      });
    }

    client.on("ready", () => {
      console.log("ready");
    });

    const loader = new CommandLoader(commands, this);
    const __dirname = import.meta.dirname;
    const dir = path.join(__dirname, "commands");
    loader.loadFromDir(dir);

    this.revoice = new Revoice(config.token || config.login, config["revolt-api"]);
    this.observedVoiceUsers = new Map();
    if (!fs.existsSync("./bin")) fs.mkdirSync("./bin");
    const ytdlPath = path.join(__dirname, "./bin/ytdlp.bin");
    if (!fs.existsSync(ytdlPath)) {
      console.log("Downloading yt-dlp binaries.");
      YTDlpWrap.downloadFromGithub(ytdlPath).then(() => {
        console.log("Finished downloading yt-dlp binaries.");
        this.ytdlp = new YTDlpWrap(ytdlPath);
        this.playerContext.ytdlp = this.ytdlp;
      });
    } else {
      this.ytdlp = new YTDlpWrap(ytdlPath);
    }

    this.initInnertube();

    try {
      this.comHash = childProcess
        .execSync('git rev-parse --short HEAD', { cwd: __dirname })
        .toString().trim();
      this.comHashLong = childProcess
        .execSync('git rev-parse HEAD', { cwd: __dirname })
        .toString().trim();
    } catch (e) {
      console.log("Git comhash error");
      this.comHash = "Newest";
      this.comHashLong = null;
    }

    this.playerContext = {
      voice: this.revoice,
      client: this.client,
      config,
      ytdlp: this.ytdlp,
      innertube: this.innertube
    }
    this.players = new PlayerManager(this.revoice, settings, commands, {
      config: config,
      player: this.playerContext
    });

    this.comLink = (this.comHashLong) ? "https://github.com/remix-bot/stoat/tree/" + this.comHashLong : "https://github.com/remix-bot/stoat";
    this.playerMap = new Map();
    this.currPort = -1;
    this.channels = [];
    this.freed = [];

    client.loginBot(config.token);
  }

  getSettings(message) {
    const serverId = message.channel.channel.serverId;
    return this.settingsMgr.getServer(serverId);
  }
  /**
   * @param {Message} message
   * @param {boolean} [promptJoin]
   * @param {boolean} [verifyUser]
   * @returns {Player}
   */
  getPlayer(message, promptJoin, verifyUser) {
    return this.players.getPlayer(message)
  }
  /**
   * @param {string} form
   * @param {string} content
   * @param {Message} msg
   * @param {number} linesPerPage
   */
  pagination(form, content, msg, linesPerPage) {
    const builder = new PageBuilder(content)
      .setForm(form)
      .setMaxLines(linesPerPage);
    this.messages.initPagination(builder, msg);
  }

  async generateVisitorData() {
    return new Promise((res, _rej) => {
      generate().then(result => {
        console.log("[Innertube init] VisitorData and PO Token generated: ", result);
        return res(result.visitorData);
      }).catch(() => { // failed for some reason, retry
        console.log("[Innertube init] VisitorData generation failed. Retrying in 2 seconds.");
        setTimeout(async () => {
          return res(await this.generateVisitorData());
        }, 2000);
      });
    });
  }
  async getVisitorData() {
    const regenerate = async () => {
      console.log("[Innertube init] generating VisitorData");
      const data = {
        visitorData: await this.generateVisitorData(),
        created: Date.now()
      }
      fs.writeFileSync("./.ytcache/visitor_data.json", JSON.stringify(data));
      return data.visitorData;
    }
    if (!fs.existsSync("./.ytcache/visitor_data.json")) {
      return await regenerate();
    }
    const data = JSON.parse(fs.readFileSync("./.ytcache/visitor_data.json"));
    if (data.created < Date.now() - 1000 * 60 * 60 * 24 * 4) { // regenerate every 4 days, interval completely arbitrary and subject to change.
      console.log("[Innertube init] VisitorData expired");
      return await regenerate();
    }
    return data.visitorData;
  }
  async initInnertube() {
    // Tell youtubei.js how to evaluate YouTube's obfuscated JS for URL deciphering.
    Platform.shim.eval = async (data, env) => { // ai-generated by alan, I won't touch it until it breaks
      const properties = [];
      if (env.n) properties.push(`n: exportedVars.nFunction("${env.n}")`);
      if (env.sig) properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
      const code = `${data.output}\nreturn { ${properties.join(', ')} }`;
      return new Function(code)();
    };

    this.innertube = await Innertube.create({
      retrieve_player: true,
      generate_session_locally: true,
      // Using Firefox User Agent
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
      client_type: 'WEB',
      // Visitor data helps stabilize the v1/player 400 errors
      visitor_data: await this.getVisitorData()//'CgtSdl9RSl9uX3dfdyiAgpWyBg%3D%3D' // TODO: generate automatically
    });
    this.playerContext.innertube = this.innertube;

    this.innertube.session.on('auth-pending', (data) => {
      console.log(`\n[!] YOUTUBE LOGIN: Go to ${data.verification_url} and enter: ${data.user_code}\n`);
    });

    this.innertube.session.on('auth', (data) => {
      console.log('[Player] youtubei.js successfully authenticated.');
      fs.writeFileSync('./.ytcache/yt_auth.json', JSON.stringify(data.credentials));
    });

    this.innertube.session.on('update-credentials', (data) => {
      fs.writeFileSync('./.ytcache/yt_auth.json', JSON.stringify(data.credentials));
    });

    if (fs.existsSync('./.ytcache/yt_auth.json')) {
      const creds = JSON.parse(fs.readFileSync('./.ytcache/yt_auth.json'));
      try {
        await this.innertube.session.signIn(creds);
      } catch (e) {
        console.error("[Player] Session expired, re-authenticating...");
        await this.innertube.session.signIn();
      }
    } else {
      await this.innertube.session.signIn();
    }
  }
}

const remix = new Remix();
