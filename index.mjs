import * as fs from "fs";
import path from "path";
import { Client } from "revolt.js"
import { CommandHandler, CommandLoader, HelpHandler, PrefixManager } from "./src/CommandHandler.mjs";
import { Message, MessageHandler, PageBuilder } from "./src/MessageHandler.mjs";
import { MySqlSettingsManager } from "./src/Settings.mjs";
import { Revoice } from "revoice.js";
import { PlayerManager } from "./src/PlayerManager.mjs";
import Player from "./src/Player.mjs";
import childProcess from "node:child_process";
import { Manager } from "moonlink.js";
import { Dashboard } from "./src/dashboard/Dashboard.mjs";
import { categories } from "./src/helpCatalog.mjs";
import { LastFMManager } from "./src/LastFMManager.mjs";

export class Remix {
  constructor() {
    const config = JSON.parse(fs.readFileSync("config.json"));
    this.config = config;

    this.dashboard = new Dashboard(this, {
      mysql: config.mysql,
      ...config.dashboard,
    });

    const client = new Client({
      ...config["stoat.js"],
    });
    this.client = client;
    this.lastFm = new LastFMManager(config.lastfm, this.dashboard.db);
    this.revoice = new Revoice(config.token || config.login, config["stoat-api"] || config["revolt-api"]);
    const messages = new MessageHandler(this.client, this.revoice);
    this.messages = messages;
    const commands = new CommandHandler(messages);
    const settings = new MySqlSettingsManager(config.mysql, "./storage/defaults.json");
    this.settingsMgr = settings;
    this.handler = commands;

    const help = new HelpHandler(commands);
    help.customHelpHandler = (m) => {
      this.handleHelp(m);
    }
    commands.helpHandler = help;

    commands.setPrefixManager(new PrefixManager(settings));
    commands.onPing = (msg) => {
      msg.replyEmbed(this.handler.format("My prefix in this server is `$prefix`\n\nRun `$prefix$helpCmd` to get started!", msg.message.server.id), false, {
        icon_url: (msg.channel.channel.server.icon) ? "https://autumn.revolt.chat/icons/" + msg.channel.channel.server.icon.id : null,
        title: msg.channel.channel.server.name
      });
    }

    client.on("ready", () => {
      console.log("Logged in as " + client.user.username);
    });

    const loader = new CommandLoader(commands, this);
    const __dirname = import.meta.dirname;
    const dir = path.join(__dirname, "commands");
    console.log("Started loading commands.")
    loader.loadFromDir(dir).then(() => {
      console.log("Commands loaded.");
    });

    console.log("Loading Modules.");
    this.loadedModules = new Map();
    this.modules = JSON.parse(fs.readFileSync("./storage/modules.json"));
    Promise.all(this.modules.map(async m => {
      if (!m.enabled) return;
      const mod = { instance: (new ((await import(m.index)).default)(this)), c: (await import(m.index)).default };
      this.loadedModules.set(m.name, mod);
    })).then(() => {
      console.log("Modules loaded.");
    });

    this.observedVoiceUsers = new Map();

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

    this.nodelink = new Manager({
      nodes: this.config.nodelink.nodes,
      config: {
        clientName: "RemixStoat-Main/1.0.0"
      }
    });
    this.nodelink.init("648200414054842369").then(() => {
      console.log("NodeLink initialised");
    });

    this.playerContext = {
      voice: this.revoice,
      client: this.client,
      config,
      nodelink: this.nodelink,
    }
    this.players = new PlayerManager(this.revoice, settings, commands, this.dashboard, {
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
  /**
   * On shut down; Gracefully close voice connections and store player states to reinstate them after the restart.
   */
  close() {
    const players = this.players.close();
    // TODO:
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
    return this.players.getPlayer(message, promptJoin, verifyUser);
  }
  /**
   * @param {User} user
   * @returns {Promise<Object[]>}
   */
  getSharedServers(user) {
    return new Promise(async (res, _rej) => {
      const data = await user.fetchMutual();
      if (!data) res(null);
      var servers = data.servers.map(s => this.client.servers.get(s));

      servers = servers.map((server) => {
        const icon = () => {
          try {
            return server.animatedIconURL || server.iconURL || null
          } catch (e) {
            return null;
          }
        }
        return {
          name: server.name,
          id: server.id,
          icon: icon(),
          voiceChannels: server.channels.filter(c => c.isVoice).map(c => ({ name: c.name, id: c.id, icon: c.animatedIconURL || c.iconURL || null })) // TODO: fetch users as well
        }
      });
      res(servers);
    });
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
  /**
   *
   * @param {Message} msg
   */
  handleHelp(msg) {
    const commands = this.handler.commands.reduce((prev, curr) => {
      const cat = curr.category || "default";
      if (!prev[cat]) return prev[cat] = [curr], prev;
      prev[cat].push(curr);
      return prev;
    }, {});

    for (let c in commands) {
      commands[c] = commands[c].map((c, i) => `${i + 1}. **${c.name}** ${c.description}`);
    }

    const cats = categories.map(c => {
      const content = (c.content)
        ? c.content.map(l => this.handler.format(l, msg.channel.server.id))
        : commands[c.category];
      return {
        reaction: c.reaction,
        content: new PageBuilder(content)
          .setMaxLines(8)
          .setForm(c.form),
        title: c.title
      };
    });
    this.messages.initCatalog(cats, msg, 0);
  }
}

const remix = new Remix();

// God, please forgive us, this is just to keep the bot online at all cost
process.on("unhandledRejection", (reason, p) => {
  console.log(" [Error_Handling] :: Unhandled Rejection/Catch");
  console.log(reason, p);
});
process.on("uncaughtException", (err, origin) => {
  console.log(" [Error_Handling] :: Uncaught Exception/Catch");
  console.log(err, origin);
});
process.on("uncaughtExceptionMonitor", (err, origin) => {
  console.log(" [Error_Handling] :: Uncaught Exception/Catch (MONITOR)");
  console.log(err, origin);
});
process.on("SIGINT", () => {
  console.log("SIGINT received, storing current state");
  remix.close();
});
