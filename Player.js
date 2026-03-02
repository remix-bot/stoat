const EventEmitter = require("events");
const { Revoice, MediaPlayer } = require("revoice.js");
const { Worker } = require('worker_threads');
const { Innertube, Platform } = require("youtubei.js"); // replaces ytdl-core
const { PassThrough } = require("stream");
const { spawn } = require("child_process");
const meta = require("./src/probe.js");
const fs = require('fs');

// Tell youtubei.js how to evaluate YouTube's obfuscated JS for URL deciphering.
// Uses Node's built-in Function constructor — no extra packages needed.
Platform.shim.eval = async (data, env) => {
  const properties = [];
  if (env.n) properties.push(`n: exportedVars.nFunction("${env.n}")`);
  if (env.sig) properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  const code = `${data.output}\nreturn { ${properties.join(', ')} }`;
  return new Function(code)();
};

// Shared Innertube instance
let _innertube = null;
async function getInnertube() {
  if (!_innertube) {
    _innertube = await Innertube.create({
      retrieve_player: true,
      generate_session_locally: true,
      // Using Firefox User Agent
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
      client_type: 'WEB',
      // Visitor data helps stabilize the v1/player 400 errors
      visitor_data: 'CgtSdl9RSl9uX3dfdyiAgpWyBg%3D%3D'
    });

    _innertube.session.on('auth-pending', (data) => {
      console.log(`\n[!] YOUTUBE LOGIN: Go to ${data.verification_url} and enter: ${data.user_code}\n`);
    });

    _innertube.session.on('auth', (data) => {
      console.log('[Player] youtubei.js successfully authenticated.');
      fs.writeFileSync('./yt_auth.json', JSON.stringify(data.credentials));
    });

    _innertube.session.on('update-credentials', (data) => {
      fs.writeFileSync('./yt_auth.json', JSON.stringify(data.credentials));
    });

    if (fs.existsSync('./yt_auth.json')) {
      const creds = JSON.parse(fs.readFileSync('./yt_auth.json'));
      try {
        await _innertube.session.signIn(creds);
      } catch (e) {
        console.error("[Player] Session expired, re-authenticating...");
        await _innertube.session.signIn();
      }
    } else {
      await _innertube.session.signIn();
    }
  }
  return _innertube;
}
class RevoltPlayer extends EventEmitter {
  constructor(token, opts) {
    super();
    this.voice = opts.voice || new Revoice(token, undefined, opts.client);
    this.connection = { state: Revoice.State.OFFLINE };
    this.upload = opts.uploader || new Uploader(opts.client, true);
    this.spotify = opts.spotifyClient || new Spotify(opts.spotify);
    this.spotifyConfig = opts.spotify;
    this.ytdlp = opts.ytdlp;

    if (this.ytdlp && typeof this.ytdlp.binaryPath === "string") {
      const { execFile } = require("child_process");
      execFile(this.ytdlp.binaryPath, ["-U"], (err, stdout, stderr) => {
        if (err) console.warn("[Player] yt-dlp update check failed:", err.message);
        else console.log("[Player] yt-dlp update:", (stdout || stderr || "up to date").split("\n")[0]);
      });
    }

    this.gClient = opts.geniusClient || new (require("genius-lyrics")).Client();
    this.port = 3050 + (opts.portOffset || 0);
    this.updateHandler = (content, msg) => { msg.edit({ content: content }); }
    this.messageChannel = opts.messageChannel;
    this.LEAVE_TIMEOUT = opts.lTimeout || 45;
    this.YT_API_KEY = opts.ytKey;
    this.token = token;
    this.REVOLT_CHAR_LIMIT = 1950;
    this.resultLimit = 5;
    this.startedPlaying = null;
    this.searches = new Map();
    this.data = this.data = {
      queue: [],
      current: null,
      loop: false,
      loopSong: false
    };

    return this;
  }
  setUpdateHandler(handler) {
    this.updateHandler = handler;
  }
  workerJob(jobId, data, onMessage = null, msg = null) {
    return new Promise((res, rej) => {
      const worker = new Worker('./worker.js', { workerData: { jobId, data } });
      worker.on("message", (data) => {
        data = JSON.parse(data);
        if (data.event == "error") {
          rej(data.data);
        } else if (data.event == "message" && (msg || onMessage)) {
          if (msg) this.updateHandler(data.data, msg);
          if (onMessage) onMessage(data.data);
        } else if (data.event == "finished") {
          res(data.data);
        }
      });
      worker.on("exit", (code) => { if (code == 0) rej(code) });
    });
  }
  guid() {
    var S4 = function () {
      return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    };
    return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
  }

