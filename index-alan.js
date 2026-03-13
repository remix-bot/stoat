const { CommandHandler } = require("./Commands.js");
const Uploader = require("revolt-uploader");
const { Revoice } = require("revoice.js");
const { Client } = require("revolt.js");
const path = require("path");
const fs = require("fs");
const { SettingsManager, RemoteSettingsManager } = require("./settings/Settings.js");
if (!process.execArgv.includes("--inspect")) require('console-stamp')(console, 'HH:MM:ss.l');
const YTDlpWrap = require("yt-dlp-wrap-extended").default;

const Genius = require("genius-lyrics");
const Spotify = require("spotifydl-core").default;

let config;
if (fs.existsSync("./config.json")) {
    config = require("./config.json");
} else {
  config = {
    token: process.env.TOKEN
  };
}

class Remix {
  constructor() {
    this.client = new Client(config["revolt.js"]);
    
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 5000;
    this.reconnectTimer = null;
    this.heartbeatInterval = null;
    this.messageQueue = [];
    
    // CRITICAL: Install error suppression BEFORE anything else
    this._installGlobalErrorSuppression();
    
    this.client.on("error", () => {});
    
    this.client.config = config;
    this.config = config;
    this.modules = require("./storage/modules.json");
    this.spotifyConfig = config.spotify;
    this.announceSong = config.songAnnouncements;
    this.presenceInterval = config.presenceInterval || 7000;

    this.memberMap = new Map();
    this.userCache = [];

    this.observedUsers = new Map();
    this.observedReactions = new Map();

    this.settingsMgr = new RemoteSettingsManager(this.config.mysql, "./storage/defaults.json");

    this.uploader = new Uploader(this.client);

    this.geniusClient = new Genius.Client(this.config.geniusToken);
    this.spotify = new Spotify(this.spotifyConfig);

    this.presence = "Online";

    this.i18n = require("i18next");
    var languages = fs.readdirSync(path.join(__dirname, "./storage/locales/bot")).map(f => f.replace(".json", ""));
    languages = languages.map(l => {
      const base = l.substring(0, l.indexOf("-"));
      return (languages.includes(base)) ? [l] : [base, l];
    }).flat(1).filter(l => l.length > 0);
    this.i18n.use(require("i18next-fs-backend")).init({
      fallbackLng: "en",
      initImmediate: false,
      backend: {
        loadPath: path.join(__dirname, "storage/locales/{{ns}}/{{lng}}.json"),
        addPath: '/locales/{{ns}}/{{lng}}.missing.json'
      },
      nonExplicitSupportedLngs: true,
      supportedLngs: languages,
      preload: languages,
      ns: "bot",
    }).then(() => {
      console.log("localisation loaded");
    });

    console.log("Starting");
    console.log("Loading optional modules...");
    this.loadedModules = new Map();
    this.modules.forEach(m => {
      if (!m.enabled) return;
      const mod = { instance: new (require(m.index))(this), c: require(m.index) };
      this.loadedModules.set(m.name, mod);
    });
    console.log(`Loaded ${this.loadedModules.size} module(s): ${Array.from(this.loadedModules).map(m=>m[0]).join(", ")}`)

    this.stats = require("./storage/stats.json");

    this.client.on("ready", () => {
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 5000;
      console.log("Logged in as " + this.client.user.username);
      this._processMessageQueue();
    });
    
    this.client.on("disconnected", () => {
      console.log("[Client] Disconnected from WebSocket");
      this.isConnected = false;
      this.isConnecting = false;
      this.scheduleReconnect();
    });
    
    this.client.on("dropped", () => {
      console.log("[Client] Connection dropped");
      this.isConnected = false;
      this.isConnecting = false;
      this.scheduleReconnect();
    });
    
    this.client.once("ready", () => {
      let state = 0;
      let def = ["Ping for prefix", "By RedTech | NoLogicAlan", "Servers: $serverCount"];
      let texts = config.presenceContents || def;
      if (texts.length == 0) texts = def;
      
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      
      this.heartbeatInterval = setInterval(() => {
        if (!this.isConnected || !this.client.user) return;
        if (!this._isWebSocketReady()) return;
        
        try {
          this.client.user.edit({
            status: {
              text: texts[state].replace(/\$serverCount/g, this.client.servers.size),
              presence: this.presence
            },
          }).catch(() => {});
          
          if (state == texts.length - 1) {state = 0} else {state++}
        } catch (err) {
          // Ignore
        }
      }, this.presenceInterval);

      if (!this.config.fetchUsers) return;
      this.fetchUsers();
      
      if (this.fetchInterval) clearInterval(this.fetchInterval);
      this.fetchInterval = setInterval(() => {
        if (this.isConnected) this.fetchUsers();
      }, 60 * 1000 * 30);
    });
    
    this.client.on("messageCreate", (m) => {
      if (!this.isConnected) return;
      if (!this.observedUsers.has(m.authorId + ";" + m.channelId)) return;
      this.observedUsers.get(m.authorId + ";" + m.channelId)(m);
    });
    
    const reactionUpdate = (message, user, emoji) => {
      if (!this.isConnected) return;
      const event = { user_id: user, emoji_id: emoji };
      if (!this.observedReactions.has(message.id)) return;
      if (!this.client.user || event.user_id == this.client.user.id) return;
      const observer = this.observedReactions.get(message.id);
      if (!observer.r.includes(event.emoji_id)) return;
      if (observer.user) if (observer.user != user) return;
      observer.cb(event, message);
    }
    this.client.on("messageReactionAdd", reactionUpdate);
    this.client.on("messageReactionRemove", reactionUpdate);
    this.client.on("serverMemberJoin", (member) => {
      if (!this.isConnected) return;
      const data = this.memberMap.get(member.server.id);
      if (!data) return;
      data.push(member.id.user);
      this.memberMap.set(member.server.id, data);

      const user = member.user;
      if (this.userCache.findIndex(e => e.id === user.id) !== -1) return;
      this.userCache.push({ id: user.id, name: user.username, discrim: user.discriminator})
    });
    this.client.on("serverCreate", (server) => {
      if (!this.isConnected) return;
      console.log("Mapping " + server.id);
      server.fetchMembers().then(members => {
        this._mapServer(members);
      });
    });
    this.client.on("serverDelete", (server) => {
      if (!this.isConnected) return;
      if (!this.memberMap.has(server.id)) return;
      console.log("Deleting " + server.id);
      this.memberMap.delete(server.id);
    })
    this.client.on("serverMemberLeave", (member) => {
      if (!this.isConnected) return;
      const data = this.memberMap.get(member.id.server);
      if (!data) return;
      const idx = data.findIndex(e => e == member.id.user);
      if (idx == -1) return;
      data.splice(idx, 1);
      this.memberMap.set(member.id.server, data);
    });

    console.log("Loading command files...");
    this.handler = new CommandHandler(this.client, config.prefix);
    this.handler.setReplyHandler((t, msg) => {
      if (!this.isConnected) return;
      msg.reply(this.em(t, msg), false).catch(() => {});
    });
    this.handler.addOwners(...(this.config.owners || ["01G9MCW5KZFKT2CRAD3G3B9JN5"]));
    this.handler.setRequestCallback((...data) => this.request(...data));
    this.handler.setOnPing(msg => {
      if (!this.isConnected) return;
      let pref = this.handler.getPrefix(msg.channel.serverId);
      let m = this.iconem(msg.channel.server.name, this.t("commands.ping", msg, {prefix: "`" + pref + "`", helpCmd: "`" + pref + "help`"}), (msg.channel.server.icon) ? "https://autumn.revolt.chat/icons/" + msg.channel.server.icon._id : null, msg);
      msg.reply(m, false).catch(() => {});
    });
    this.handler.setPaginationHandler((message, form, contents) => {
      if (!this.isConnected) return;
      this.pagination(form, contents, message, 8);
    });
    this.handler.setHelpHandler((commandData, msg) => {
      if (!this.isConnected) return;
      this.handleHelp(commandData, msg);
    });
    this.handler.setTranslationHandler((key, message, options) => {
      return this.t(key, message, options);
    });
    this.handler.enableHelpPagination(this.config.helpPagination);
    this.handler.enableCustomHelpHandling(this.config.helpCatalog);
    const dir = path.join(__dirname, "commands");
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
    this.runnables = new Map();
    this.commandFiles = new Map();

    files.forEach(commandFile => {
      const file = path.join(dir, commandFile);
      const cData = require(file);
      const builder = (typeof cData.command == "function") ? cData.command.call(this) : cData.command;
      if (!builder) return console.warn("No builder returned. Skipping '" + commandFile + "'");
      if (cData.export) this[cData.export.name] = cData.export.object;
      this.handler.addCommand(builder);
      this.commandFiles.set(builder.uid, file);
      if (cData.run) {
        this.runnables.set(builder.uid, cData.run);
        builder.subcommands.forEach(sub => {
          this.runnables.set(sub.uid, cData.run);
        });
      }
    });
    this.handler.on("run", (data) => {
      if (!this.isConnected) {
        data.message.reply({ content: "Bot is reconnecting, please wait..." }).catch(() => {});
        return;
      }
      if (this.runnables.has(data.command.uid)) {
        const runFc = this.runnables.get(data.command.uid);
        
        try {
          const result = runFc.call(this, data.message, data);
          if (result && typeof result.then === "function") {
            return result.catch(e => {
              const id = this.guid();
              console.log("Error running command; error id #" + id, e);
              data.message.reply({ content: null, embeds: [this.embedify("An error occured. If this happens frequently, please contact the developers!\n\nError id: `#" + id + "`", "red")]});
            });
          }
        } catch(e) {
          const id = this.guid();
          console.log("Error running command; error id #" + id, e);
          data.message.reply({ content: null, embeds: [this.embedify("An error occured. If this happens frequently, please contact the developers!\n\nError id: `#" + id + "`", "red")]});
        }
      }
    });
    console.log("Done!\n");

    if (process.argv[2] == "usage") {
      fs.writeFile("cmdUsage.md", this.handler.generateCommandOverviewMD(),()=>{ console.log("Done!"); process.exit(0) });
    } else if (process.argv[2] == "sreload") {
      this.settingsMgr.syncDefaults();
      this.settingsMgr.save();
    }

    this.revoice = new Revoice(config.token || config.login, config["revolt-api"]);
    
    this.revoice.on("error", () => {});

    this.observedVoiceUsers = new Map();

    if (!fs.existsSync("./bin")) fs.mkdirSync("./bin");
    const ytdlPath = path.join(__dirname, "./bin/ytdlp.bin");
    this.ytdlpReady = false;
    this.ytdlpQueue = [];
    
    const initYtdlp = () => {
      this.ytdlp = new YTDlpWrap(ytdlPath);
      this.ytdlpReady = true;
      this.ytdlpQueue.forEach(cb => cb());
      this.ytdlpQueue = [];
    };
    
    if (!fs.existsSync(ytdlPath)) {
      console.log("Downloading yt-dlp binaries.");
      YTDlpWrap.downloadFromGithub(ytdlPath).then(() => {
        console.log("Finished downloading yt-dlp binaries.");
        initYtdlp();
      }).catch(err => {
        console.error("Failed to download yt-dlp:", err);
      });
    } else {
      initYtdlp();
    }

    try {
      this.comHash = require('child_process')
          .execSync('git rev-parse --short HEAD', {cwd: __dirname})
          .toString().trim();
      this.comHashLong = require('child_process')
          .execSync('git rev-parse HEAD', {cwd: __dirname})
          .toString().trim();
    } catch(e) {
      console.log("Git comhash error");
      this.comHash = "Newest";
      this.comHashLong = null;
    }

    this.comLink = (this.comHashLong) ? "https://github.com/remix-bot/revolt/tree/" + this.comHashLong : "https://github.com/remix-bot/revolt";
    this.playerMap = new Map();
    this.currPort = -1;
    this.channels = [];
    this.freed = [];

    this.doLogin();

    Object.defineProperty(this.client, "allServers", {
      get: function() {
        var servers = [];
        var iterator = this.servers.entries();
        for (let v = iterator.next(); !v.done; v = iterator.next()) {
          servers.push(v.value[1]);
        };
        return servers
      }
    });

    return this;
  }
  
