const express = require('express');
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const mysql = require("mysql");
const bcrypt = require("bcrypt");
const { Server } = require("socket.io");
const yts = require("yt-search");
const { Innertube } = require("youtubei.js");
const ios = require('socket.io-express-session');

class Dashboard {
  port;
  remix;
  expiryTime = 1000 * 60 * 60 * 6; // 6 hours
  observedPlayers = new Map();
  yt = Innertube.create();
  constructor(remix) {
    const http = require('http' + ((remix.config.ssl.useSSL) ? "s" : ""));
    const app = express();
    var server;
    if (remix.config.ssl.useSSL) {
      server = http.createServer({
        key: fs.readFileSync(remix.config.ssl.private),
        cert: fs.readFileSync(remix.config.ssl.cert)
      }, app);
    } else {
      server = http.createServer(app);
    }

    if (remix.config.ssl.useSSL) {
      const httpServer = express();
      httpServer.get("*", function(req, res) {
        res.redirect('https://' + req.headers.host + req.url);
      });

      httpServer.listen(remix.config.ssl.httpPort);
    }

    this.port = remix.config.webPort || 80;
    server.listen(this.port, () => {
      console.log("Listening on port " + this.port);
    });
    this.remix = remix;

    this.db = mysql.createPool({
      connectionLimit : 15,
      ...this.remix.config.mysql
    });

    const ses = session({
      secret: remix.config.sessionSecret || this.guid(),
      resave: false,
      secure: !!remix.config.ssl.useSSL,
      saveUninitialized: false
    });
    const io = new Server(server);
    io.use(ios(ses));
    io.on("connection", (socket) => this.socketHandler(socket));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, "/static")));
    app.use(cookieParser());
    app.use(ses);
    app.use(async (req, _res, next) => {
      if (!req.session.user || !req.session.verified) {
        if (!(await this.verifySession(req.session, req.cookies))){
          req.data = {}; return next();
        }
      }
      req.data = {
        user: remix.client.users.get(req.session.user),
      }
      next();
    });

    app.set("view engine", "ejs");
    app.set("views", [path.join(__dirname, "views")]);
    app.get("/", (req, res) => {
      // TODO: implement ejs system (maybe)
      res.render("index.ejs", { ...req.data, serverCount: this.remix.client.servers.size() });
    });
    app.get("/login", async (req, res) => {
      if (await this.verifySession(req.session, req.cookies)) return res.redirect("/dashboard");
      const opts = (!req.session.verified) ? { id: req.session.tId, token: req.session.token, ...req.data} : req.data;
      opts.prefix = remix.config.prefix;
      res.render("login/index.ejs", opts);
    });

    this.commands = null;
    this.commandsRaw = null;
    app.get("/commands", (req, res) => {
      this.commands ||= this.remix.handler.commands.map(c => {
        return {
          name: c.name,
          description: c.description,
          usage: this.remix.handler.genCmdUsage(c),
          aliases: c.aliases
        }
      });
      res.render("commands/index.ejs", { ...req.data, commands: this.commands });
    });
    app.get("/commands/help", (req, res) => {
      this.commandsRaw ||= remix.handler.commands;
      res.render("commands/help.ejs", { ...req.data, commands: this.commandsRaw, prefix: remix.config.prefix });
    });
    app.post("/api/cmd/eval", (req, res) => {
      const args = req.body.args;
      const command = this.remix.handler.commands.find(c => c.uid == req.body.id);
      const msg = {
        channel: {
          serverId: "eval"
        }
      }

      console.log(command);
      const cmd = this.remix.handler.processCommand(command, args, msg, false, true);
      console.log(cmd);
      res.send({ success: typeof cmd === "object", message: (typeof cmd === "string") ? cmd : "ok" });
    });

    const getUserId = async (d) => {
      if (d.includes("#")) { // username with disciriminator
        const name = d.slice(0, d.indexOf("#"));
        const discriminator = d.slice(d.indexOf("#") + 1, d.length);
        const user = this.remix.userCache.find(u => u.name == name && u.discrim == discriminator) || this.remix.client.users.find(u => u.username == name && u.discriminator == discriminator);
        if (!user || user === -1) return null;
        return user.id;
      }
      if (d.length !== 26) return null; // too short
      if (!d.match(/[0-9A-Z]{26}/g)) return null;
      try {
        if (!(this.remix.client.users.get(d) || await this.remix.client.users.fetch(d))) return null;
      } catch(e) {
        if (e.response.status !== 404) console.log(e);
        return null;
      }
      return d;
    }
    app.post("/api/login", async (req, res) => {
      const user = await getUserId(req.body.user);
      if (!user) {
        return res.status(400).send({ message: "Invalid user data" });
      }
      const r = await this.createLogin(user, req);
      req.session.user = user;
      req.session.token = r.token;
      req.session.tId = r.id;
      res.send(JSON.stringify({ id: r.id, token: r.token }));
    });
    app.post("/api/login/verify", async (req, res) => {
      const v = await this.verifySession(req.session, req.cookies, req);
      if (v && req.body.ksi) {
        const r = await this.createKsiSession(req.session.user);
        res.cookie("ksiId", r.id, { maxAge: 1000 * 60 * 60 * 24 * 62 });
        res.cookie("ksiToken", r.token, { maxAge: 1000 * 60 * 60 * 24 * 62 });
      }
      if (v) req.session.verified = true;
      res.send(JSON.stringify(v));
    });

    app.get("/logout", async (req, res) => {
      if (req.session.tId) {
        try {
          await this.query("DELETE FROM logins WHERE id=" + this.db.escape(req.session.tId) + " AND user=" + this.db.escape(req.session.user));
        } catch(e) {
          console.log("delete failed", e);
        }
      }
      req.session.user = null;
      req.session.tId = null;
      req.session.token = null;
      req.session.verified = false;
      if (req.cookies.ksiId) {
        await this.query("DELETE FROM ksiTokens WHERE id=" + this.db.escape(req.cookies.ksiId));
        res.cookie("ksiId", null, { expires: new Date(0) })
        res.cookie("ksiToken", null, { expires: new Date(0) })
      }
      res.send("Logged out. <a href='/'>Home</a>");
    });

    app.get("/api/imageProxy", (req, res) => {
      const { URL } = require("url");
      var url = new URL(req.query.url);
      var externalReq = require("https").request({
        hostname: url.hostname,
        path: url.pathname + url.search,
      }, function(externalRes) {
        externalRes.pipe(res);
      });
      externalReq.end();
    });

    const secured = new express.Router();
    secured.use(async (req, res, next) => {
      if (!(await this.verifySession(req.session, req.cookies))) return res.status(403).send("Unauthorized. <a href='/login'>Log in</a>");
      req.data = {
        user: remix.client.users.get(req.session.user),
      }
      next();
    });
    app.use(secured);

    secured.get("/dashboard", (req, res) => {
      res.render("dashboard/index.ejs", req.data);
    });
    secured.get("/search", async (req, res) => {
      const query = (Object.keys(req.query).length == 0) ? null : req.query.q;
      var data = (await this.getSearchResults(query));

      res.render("search/index.ejs", { ...req.data, data: data, query: req.query.q, radios: this.remix.config.radio });
    });
    secured.get("/search-content", async (req, res) => {
      const query = (Object.keys(req.query).length == 0) ? null : req.query.q;
      var data = (await this.getSearchResults(query));

      res.render("search/content.ejs", { ...req.data, data: data, query: req.query.q, radios: this.remix.config.radio });
    });
    secured.get("/api/channel/icon", async (req, res) => {
      const videoId = req.query.v;
      const yt = await this.yt;
      const channelId = (await yt.getBasicInfo(videoId)).basic_info.channel_id;
      const icon = (await yt.getChannel(channelId)).metadata.avatar[0].url;
      const { URL } = require("url");
      var url = new URL(icon);
      var externalReq = require("https").request({
        hostname: url.hostname,
        path: url.pathname + url.search,
      }, function(externalRes) {
        externalRes.pipe(res);
      });
      externalReq.end();
    });
    secured.get("/api/servers/", async (req, res) => {
      var servers = await this.remix.getSharedServers(req.data.user);
      res.status(200).send(servers ? servers : []);
    });
    secured.get("/api/server/:s/voice", async (req, res) => {
      const server = req.params.s;
      if (!this.remix.client.servers.has(server)) return res.status(404).send({ message: "Unknown server", success: false })
      const data = await this.remix.getVoiceData(server);
      res.status(200).send(data);
    });
    secured.get("/api/server/:s/channels", async (req, res) => {
      const s = req.params.s;
      if (!s) return res.status(500).send({ message: "Unkown server error. ID SASC-PVERIFY", success: false });
      const server = this.remix.client.servers.get(s) || await this.remix.client.servers.fetch(s);
      if (!server) return res.status(404).send({ message: "Unknown server", success: false });
      const member = await server.fetchMember(req.data.user.id);
      // TODO: solve caching problem
      const channels = server.channels.filter(c => member.hasPermission(c, "ViewChannel") && member.hasPermission(c, "SendMessage") && c.havePermission("SendMessage") && c.havePermission("ViewChannel")).map(c => {
        return {
          name: c.name,
          description: c.description,
          id: c.id,
          icon: c.iconURL,
          type: c.type
        }
      });
      res.status(200).send({ data: { channels: channels, categories: server.categories }, success: true });
    });
    secured.post("/api/voice/:channel/join", async (req, res) => {
      const channel = this.remix.client.channels.get(req.params.channel);
      if (!channel) return res.status(422).send({ message: "Invalid voice channel", success: false });
      if (this.remix.playerMap.has(channel.id)) return res.status(200).send({ message: "Already joined.", success: false });
      const textC = this.remix.client.channels.get(req.body.text);
      if (!textC) return res.status(422).send({ message: "Invalid text channel", success: false });
      res.status(200).send({ message: "Joining", success: true });
      this.sendMessage(textC, req, "[Web] Joining <#" + channel.id + ">").then(msg => {
        this.remix.joinChannel.call(this.remix, msg, channel.id);
      });
    });
    secured.post("/api/voice/:channel/leave", async (req, res) => {
      const channel = this.remix.client.channels.get(req.params.channel);
      if (!channel) return res.status(422).send({ message: "Invalid channel", success: false });
      const d = (this.remix.revoice.getUser(req.data.user.id)) || {};
      if (!d.connection.channelId) return res.status(403).send({ message: "Unauthorized", success: false });
      res.status(200).send({ message: "Leaving", success: true });
      const player = this.remix.playerMap.get(d.connection.channelId);
      const textC = player.messageChannel;
      this.sendMessage(textC, req, "[Web] Leaving <#" + channel.id + ">").then(msg => {
        this.remix.leaveChannel.call(this.remix, msg, channel.id, player);
      });
    });
    secured.post("/api/dashboard/control", (req, res) => {
      const d = this.getUserData(req.data.user.id);
      if (!d.voice) return res.status(422).send({ message: "Not in a voice channel." });
      if (!["pause", "skip", "resume", "volume"].includes(req.body.action)) return res.status(400).send({ message: "Invalid action.", success: false });
      var message;
      switch (req.body.action) {
        case "pause":
          message = d.player.pause();
          res.status(200).send({ message: message || ":white_check_mark: Successfully paused", success: !message });
          this.sendMessage(d.player.messageChannel, req, "[Web] " + (message || "Paused Successfully"));
          break;
        case "resume":
          message = d.player.resume();
          res.status(200).send({ message: message || ":white_check_mark: Successfully resumed", success: !message });
          if (!message) this.sendMessage(d.player.messageChannel, req, "[Web] " + (message || "Resumed Successfully"));
          break;
        case "skip":
          message = d.player.skip();
          res.status(200).send({ message: message || ":white_check_mark: Successfully skipped", success: !message });
          if (!message) this.sendMessage(d.player.messageChannel, req, "[Web] " + (message || "Skipped Successfully"));
          break;
        case "volume":
          message = d.player.setVolume(req.body.data / 100);
          res.status(200).send({ message: message, success: true });
          this.sendMessage(d.player.messageChannel, req, "[Web] " + message);
          break;
        default:
          res.status(400).send({ message: "Invalid aciton", success: false });
          break;
      }
    });
    secured.post("/api/dashboard/queue", (req, res) => {
      const d = this.getUserData(req.data.user.id);
      if (!d.voice) return res.status(403).send({ message: "Not in a voice channel." });
      if (!["add"].includes(req.body.action)) return res.status(422).send({ message: "Invalid action." });

      var message;
      switch (req.body.action) {
        case "add":
          if (req.body.query.startsWith("remix://radio/")) {
            const name = req.body.query.slice("remix://radio/".length);
            const radio = this.remix.config.radio.find(e => e.name === name);
            if (!radio) {
              return res.status(422).send({ message: "Invalid radio station." });
            }
            this.sendMessage(d.player.messageChannel, req, "[Web] Adding radio station to queue...").then(m => {
              d.player.playRadio(radio);
              m.edit(this.messageBody(d.player.messageChannel, req, "[Web] Added `" + radio.detailedName + "` to the queue."));
            })
            break;
          }
          message = d.player.play(req.body.query);
          res.status(200).send({ message: "Adding to queue...", success: null })
          if (message) {
            this.sendMessage(d.player.messageChannel, req, "[Web] Searching...").then(m => {
              message.on("message", (msg) => {
                m.edit(this.messageBody(d.player.messageChannel, req, "[Web] " +  msg));
              });
            })
          }
          break;
      }
    });
  }
  messageBody(channel, req, content) {
    return {
      content: " ",
      embeds: [this.remix.embedify((!channel.havePermission("Masquerade")) ? content + `\n\n###### Requested by <@${req.data.user.id}>` : content)],
      masquerade: (channel.havePermission("Masquerade")) ? {
        name: req.data.user.username,
        avatar: req.data.user.avatarURL || req.data.user.defaultAvatarURL
      } : null
    }
  }
  sendMessage(channel, req, content) {
    return channel.sendMessage(this.messageBody(channel, req, content));
  }
  getUserData(id) {
    const connection = (this.remix.revoice.getUser(id) || {}).connection;
    return {
      voice: connection,
      player: (connection) ? this.remix.playerMap.get(connection.channelId) : null
    }
  }
  except(obj, key) {
    const newObj = {};
    for (let k in obj) {
      if (k == key) continue;
      newObj[k] = obj[k];
    }
    return newObj;
  }
  socketHandler(socket) {
    const session = socket.handshake.session;
    if (!session.user || !session.verified) return socket.disconnect(true);
    const currInfo = (channel) => {
      if (!channel) return { channel: undefined };
      return {
        channel: {
          name: channel.name,
          id: channel.id,
          icon: channel.iconURL || null,
        },
        server: {
          name: channel.server.name,
          id: channel.server.id,
          icon: channel.server.iconURL || null,
        }
      }
    }
    const getSongData = (song, player) => {
      if (!song) return;
      return {
        videoId: song.videoId,
        title: song.title,
        url: (song.type !== "radio") ? song.url : song.author.url,
        description: song.description,
        thumbnail: song.thumbnail,
        duration: (song.duration) ? player.getDuration(song.duration) : { timestamp: "infinite" },
        author: song.author,
        artists: song.artists,
        artist: song.artist
      }
    };
    const getPlayerData = (player) => {
      return {
        queue: player.getQueue(),
        volume: player.connection.preferredVolume || 1,
        paused: player.paused
      }
    }
    const subscribePlayer = (player, socket) => {
      const startPlayHandler = song => {
        socket.emit("startplay", getSongData(song, player));
      }
      const streamStartPlayHandler = () => {
        socket.emit("streamStartPlay");
      }
      const stopPlayHandler = () => {
        socket.emit("stopplay");
      }
      const volumeHandler = (v) => {
        socket.emit("volume", v);
      }
      const userHandler = (u, type) => {
        socket.emit("user" + type, this.except(u, "api"));
      }
      const playbackHandler = (playing) => {
        socket.emit((playing) ? "resume" : "pause", {
          elapsedTime: player.player.seconds * 1000
        });
      }
      const censorQueue = (data) => {
        return data.map(e => {
          if (e.type !== "radio") return e;

          return censorSong(e);
        });
      }
      const censorSong = (song) => {
        if (!song) return song;
        if (song.type !== "radio") return song;
        song.url = song.author.url;
        song.duration = {
          timestamp: "infinite",
          duration: Infinity
        }
        return song;
      }
      const queueHandler = (event) => {
        const e = structuredClone(event); // event is a reference, changes made to it will influence the Player Object
        switch(event.type) {
          case "add":
            if (event.data.data.type !== "radio") break;
            e.data.data = censorSong(e.data.data);
            break;
          case "remove":
            e.data.old = censorQueue(e.data.old);
            e.data.new = censorQueue(e.data.new);

            if (event.data.removed.type !== "radio") break;
            e.data.removed = censorSong(e.data.removed);
            break;
          case "shuffle":
            e.data = censorQueue(e.data);
            break;
          case "update":
            e.data.current = censorSong(e.data.current);
            e.data.old = censorSong(e.data.old);
            break;
          default:
            break;
        }

        socket.emit("queue", e);
      }
      player.on("startplay", startPlayHandler);
      player.on("streamStartPlay", streamStartPlayHandler);
      player.on("stopplay", stopPlayHandler);
      player.on("volume", volumeHandler);
      player.on("userupdate", userHandler);
      player.on("playback", playbackHandler);
      player.on("queue", queueHandler);
      socket.on("disconnect", () => {
        player.removeListener("startplay", startPlayHandler);
        player.removeListener("streamStartPlay", streamStartPlayHandler);
        player.removeListener("stopplay", stopPlayHandler);
        player.removeListener("volume", volumeHandler);
        player.removeListener("userupdate", userHandler);
        player.removeListener("playback", playbackHandler);
        player.removeListener("queue", queueHandler);
      });
    }
    socket.on("info", (uid) => {
      if (uid !== session.user) return socket.disconnect(true);
      uid = uid || session.user;
      const d = this.getUserData(uid);
      const con = d.voice || {};
      socket.emit("info", {
        connected: !!d.voice,
        ...currInfo(this.remix.client.channels.get(con.channelId)),
        currSong: (!!d.voice) ? {...getSongData(d.player.data.current, d.player), elapsedTime: (d.player.player?.seconds  || 0) * 1000} : null,
        currData: (!!d.voice) ? getPlayerData(d.player) : null
      });
      if (!!d.voice) subscribePlayer(d.player, socket);
      const oid = this.remix.observeUserVoice(uid, (event, ...data) => {
        switch (event) {
          case "joined":
            let player = data[0];
            let channel = this.remix.client.channels.get(data[0].connection.channelId);
            socket.emit("joined", { ...currInfo(channel), currData: getPlayerData(player), currSong: getSongData(player.data.current, player) });

            subscribePlayer(player, socket);
            break;
          case "left":
            socket.emit("left");
            break;
        }
      });
      socket.on("disconnect", () => {this.remix.unobserveUserVoice(oid);});
    });
  }
  getSearchResults(query) { // TODO: implement text runs
    return new Promise(async res => {
      if (!query) return res([]);
      const yt = await this.yt;
      const results = (await yt.search(query)).results;
      /*const video = results.find(r => r.type=="Video");
      console.log(video);*/
      var videos = results.filter(r => r.type=="Video");
      videos = videos.map(v => {
        return {
          title: v.title.text,
          description: (v.snippets) ? v.snippets[0].text.text : "",
          videoId: v.id,
          url: "https://youtube.com/watch?v=" + v.id,
          thumbnail: v.thumbnails[0].url,
          author: {
            name: v.author.name,
            id: v.author.id,
            iconUrl: v.author.thumbnails[0].url,
            url: v.author.url
          },
          duration: {
            timestamp: v.duration.text,
            seconds: v.duration.seconds
          }
        }
      })

      res(videos);
    });
  }

  guid() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
  }
  randToken() {
    return new Promise(res => {
      require('crypto').randomBytes(16, function(_err, buffer) {
        res(buffer.toString('hex'));
      });
    })
  }
  verifySession(session, cookies) {
    return new Promise(async res => {
      if (session.verified) return res(true);
      if (!session.user || !session.token) {
        if (cookies.ksiId) {
          return this.db.query("SELECT * FROM ksiTokens WHERE id=" + this.db.escape(cookies.ksiId), async (error, results) => {
            if (error) {console.error("SELECT error; ksi: ", error); return res(false)}
            if (results.length == 0) return res(false);
            if (!(await this.compareHash(cookies.ksiToken, results[0].token))) return res(false);
            session.user = results[0].user;
            session.verified = true;
            res(true);
          });
        }
        return res(false)
      };

      this.db.query("SELECT * FROM logins WHERE user=" + this.db.escape(session.user) + " AND id=" + this.db.escape(session.tId), async (e, results) => {
        if (e) {console.error("SELECT error: ", e); return res(false);}
        if (results.length == 0) return res(false);
        if (!results[0].verified) return res(false);
        if (!(await this.compareHash(session.token, results[0].token))) res(false);
        session.verified = true;
        session.user = results[0].user;
        res(true);
      });
    });
  }
  createKsiSession(id) {
    return new Promise(async (res) => {
      const kId = this.guid();
      const kToken = await this.randToken();
      this.db.query(`INSERT INTO ksiTokens (user, id, token, createdAt) VALUES (${this.db.escape(id)}, ${this.db.escape(kId)}, ${this.db.escape(await this.hash(kToken))}, NOW())`, (error) => {
        if (error) console.error("KSI error: ", error);
        res({ token: kToken, id: kId });
      });
    });
  }
  createLogin(id, req, verified=false) {
    return new Promise(async (res) => {
      if (req.session.token && req.session.user == id) return res({ id: req.session.tId, token: req.session.token, kId: req.cookies.ksi, kToken: req.cookies.ksiToken });
      this.db.query(`DELETE FROM ksiTokens WHERE DATE_ADD(createdAt, INTERVAL 63 DAY) < NOW()`);
      const uid = this.guid();
      const token = await this.randToken();
      this.db.query(`INSERT INTO logins (user, id, token, verified, createdAt) VALUES (${this.db.escape(id)}, ${this.db.escape(uid)}, ${this.db.escape(await this.hash(token))}, ${verified}, NOW())`, (error) => {
        this.db.query("DELETE FROM logins WHERE createdAt<" + this.db.escape(new Date(Date.now() - this.expiryTime)), (e) => {if (e) console.error("Cleanup mysql error: ", e)});
        if (error) {console.log("Insert statement error: ", error); res(false)}
        res({ token: token, id: uid });
      });
    });
  }
  async login(uid, user) {
    return new Promise(res => {
      uid = uid.split(";");
      const id = uid[0];
      const token = uid[1];
      this.db.query("SELECT * FROM logins WHERE user=" + this.db.escape(user.id) + " AND id=" + this.db.escape(id), async (e, results) => {
        if (e) { console.error("SELECT error; login: ", e); return res("Unexpected Error"); }
        if (results.length === 0) return res("Unknown user or wrong token");
        const login = results[0];
        if (!(await this.compareHash(token, login.token))) return res("Wrong Token"); // this shouldn't happpen -.-
        if (Date.now() - this.expiryTime > (new Date(login.createdAt)).getTime()) return res("Login token expired");
        this.db.query("UPDATE logins SET verified=true WHERE id=" + this.db.escape(id), () => {
          res(true);
        });
      });
    });
  }
  query(query) {
    return new Promise(res => {
      this.db.query(query, (error, results, fields) => { res({ error, results, fields })});
    });
  }
  hash(plain) {
    return new Promise((res, rej) => {
      bcrypt.hash(plain, 10, function(err, hash) {
        if (err) return rej(err);
        res(hash);
      });
    });
  }
  compareHash(plain, hash) {
    return new Promise((res, rej) => {
      bcrypt.compare(plain, hash, function(err, result) {
        if (err) return rej(err);
        res(result);
      });
    });
  }
}

module.exports = Dashboard;