  shuffleArr(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      x = a[i];
      a[i] = a[j];
      a[j] = x;
    }
    return a;
  }
  addIdToQueue(id) {
    return new Promise((res, _rej) => {
      this.workerJob("search", id).then((data) => {
        this.emit("queue", {
          type: "add",
          data: {
            append: true,
            data
          }
        });
        this.data.queue.push(data);
        res(true);
      }).catch(res(false));
    });
  }
  addToQueue(data, top = false) {
    this.emit("queue", {
      type: "add",
      data: {
        append: !top,
        data
      }
    });
    if (!top) return this.data.queue.push(data);
    return this.data.queue.unshift(data);
  }
  prettifyMS(milliseconds) {
    if (!milliseconds || isNaN(milliseconds) || milliseconds < 0) return "0:00";
    return new Date(milliseconds).toISOString().slice(
      // if 1 hour passed, show the hour component,
      // if 1 hour hasn't passed, don't show the hour component
      milliseconds > 3600000 ? 11 : 14,
      19
    );
  }

  // music controls
  shuffle() {
    if (this.data.queue.length == 0) return "There is nothing to shuffle in the queue.";
    this.data.queue = this.shuffleArr(this.data.queue);
    this.emit("queue", {
      type: "shuffle",
      data: this.data.queue
    });
    return;
  }
  get paused() {
    if (!this.player) return false;
    return this.player.playbackPaused || false;
  }
  pause() {
    if (!this.player || !this.data.current) return `:negative_squared_cross_mark: There's nothing playing at the moment!`;
    if (this.player.playbackPaused) return ":negative_squared_cross_mark: Already paused. Use the `resume` command to continue playing!";
    this.player.pause();
    this.emit("playback", false);
    return;
  }
  resume() {
    if (!this.player || !this.data.current) return `:negative_squared_cross_mark: There's nothing playing at the moment!`;
    if (!this.player.paused) return ":negative_squared_cross_mark: Not paused. To pause, use the `pause` command!";
    this.player.resume();
    this.emit("playback", true);
    return;
  }
  skip() {
    if (!this.player || !this.data.current) return `:negative_squared_cross_mark: There's nothing playing at the moment!`;
    this.player.stop();
    this.emit("update", "queue");
    return;
  }
  clear() {
    this.data.queue.length = 0;
    this.emit("update", "queue");
  }
  getCurrent() {
    if (!this.data.current) return "There's nothing playing at the moment.";
    return this.getVidName(this.data.current);
  }

  // utility commands
  getVidName(vid, code = false) {
    if (vid.type === "radio") {
      if (code) {
        return "[Radio]: " + vid.title + " - " + vid.author.url + "";
      }
      return "[Radio] [" + vid.title + " by " + vid.author.name + "](" + vid.author.url + ")";
    }
    if (vid.type === "external") {
      if (code) return vid.title + " - " + vid.url;
      return "[" + vid.title + "](" + vid.url + ")";
    }
    if (code) return vid.title + " (" + this.getCurrentElapsedDuration() + "/" + this.getDuration(vid.duration) + ")" + ((vid.spotifyUrl || vid.url) ? " - " + (vid.spotifyUrl || vid.url) : "");
    return "[" + vid.title + " (" + this.getCurrentElapsedDuration() + "/" + this.getDuration(vid.duration) + ")" + "]" + ((vid.spotifyUrl || vid.url) ? "(" + (vid.spotifyUrl || vid.url) + ")" : "");
  }
  msgChunking(msg) {
    let msgs = [[""]];
    let c = 0;
    msg.split("\n").forEach((line) => {
      let tmp = msgs[c].slice();
      tmp.push(line);
      if ((tmp.join("") + "\n").length < this.REVOLT_CHAR_LIMIT) {
        msgs[c].push(line + "\n");
      } else {
        msgs[++c] = [line + "\n"];
      }
    });
    //msgs = msgs.map(msgChunks => "```" + msgChunks.join("") + "```");
    return msgs;
  }
  listQueue() {
    var text = "";
    if (this.data.current) text += "[x] " + this.getVidName(this.data.current, true) + "\n";
    this.data.queue.forEach((vid, i) => {
      text += "[" + i + "] " + this.getVidName(vid, true) + "\n";
    });
    if (this.data.queue.length == 0 && !this.data.current) text += "--- Empty ---";
    return text;
  }
  list() {
    return this.listQueue();
  }
  getQueue() {
    return this.data.queue.map(el => {
      if (el.type !== "radio") return el;

      const e = { ...el };
      e.url = e.author.url;
      e.duration = {
        timestamp: "infinite",
        duration: Infinity
      };
      return e;
    });
  }
  async lyrics() {
    if (!this.data.current) return [];
    const results = await this.gClient.songs.search(this.data.current.title);
    return (!results[0]) ? null : await results[0].lyrics();
  }
  loop(choice) {
    if (!["song", "queue"].includes(choice)) return "'" + choice + "' is not a valid option. Valid are: `song`, `queue`";
    let name = choice.charAt(0).toUpperCase() + choice.slice(1);

    var toggle = (varName, name) => {
      let variable = this.data[varName];
      this.data[varName] = 1 - variable; // toggle boolean state
      variable = this.data[varName];
      return (variable) ? name + " loop activated" : name + " loop deactivated";
    }
    return toggle((choice == "song") ? "loopSong" : "loop", name);
  }
  remove(index) {
    if (!index && index != 0) throw "Index can't be empty";
    if (!this.data.queue[index]) return "Index out of bounds";
    let title = this.data.queue[index].title;
    this.emit("queue", {
      type: "remove",
      data: {
        index: index,
        old: this.data.queue.slice(),
        removed: this.data.queue.splice(index, 1),
        new: this.data.queue
      }
    });
    this.emit("update", "queue");
    return "Successfully removed **" + title + "** from the queue.";
  }
  getDuration(duration) {
    if (typeof duration === "object") {
      return duration.timestamp;
    } else {
      return this.prettifyMS(duration);
    }
  }
  getCurrentDuration() {
    return this.getDuration(this.data.current.duration);
  }
  getCurrentElapsedDuration() {
    return this.getDuration(this.player.seconds * 1000);
  }
  async nowPlaying() {
    if (!this.data.current) return { msg: "There's nothing playing at the moment." };

    let loopqueue = (this.data.loop) ? "**enabled**" : "**disabled**";
    let songloop = (this.data.loopSong) ? "**enabled**" : "**disabled**";
    const vol = ((this.connection?.preferredVolume || 1) * 100) + "%";
    const paused = !!this.connection?.media.paused; // TODO: integrate
    if (this.data.current.type === "radio") {
      const data = await meta(this.data.current.url);
      return { msg: "Streaming **[" + this.data.current.title + "](" + this.data.current.author.url + ")**\n\n" + this.data.current.description + " \n\n### Current song: " + data.title + "\n\nVolume: " + vol + "\n\nQueue loop: " + loopqueue + "\nSong loop: " + songloop, image: await this.uploadThumbnail() }
    }
    if (this.data.current.type === "external") {
      return { msg: "Playing **[" + this.data.current.title + "](" + this.data.current.url + ") by [" + this.data.current.artist + "](" + this.data.current.author.url + ")** \n\nVolume: " + vol + "\n\nQueue loop: " + loopqueue + "\nSong loop: " + songloop, image: await this.uploadThumbnail() }
    }
    return { msg: "Playing: **[" + this.data.current.title + "](" + (this.data.current.spotifyUrl || this.data.current.url) + ")** (" + this.getCurrentElapsedDuration() + "/" + this.getCurrentDuration() + ")" + "\n\nVolume: " + vol + "\n\nQueue loop: " + loopqueue + "\nSong loop: " + songloop, image: await this.uploadThumbnail() };
  }
  uploadThumbnail() {
    return new Promise((res) => {
      return res();
      // TODO: fix uploader
      if (!this.data.current) return res(null);
      if (!this.data.current.thumbnail) return res(null);
      https.get(this.data.current.thumbnail, async (response) => {
        res(await this.upload.upload(response, this.data.current.title));
      });
    });
  }
  getThumbnail() {
    return new Promise(async (res) => {
      if (!this.data.current) return res({ msg: "There's nothing playing at the moment.", image: null });
      if (!this.data.current.thumbnail) return res({ msg: "The current media resource doesn't have a thumbnail.", image: null });
      res({ msg: `The thumbnail of the video [${this.data.current.title}](${this.data.current.url}): `, image: await this.uploadThumbnail() });
    });
  }
  setVolume(v) {
    if (!this.voice || !this.connection) return "Not connected to a voice channel.";

    const connection = this.voice.getVoiceConnection(this.connection.channelId);
    if (!connection) return "Not connected!";

    this.connection.preferredVolume = v;
    if (connection.media) connection.media.setVolume(v);

    this.emit("volume", v);

    return "Volume changed to `" + (v * 100) + "%`.";
  }
  announceSong(s) {
    if (!s) return;
    if (s.type === "radio") {
      this.emit("message", "Now streaming _" + s.title + "_ by [" + s.author.name + "](" + s.author.url + ")");
      return;
    }
    var author = (!s.artists) ? "[" + s.author.name + "](" + s.author.url + ")" : s.artists.map(a => `[${a.name}](${a.url})`).join(" & ");
    this.emit("message", "Now playing [" + s.title + "](" + (s.spotifyUrl || s.url) + ") by " + author);
  }

  // functional core
  async streamResource(url) {
    const axios = require('axios');
    const response = await axios({ method: 'get', url: url, responseType: 'stream' });
    return response.data;
  }

  async getYoutubeiStream(videoId) {
    try {
      const innertube = await getInnertube();
      // Try TV and ANDROID clients as they have less strict PoToken requirements currently
      const clients = ["TV", "ANDROID", "YTMUSIC", "WEB"];
      let webStream = null;
      let lastErr = null;

      for (const client of clients) {
        try {
          webStream = await innertube.download(videoId, { type: "audio", quality: "best", client });
          console.log("[Player] youtubei.js stream acquired via client:", client);
          break;
        } catch (e) {
          console.warn(`[Player] client ${client} failed:`, e.message);
          lastErr = e;
        }
      }

      if (!webStream) throw lastErr;

      const passThrough = new PassThrough();
      const reader = webStream.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { passThrough.end(); break; }
            passThrough.write(value);
          }
        } catch (e) {
          passThrough.destroy(e);
        }
      })();
      return passThrough;
    } catch (err) {
      console.error("[Player] youtubei.js fallback failed:", err.message);
      return null;
    }
  }

  async playNext() {
    if (this.data.queue.length === 0 && !this.data.loopSong) {
      this.data.current = null;
      this.emit("stopplay");
      return false;
    }

    const current = this.data.current;
    const songData = (this.data.loopSong && current) ? current : this.data.queue.shift();
    if (current && this.data.loop && !this.data.loopSong) this.data.queue.push(current);

    if (!this.data.loopSong) {
      this.emit("queue", {
        type: "update",
        data: { current: songData, old: current, loop: this.data.loop }
      });
    }

    this.data.current = songData;
    const connection = this.voice.getVoiceConnection(this.connection.channelId);

    let stream;
    if (songData.type == "soundcloud") {
      let ytdlpPath = (typeof this.ytdlp === "string") ? this.ytdlp : (this.ytdlp?.binaryPath || "yt-dlp");
      const proc = spawn(ytdlpPath, ["-f", "bestaudio/best", "--no-playlist", "-o", "-", "--quiet", songData.url]);
      stream = proc.stdout;
    } else if (songData.type == "external" || songData.type == "radio") {
      stream = await this.streamResource(songData.url);
    } else {
      const videoId = songData.videoId || (songData.url && (
        (songData.url.match(/[?&]v=([^&]{11})/) || [])[1] ||
        (songData.url.match(/youtu\.be\/([^?]{11})/) || [])[1]
      ));

      if (this.ytdlp) {
        console.log("[Player] Attempting yt-dlp for:", videoId);
        let ytdlpPath = (typeof this.ytdlp === "string") ? this.ytdlp : (this.ytdlp.binaryPath || "yt-dlp");

        const proc = spawn(ytdlpPath, [
          "--cookies", "/root/revolt/cookies.txt",
          "--js-runtimes", "node",
          "-f", "251/250/249/bestaudio",
          "--no-playlist", "-o", "-", "--quiet", "--no-cache-dir", "--force-ipv4",
          "https://www.youtube.com/watch?v=" + videoId
        ]);

        const passThrough = new PassThrough();
        stream = passThrough;
        let ytdlpFallbackTriggered = false;

        proc.stdout.pipe(passThrough);

        proc.stderr.on("data", async (d) => {
          if (ytdlpFallbackTriggered) return;
          const msg = d.toString();
          // Broad match — catches any auth/block variant YouTube may send
          const isBlocked = (
            msg.includes("Sign in") ||
            msg.includes("bot") ||
            msg.includes("HTTP Error 403") ||
            msg.includes("HTTP Error 429") ||
            msg.includes("Precondition") ||
            msg.includes("This video is not available") ||
            msg.includes("blocked") ||
            msg.includes("login") ||
            msg.includes("Private video") ||
            msg.includes("Video unavailable")
          );
          if (isBlocked) {
            ytdlpFallbackTriggered = true;
            console.warn("[Player] yt-dlp blocked. Switching to youtubei.js...");
            proc.stdout.unpipe(passThrough);
            proc.kill();
            const fallback = await this.getYoutubeiStream(videoId);
            if (fallback) {
              fallback.pipe(passThrough);
            } else {
              passThrough.destroy(new Error("Both yt-dlp and youtubei.js failed"));
            }
          }
        });

        // Safety net: yt-dlp exits non-zero but stderr didn't match any known pattern
        proc.on("close", async (code) => {
          if (ytdlpFallbackTriggered) return;
          if (code !== 0 && !passThrough.destroyed) {
            ytdlpFallbackTriggered = true;
            console.warn("[Player] yt-dlp exited with code", code, "— falling back to youtubei.js...");
            const fallback = await this.getYoutubeiStream(videoId);
            if (fallback) {
              fallback.pipe(passThrough);
            } else {
              passThrough.destroy(new Error("Both yt-dlp and youtubei.js failed"));
            }
          }
        });
      } else {
        stream = await this.getYoutubeiStream(videoId);
      }
    }

    if (!stream) { this.emit("stopplay"); return false; }

    connection.media.once("startplay", () => this.emit("streamStartPlay"));
    connection.media.playStream(stream);
    stream.once("data", () => this.startedPlaying = Date.now());
    if (this.connection.preferredVolume) connection.media.setVolume(this.connection.preferredVolume);
    this.announceSong(this.data.current);
    this.emit("startplay", this.data.current);
  }
  leave() {
    if (!this.connection || !Revoice || !Revoice.State) {
      return false;
    }

    try {
      if (this.connection.state !== Revoice.State.OFFLINE) {
        const channelKey = this.connection.channelId;
        this.connection.state = Revoice.State.OFFLINE;
        this.leaving = true;
        this.connection.leave();
        this.voice.connections.delete(channelKey);
        this.data = null; // data should not e used after leaving, the Player object is invalidated.
      }
    } catch (error) {
      return false;
    }

    this.emit("leave");
    return true;
  }
  destroy() {
    return this.connection.destroy();
  }
  fetchResults(query, id, provider = "yt") { // TODO: implement pagination of further results
    const providerNames = {
      yt: "YouTube",
      ytm: "YouTube Music",
      scld: "SoundCloud",
    };
    return new Promise(res => {
      let list = `Search results using **${providerNames[provider] || "YouTube"}**:\n\n`;
      this.workerJob("searchResults", { query: query, provider: provider, resultCount: this.resultLimit }, () => { }).then((data) => {
        data.data.forEach((v, i) => {
          const url = v.url || v.permalink_url || "";
          const title = v.title || v.name || "Unknown";
          const dur = v.duration ? this.getDuration(v.duration) : "?:??";
          list += `${i + 1}. [${title}](${url}) - ${dur}\n`;
        });
        list += "\nSend the number of the result you'd like to play here in this channel. Example: `2`\nTo cancel this process, just send an 'x'!";
        this.searches.set(id, data.data);
        res({ m: list, count: data.data.length });
      });
    });
  }
  playResult(id, result = 0, next = false) {
    if (!this.searches.has(id)) return null;
    const res = this.searches.get(id)[result];

    let prep = this.preparePlay();
    if (prep) return prep;

    this.addToQueue(res, next);
    if (!this.data.current) this.playNext();
    return res;
  }
  join(channel) {
    return new Promise(res => {
      console.log("channel: ", channel)
      this.voice.join(channel, this.LEAVE_TIMEOUT).then((connection) => {
        //console.log(connection);
        this.connection = connection;
        connection.once("join", res);
        var roomFetched = false;
        connection.on("roomfetched", () => { if (roomFetched) return; roomFetched = true; this.emit("roomfetched", connection.users) });
        this.connection.on("state", (state) => {
          console.log(state);
          if (state == Revoice.State.IDLE && !roomFetched) {
            this.emit("roomfetched", connection.users)
          }
          this.state = state;
          if (state == Revoice.State.OFFLINE && !this.leaving) {
            this.emit("autoleave");
            return;
          }
          if (state == Revoice.State.IDLE) this.playNext();
        });
      });
    })
  }
  playRadio(radio, top = false) {
    let prep = this.preparePlay();
    if (prep) return prep;

    const url = radio.url;
    const name = radio.detailedName;
    const description = radio.description;
    const thumbnail = radio.thumbnail;

    this.addToQueue({
      type: "radio",

      title: name,
      description,
      url,
      author: {
        name: radio.author.name,
        url: radio.author.url
      },
      thumbnail,
    }, top);

    if (!this.data.current) this.playNext();
  }
  preparePlay() {
    if (this.connection.state == Revoice.State.OFFLINE) return "Please let me join first.";
    if (!this.connection.media) {
      let p = new MediaPlayer(false, this.port);
      this.player = p;
      this.connection.play(p);
    }
  }
  playFirst(query, provider) {
    return this.play(query, true, provider);
  }
  play(query, top = false, provider) { // top: where to add the results in the queue (top/bottom)
    let prep = this.preparePlay();
    if (prep) return prep;

    const events = new EventEmitter();
    this.workerJob("generalQuery", { query: query, spotify: this.spotifyConfig, provider: provider }, (msg) => {
      events.emit("message", msg);
    }).then((data) => {
      if (data.type == "list") {
        data.data.forEach(vid => {
          this.addToQueue(vid, top);
        });
      } else if (data.type == "video") {
        this.addToQueue(data.data, top);
      } else {
        console.log("Unknown case: ", data.type, data);
      }
      if (!this.data.current) this.playNext();
    }).catch(reason => {
      console.log("reason", reason);
      reason = reason || "An error occured. Please contact the support if this happens reocurringly.";
      events.emit("message", reason);
    });
    return events;
  }
}

module.exports = RevoltPlayer;