  // BULLETPROOF: Suppress ALL errors during connection instability
  _installGlobalErrorSuppression() {
    const suppressedPatterns = [
      /unreachable code/i,
      /connecting state/i,
      /sent before connected/i,
      /invalidstateerror/i,
      /websocket/i,
      /socket closed/i,
      /trying to send/i,
      /readyState/i,
      /connection was closed/i,
      /network error/i,
      /non-101 status/i,
      /fetch failed/i,
      /EAI_AGAIN/i,
      /getaddrinfo/i,
      /stoat\.chat/i,
      /ETIMEDOUT/i,
      /ECONNREFUSED/i,
      /ECONNRESET/i,
      /EPIPE/i
    ];
    
    const isSuppressed = (err) => {
      if (!err) return true;
      
      const msg = String(err.message || err.toString?.() || err);
      if (suppressedPatterns.some(p => p.test(msg))) return true;
      
      if (err.cause) {
        const causeMsg = String(err.cause.message || err.cause.toString?.() || err.cause);
        if (suppressedPatterns.some(p => p.test(causeMsg))) return true;
        if (err.cause.code && suppressedPatterns.some(p => p.test(err.cause.code))) return true;
      }
      
      if (err.code && suppressedPatterns.some(p => p.test(err.code))) return true;
      
      return false;
    };
    
    const handlers = ['uncaughtException', 'uncaughtExceptionMonitor', 'unhandledRejection'];
    
    handlers.forEach(event => {
      process.removeAllListeners(event);
      
      process.on(event, (err, origin) => {
        if (isSuppressed(err)) {
          return;
        }
        
        console.log(` [Error_Handling] :: ${event}`);
        console.log(err);
        
        if (err?.code === 'EADDRINUSE' || err?.code === 'EACCES') {
          process.exit(1);
        }
      });
    });
  }
  
  _isWebSocketReady() {
    try {
      const eventClient = this.client.events || this.client.ws;
      if (!eventClient) return false;
      const ws = eventClient.ws || eventClient.socket;
      return ws && ws.readyState === 1;
    } catch (e) {
      return false;
    }
  }
  
  _processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const { method, args } = this.messageQueue.shift();
      try {
        method(...args);
      } catch (err) {
        // Ignore
      }
    }
  }
  
  async doLogin() {
    if (this.isConnecting) {
      console.log("[Login] Already connecting, skipping duplicate attempt");
      return;
    }
    if (this.isConnected) {
      console.log("[Login] Already connected, skipping");
      return;
    }
    
    this.isConnecting = true;
    this.reconnectAttempts++;
    console.log(`[Login] Attempt ${this.reconnectAttempts}...`);
    
    try {
      if (config.token) {
        await this.client.loginBot(config.token);
      } else {
        await this.client.login(config.login);
      }
    } catch (err) {
      this.isConnecting = false;
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }
  
  scheduleReconnect() {
    if (this.isConnecting) return;
    if (this.reconnectTimer) return;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, Math.min(this.reconnectAttempts, 20)), 60000);
    console.log(`[Reconnect] Scheduling attempt ${this.reconnectAttempts + 1} in ${Math.round(delay/1000)}s...`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doLogin();
    }, delay);
  }
  
  static sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }
  
  async fetchUsers() {
    if (!this.isConnected) return;
    const promises = [];
    for (const server of this.client.servers) {
      promises.push(server[1].fetchMembers());
    }

    await Promise.allSettled(promises);
    console.log(this.client.users.size);
  }
  
  _mapServer(members) {
    if (!members) return;
    const users = members.users;
    members = members.members;
    if (!members || members.length === 0) return;
    const server = members[0].server.id;
    members = members.map(m => m.id.user);
    this.memberMap.set(server, members);
    users.forEach(user => {
      if (this.userCache.findIndex(e => e.id === user.id) !== -1) return;
      this.userCache.push({ id: user.id, name: user.username, discrim: user.discriminator})
    });
  }

  util = {
    mapToArray(map) {
      const iterator = map.entries();
      const arr = []
      for (const value of iterator) {
        arr.push(value);
      }
      return arr;
    },
    connectionsByType: function(connections) {
      this.mapToArray(connections).map(e => e[1] = e[1][0]);
    }
  }

  guid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  mapMembers() {
    return new Promise(async res => {
      if (!this.config.mapMembers) return res();
      const evaluate = (data) => {
        data = data.map(v => v.value);
        data.forEach(members => {
          this._mapServer(members);
        });
      }

      const promises = [];
      const servers = this.client.allServers;
      console.log("Started mapping server members");
      for (let i = 0; i < servers.length; i++) {
        if (i % 30 === 0 && i !== 0) {
          evaluate(await Promise.allSettled(promises));
          console.log("Mapped " + Math.round((i / servers.length * 100)) + "%")
          promises.length = 0;
          await Remix.sleep(1200);
        }
        promises.push(servers[i].fetchMembers());
      }
      if (promises.length !== 0) evaluate(await Promise.allSettled(promises));
      console.log("Finished mapping server members!");
      res();
    });
  }
  
  mutualServers(user) {
    const iterator = this.memberMap.entries();
    const mutual = [];
    for (let v = iterator.next(); !v.done; v = iterator.next()) {
      if (v.value[1].includes(user)) mutual.push(v.value[0]);
    }
    return mutual;
  }
  
  getSharedServers(user) {
    return new Promise(async (res, _rej) => {
      try {
        const data = await user.fetchMutual();
        if (!data || !data.servers) return res(null);
        var servers = data.servers.map(s => this.client.servers.get(s)).filter(s => s);

        servers = servers.map((server) => {
          const icon = () => {
            try {
              return server.animatedIconURL || server.iconURL || null
            } catch(e) {
              return null;
            }
          }
          return {
            name: server.name,
            id: server.id,
            icon: icon(),
            voiceChannels: server.channels.filter(c => c.type == "VoiceChannel").map(c => ({ name: c.name, id: c.id, icon: c.animatedIconURL || c.iconURL || null }))
          }
        });
        res(servers);
      } catch (err) {
        res(null);
      }
    });
  }
  
  getVoiceData(server) {
    return new Promise(async res => {
      server = this.client.servers.get(server);
      if (!server) return res(false);
      const channels = server.channels.filter(c => c.type == "VoiceChannel")
      res(channels.map(c => {
        const con = this.revoice.getVoiceConnection(c.id);
        const data = {
          name: c.name,
          id: c.id,
          users: (con || { users: [] }).users
        }
        data.users = data.users.map(u => this.client.users.get(u.id) || u).map(u => ({ name: u.username, id: u.id, avatar: u.avatarURL }))
        return data;
      }));
    });
  }
  
  request(d) {
    switch(d.type) {
      case "prefix":
        return this.settingsMgr.getServer(d.data.channel.serverId).get("prefix");
      default:
        return null;
    }
  }
  
  checkVoiceChannels(message) {
    if (!message) return null;
    const user = message.authorId;
    var id = null;
    message.channel.server.channels.forEach((c) => {
      if (!c.isVoice) return;
      if (!c.voiceParticipants.has(user)) return;
      id = c.id;
    });
    return id;
  }
  
  joinChannel(message, channelId, onSuccess, onError) {
    return new Promise(async (res, rej) => {
      try {
        const connection = await this.revoice.join(channelId);
        connection.on("error", () => {});
        
        const player = new (require("./Player.js"))(connection, this);
        this.playerMap.set(channelId, player);
        
        connection.on("disconnect", () => {
          this.playerMap.delete(channelId);
        });
        
        if (onSuccess) onSuccess(player);
        res(player);
      } catch (err) {
        if (onError) onError(err);
        rej(err);
      }
    });
  }
  
  getPlayer(message, promptJoin=true, verifyUser=true) {
    var askVC = (msg) => {
      return new Promise(res => {
        if (msg.channel.type === "Group") {
          return this.joinChannel(msg, msg.channel.id, (p) => {
            if (!p.connection.users.find(u => u.id == message.author.id)) {
              msg.reply(this.em("You don't seem to be connected to <#" + msg.channel.id + ">. Did you forget to join?", msg), true).catch(() => {});
            }
            res(msg.channel.id);
          }, () => { 
            msg.reply(this.em("Something went wrong. Unable to join <#" + msg.channel.id + ">. Do I have the needed permission?", msg)).catch(() => {}); 
            return res(false); 
          });
        }
        const channels = msg.channel.server.channels.filter(c => c.isVoice);
        if (channels.length != 0) {
          var channelSelection = "Please select one of the following channels by clicking on the reactions below\n\n";
          var reactions = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
          channels.slice(0, 9).forEach((c, i) => {
            channelSelection += (i + 1) + ". <#" + c.id + ">\n";
          });
        }
        const mObj = this.em(((channelSelection) ? channelSelection + "\n**..or**" : "Please") + " send a message with the voice channel! (Mention/Id/Name)\nSend 'x' to cancel.", msg);
        if (channels.length != 0) {
          mObj.interactions = {
            restrict_reactions: true,
            reactions: reactions.slice(0, Math.min(channels.length, 9))
          }
        }
        var roid;
        var observer;
        msg.reply(mObj, false).then(m => {
          roid = this.observeReactions(m, reactions, (e) => {
            const idx = reactions.findIndex(r => r == e.emoji_id);
            const c = channels[idx];
            this.joinChannel(msg, c.id, (p) => {
              if (!p.connection.users.find(u => u.id == message.author.id)) {
                msg.reply(this.em("You don't seem to be connected to <#" + c.id + ">. Did you forget to join?", msg), true).catch(() => {});
              }
              res(c.id);
            }, () => { 
              m.edit(this.em(this.t("voice.join.error.perms", m, {channel: "<#" + c.id + ">"}), m)).catch(() => {}); 
              return res(false); 
            });

            this.unobserveUser(observer);
            this.unobserveReactions(roid);
          }, msg.author);
        }).catch(() => {});
        const join = (msg) => {
          observer = this.observeUser(msg.authorId, msg.channelId, (m) => {
            if (m.content.toLowerCase() == "x") {
              this.unobserveUser(observer);
              this.unobserveReactions(roid);
              m.reply(this.em(this.t("voice.join.cancelled", m), m), false).catch(() => {});
              return res(false);
            }
            if (!this.handler.validateString(m.content, m, "voiceChannel")) {
              m.reply(this.em(this.t("voice.join.error.invalid", m), m), false).catch(() => {});
              return;
            }
            const channel = this.handler.formatString(m.content, m, "voiceChannel");
            this.unobserveUser(observer);
            this.unobserveReactions(roid);
            this.joinChannel(m, channel, (p) => {
              if (!p.connection.users.find(u => u.id == message.author.id)) {
                msg.reply(this.em("You don't seem to be connected to <#" + channel + ">. Did you forget to join?", msg), true).catch(() => {});
              }
              res(channel);
            }, () => { join(msg); });
          });
        }
        join(msg);
      });
    }
    return new Promise(async res => {
      const user = this.revoice.getUser(message.authorId)?.user;
      var cid = (user) ? user.connectedTo : null;
      if (message.channel.type === "Group") cid = message.channel.id;
      if (!cid) {
        cid = this.checkVoiceChannels(message);
      }
      var player = this.playerMap.get(cid);
      if (!player && cid) {
        await (new Promise((r => {
          this.joinChannel(message, cid, (p) => {
            if (!p.connection.users.find(u => u.id == message.author.id)) {
              message.reply(this.em("You don't seem to be connected to <#" + cid + ">. Did you forget to join?", message), true).catch(() => {});
            }
            r(cid);
          }, () => { 
            message.reply("Something went wrong while trying to join your channel. Maybe try the join command manually.").catch(() => {});
            r(false);
          });
        })));
        player = this.playerMap.get(cid);
        return res(player);
      }
      
      const shouldVerify = verifyUser ? !!user : true;
      if (!shouldVerify || !cid || !player) {
        if (!promptJoin) {
          message.reply(this.em(this.t("voice.join.error.dc", message), message), false).catch(() => {});
          return res(false);
        }
        var success = await askVC(message);
        if (!success) return res(null);
        cid = success;
      }
      player = this.playerMap.get(cid);
      return res(player);
    });
  }
  
  observeUserVoice(user, cb) {
    const cid = Math.random();
    const arr = (this.observedVoiceUsers.get(user) || []);
    arr.push({ cid, cb});
    this.observedVoiceUsers.set(user, arr);
    return user + ";" + cid;
  }
  
  unobserveUserVoice(i) {
    const user = i.split(";")[0];
    const cid = i.split(";")[1];
    if (!this.observedVoiceUsers.has(user)) return;
    const a = this.observedVoiceUsers.get(user);
    const idx = a.findIndex(e => e.cid == cid);
    if (idx == -1) return;
    a.splice(idx, 1);
    if (a.length == 0) return this.observedVoiceUsers.delete(user);
    this.observedVoiceUsers.set(user, a);
  }
  
  t(key, language, options) {
    if (typeof language === "object" && language !== null) {
      const settings = this.getSettings(language);
      language = settings.get("locale");
    }
    return this.i18n.t(key, { ...options, lng: language });
  }
  
  getSettings(message) {
    const serverId = message.channel?.serverId;
    if (!serverId) return { get: (k) => this.config.defaults?.[k] || null };
    return this.settingsMgr.getServer(serverId);
  }
  
  observeUser(id, channel, cb) {
    const key = id + ";" + channel;
    this.observedUsers.set(key, cb);
    
    setTimeout(() => {
      this.observedUsers.delete(key);
    }, 5 * 60 * 1000);
    
    return key;
  }
  
  unobserveUser(i) {
    return this.observedUsers.delete(i);
  }
  
  observeReactions(msg, reactions, cb, user) {
    this.observedReactions.set(msg.id, { r: reactions, user: (user) ? user.id : null, cb });
    
    setTimeout(() => {
      this.observedReactions.delete(msg.id);
    }, 10 * 60 * 1000);
    
    return msg.id;
  }
  
  unobserveReactions(i) {
    return this.observedReactions.delete(i);
  }

  paginate(text, maxLinesPerPage=5, page=0) {
    page -= 1;
    const lines = text.split("\n");
    return lines.slice(maxLinesPerPage * page, maxLinesPerPage * page + maxLinesPerPage);
  }
  
  pages(text, maxLinesPerPage=2) {
    const lines = (Array.isArray(text)) ? text : text.split("\n");
    const pages = [];
    for (let i = 0, n = 0; i < lines.length; i++, (i % maxLinesPerPage == 0) ? n++ : n) {
      let line = lines[i];
      if (!pages[n]) pages[n] = [];
      pages[n].push(line);
    }
    return pages;
  }
  
  pagination(form, content, message, maxLinesPerPage=2) {
    if (!message.channel.havePermission("React")) {
      if (!message.channel.havePermission("SendMessage")) {
        return message.member?.user?.openDM().then(dm => {
          dm.sendMessage({ content: " ", embeds: [this.embedify("I am unable to send messages in <#" + message.channelId + ">. Please contact a server administrator and grant me the \"SendMessage\" permission.")]})
        }).catch(() => {});
      }
      return message.reply({ content: " ", embeds: [this.embedify("I need reaction permissions to work. Please contact a server administrator to address this.")] }, true).catch(() => {});
    }
    const arrows = [ "⬅️", "➡️" ];
    var page = 0;
    const paginated = this.pages(content, maxLinesPerPage);
    form = form.replace(/\$maxPage/gi, paginated.length);

    var lastEmbed;
    var messageFormatter = (t) => {
      lastEmbed = this.embedify(form.replace(/\$currPage/gi, page + 1).replace(/\$content/gi, t));
      return {
        embeds: [
          lastEmbed
        ]
      }
    }

    message.reply({
      content: " ",
      ...messageFormatter(paginated[0].join("\n")),
      interactions: {
        restrict_reactions: true,
        reactions: arrows
      }
    }, false).then(m => {
      const oid = this.observeReactions(m, arrows, (e, ms) => {
        if (paginated.length == 1) return;
        let change = (e.emoji_id == arrows[0]) ? -1 : 1;
        if (page + change < 0) page = paginated.length - 1, change = 0;
        if (!paginated[page + change]) page = 0, change = 0;
        page += change;
        const c = paginated[page].join("\n");
        ms.edit(messageFormatter(c));
        clearTimeout(currTime);
        currTime = setTimeout(() => { finish() }, 60*1000);
      });
      const finish = () => {
        this.unobserveReactions(oid);
        m.edit({
          content: this.t("pagination.embed.sclosedTitle", m),
          embeds: [
            this.embedify(this.t("pagination.embed.sclosedContent", m, { content: lastEmbed.description, interpolation: { escapeValue: false }}), "red")
          ]
        });
      }
      var currTime = setTimeout(() => { finish() }, 60*1000);
    }).catch(() => {});
  }
  
  reactionCollector(msg, reactions, onReaction=()=>{}, time=60*1000, finishCb=()=>{}) {
    var timer = setTimeout(() => finish(), time);
    const oid = this.observeReactions(msg, reactions, (e, msg) => {
      onReaction(e, msg);
      clearTimeout(timer);
      timer = setTimeout(() => finish(), time);
    });
    const finish = () => {
      this.unobserveReactions(oid);
      finishCb();
    }
  }
  
  catalog(msg, categories, defaultPage=0, maxLinesPerPage) {
    const reactions = categories.map(c => c.reaction);
    const pages = categories.map(c => this.pages(c.content, maxLinesPerPage));
    const forms = categories.map(c => c.form);
    const titles = categories.map(c => c.title);

    const arrows = ["⬅️", "➡️"];
    const rs = [...reactions, ...arrows];
    var currPage = 0;
    var currCat = defaultPage;
    var lastEmbed;

    const messageFormatter = (t) => {
      lastEmbed = this.embedify(forms[currCat].replace(/\$currPage/gi, currPage + 1).replace(/\$maxPage/gi, pages[currCat].length).replace(/\$content/gi, t));
      lastEmbed.title = titles[currCat];
      return {
        embeds: [
          lastEmbed
        ]
      }
    }

    msg.reply({
      content: " ",
      ...messageFormatter(pages[defaultPage][0].join("\n")),
      interactions: {
        restrict_reactions: true,
        reactions: rs
      }
    }).then(m => {
      this.reactionCollector(m, rs, (e) => {
        if (arrows.includes(e.emoji_id)) {
          if (pages[currCat].length == 1) return;
          let change = (e.emoji_id == arrows[0]) ? -1 : 1;
          if (currPage + change < 0) currPage = pages[currCat].length - 1, change = 0;
          if (!pages[currCat][currPage + change]) currPage = 0, change = 0;
          currPage += change;
          const c = pages[currCat][currPage].join("\n");
          m.edit(messageFormatter(c));
          return;
        }
        const i = reactions.indexOf(e.emoji_id);
        currCat = i;
        currPage = 0;
        m.edit(messageFormatter(pages[i][0].join("\n")));
      }, 60*1000, () => {
        m.edit({
          content: this.t("pagination.embed.sclosedTitle", m),
          embeds: [
            this.embedify(this.t("pagination.embed.sclosedContent", m, { content: lastEmbed.description, interpolation: { escapeValue: false }}), "red")
          ]
        });
      });
    }).catch(() => {})
  }

  handleHelp(data, msg) {
    const commands = data.reduce((prev, curr) => {
      if (!prev[curr.command.category]) prev[curr.command.category] = [];
      prev[curr.command.category].push(curr);
      return prev;
    }, {});

    for (let c in commands) {
      commands[c] = commands[c].map((c, i) => `${i + 1}. ${c.description}`);
    }

    const pref = this.handler.getPrefix(msg.channel.serverId);
    const categories = [{
      reaction: "🏠",
      content: [`# Home\n\nWelcome to Remix' help.\nRemix is Revolt's first open-source music bot. It supports a variety of streaming services and has many features, with one of the newest being the [Web Dashboard](https://remix.fairuse.org/).\n\nWe hope you enjoy using Remix!\n\nTo get started, just click on the reactions below to find more about the commands.\nIn the case that reactions don't work for you, there's also the possiblity to look through them by using \`${pref}help <page number>\` :)`],
      form: "$content\n\n###### Page $currPage/$maxPage",
      title: "Home Page"
    }, {
      reaction: "🎵",
      content: commands.default || [],
      form: `# Music\n\n$content\n\nTo learn more about a command, run \`${pref}help <command name>\`!\n\nTip: You can use the arrows beneath this message to turn pages, or use \`${pref}help <page number>\` to access a certain page.\n\n###### Page $currPage/$maxPage`,
      title: "Music Commands"
    }, {
      reaction: "ℹ️",
      content: commands.util || [],
      form: `# Utilities\n\n$content\n\nTo learn more about a command, run \`${pref}help <command name>\`!\n\nTip: You can use the arrows beneath this message to turn pages, or use \`${pref}help <page number>\` to access a certain page.\n\n###### Page $currPage/$maxPage`,
      title: "Utility Commands"
    }, {
      reaction: "💻",
      content: [`If you need help with anything or encounter any issues, hop over to our support server [Remix HQ](/invite/Remix)!\n\nAlternatively, you can write a dm to any of the following people:\n- <@01FZ5P08W36B05M18FP3HF4PT1> (Community Manager & Developer)\n- <@01FVB1ZGCPS8TJ4PD4P7NAFDZA> (Revolt & Discord Bot Developer)\n- <@01G9MCW5KZFKT2CRAD3G3B9JN5> (Lead Developer)`],
      form: "# Support\n\n$content\n\n###### Page $currPage/$maxPage",
      title: "Support Info"
    }];
    this.catalog(msg, categories, 0, 8)
  }

  embedify(text = "", color = "#e9196c") {
    return {
      type: "Text",
      description: "" + text,
      colour: color,
    }
  }
  
  masquerade(msg) {
    let a;
    try {
      a = this.getSettings(msg).get("pfp");
    } catch(e) {
      a = "default";
    }
    let avatar = null;
    if (a == "dark") {
      avatar = "https://autumn.revolt.chat/avatars/xkTqA-n4CDX6_DIwaQJSIy2B1mYpBQRH0iM2dyIscR";
    } else if (a == "light") {
      avatar = "https://autumn.revolt.chat/attachments/R8H83bujBVaWxRZr1AYtFX7PEW27CVw3_zaynkwqNq/light-remix2.jpeg";
    } else if (a == "mono") {
      avatar = "https://autumn.revolt.chat/attachments/3Pxsbb6mhD_d9pxxrd0osbWKmI5kat0hg4fq4EUJGK/light-remix.jpeg";
    } else if (a != "default") {
      avatar = a;
    }
    return (avatar) ? {
      name: "Remix",
      avatar: avatar
    } : null;
  }
  
  em(text, msg) {
    return {
      content: " ",
      embeds: [this.embedify(text)],
      masquerade: this.masquerade(msg)
    }
  }
  
  iconem(title, text, img, m) {
    let e = this.embedify(text);
    e.icon_url = img;
    e.title = title;
    return {
      content: " ",
      embeds: [e],
      masquerade: this.masquerade(m)
    }
  }
  
  isNumber(n) {
    return !isNaN(n) && !isNaN(parseFloat(n));
  }
  
  prettifyMS(milliseconds) {
    const roundTowardsZero = milliseconds > 0 ? Math.floor : Math.ceil;

  	const parsed = {
  		days: roundTowardsZero(milliseconds / 86400000),
  		hours: roundTowardsZero(milliseconds / 3600000) % 24,
  		minutes: roundTowardsZero(milliseconds / 60000) % 60,
  		seconds: roundTowardsZero(milliseconds / 1000) % 60,
  		milliseconds: roundTowardsZero(milliseconds) % 1000,
  		microseconds: roundTowardsZero(milliseconds * 1000) % 1000,
  		nanoseconds: roundTowardsZero(milliseconds * 1e6) % 1000
  	};

    const units = {
      days: "d",
      hours: "h",
      minutes: "m",
      seconds: "s"
    }

    var result = "";
    for (let k in parsed) {
      if (!parsed[k] || !units[k]) continue;
      result += " " + parsed[k] + units[k];
    }
    return result.trim();
  }
}

new Remix();

// Final safety net
process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});
process.on("uncaughtExceptionMonitor", () => {});