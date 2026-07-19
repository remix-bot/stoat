import { Utils } from "./Utils.mjs";
import { EventEmitter } from "node:events";
import VoiceImport from "revoice.js";
const { MediaPlayer, Revoice } = VoiceImport;
import Uploader from "revolt-uploader";
import meta from "./probe.js";
import { Client } from "revolt.js";
import { Worker } from "node:worker_threads";
import https from "node:https";
import { Manager, Node } from "moonlink.js";
import path from "node:path";
import axios from "axios";
import { PassThrough } from "stream";
import { Channel } from "./MessageHandler.mjs";
import { Readable, Stream } from "node:stream";

/**
 * @typedef {Object} Video
 * @property {("radio"|"video"|"external")} type
 * @property {string} title
 * @property {string} description
 * @property {string} videoId
 * @property {string} url
 * @property {string} encoded Nodelink encoded identifier
 * @property {string} [spotifyUrl]
 * @property {string} artist Used if type === "external"
 * @property {Object[]} [artists]
 * @property {string} artists[].name
 * @property {string} artists[].url
 * @property {Object} author
 * @property {string} author.name
 * @property {string} author.url
 */
 /**
  * @typedef SerialisedVideo
  * @property {string} encoded NodeLink encoded identifier
  * @property {string} id videoId, might be redundant/deprecated
  * @property {number} [restart] Timestamp to restart from
  */

export class Queue extends EventEmitter {
  /** @type {Video[]} */
  data = [];
  /** @type {Video|null} */
  current = null;
  loop = false;
  songLoop = false;

  constructor() {
    super();
  }

  /**
   * @returns {boolean}
   */
  isEmpty() {
    return this.data.length === 0;
  }
  /**
   * @returns {string}
   */
  size() {
    return this.data.length;
  }
  next() {
    const previous = this.current;
    if (this.songLoop && this.current) return this.current;
    if (this.loop && this.current) this.data.push(this.current);
    this.current = null;
    if (this.isEmpty()) return null;
    this.current = this.data.shift();
    this.emit("queue", {
      type: "update",
      data: {
        current: this.current,
        old: previous,
        loop: this.loop
      }
    });
    return this.current;
  }
  remove(idx) {
    if (!this.data[idx]) return "Index out of bounds";
    const title = this.data[idx].title;
    this.emit("queue", {
      type: "remove",
      data: {
        index: idx,
        old: this.data.slice(),
        removed: this.data.splice(idx, 1)[0],
        new: this.data
      }
    });
    return "Successfully removed **" + title + "** from the queue.";
  }
  /**
   * @param {Video} data
   */
  addFirst(data) {
    return this.add(data, true);
  }
  /**
   *
   * @param {Video} data
   * @param {boolean} [top]
   */
  add(data, top = false) {
    this.emit("queue", {
      type: "add",
      data: {
        append: !top,
        data
      }
    });
    if (!top) return this.data.push(data);
    return this.data.unshift(data);
  }
  clear() {
    this.data.length = 0;
  }
  reset() {
    this.clear();
    this.current = null;
    this.songLoop = false;
    this.loop = false;
  }

  /**
   * @param {boolean} bool
   */
  setSongLoop(bool) {
    this.songLoop = bool;
  }
  /**
   * @param {boolean} bool
   */
  setLoop(bool) {
    this.loop = bool;
  }
  /**
   * @param {("song"|"queue")} loop
   * @returns {boolean}
   */
  toggleLoop(loop) {
    switch (loop) {
      case "song":
        this.setSongLoop(!this.songLoop);
        return this.songLoop;
      case "queue":
        this.setLoop(!this.loop);
        return this.loop;
    }
  }

  shuffle() {
    Utils.shuffleArr(this.data);
    this.emit("queue", {
      type: "shuffle",
      data: this.data
    });
  }

  /**
   * @returns {Video}
   */
  getCurrent() {
    return this.current;
  }
  /**
   * @returns {Video[]}
   */
  getQueue() {
    return this.data;
  }
  export() {
    return {
      current: structuredClone(this.current),
      queued: this.data.slice()
    }
  }
  /**
   * Sums all the durations of the tracks in the queue
   * @returns {number}
   */
  getDuration() {
    if (this.data.find(v => v.type === "radio")) return Infinity;
    return this.data.map(v => {
      if (typeof v.duration != "object") {
        return v.duration;
      }
      return v.duration.seconds; // timestamp decoding shouldn't be necessary with nodelink anymore
    }).reduce((a, b) => a + b, 0);
  }
}

export default class Player extends EventEmitter {
  queue;
  /** @type {MediaPlayer} */
  player;
  /** @type {Uploader} */
  upload;
  /** @type {Revoice} */
  voice;
  /** @type {VoiceConnection} */
  connection;

  /** @type {number} */
  startedPlaying;
  LEAVE_TIMEOUT = 45;
  leaving = false;
  searches = new Map();
  resultLimit = 5; // number of search results fetched

  /**
   * @param {string} token
   * @param {Object} opts
   * @param {Revoice} opts.voice
   * @param {Client} opts.client
   * @param {Object} opts.config Remix config.json file parsed to an object
   * @param {Channel} opts.messageChannel
   */
  constructor(token, opts) {
    super();
    this.queue = new Queue();
    this.voice = opts.voice || new Revoice(token, undefined, opts.client);
    this.connection = {
      state: Revoice.State.OFFLINE
    };

    this.upload = opts.uploader || new Uploader(opts.client, true);
    this.innertube = opts.innertube;
    this.ytdlp = opts.ytdlp;
    this.client = opts.client; // needed for Dashboard
    this.messageChannel = opts.messageChannel;
    /** @type {("online"|"stopping"|"offline")} */
    this.playerStatus = "online";

    this.nodelink = opts.nodelink;
    this.nodelinkReady = !!opts.nodelink;
    if (!this.nodelink) {
      this.nodelink = new Manager({
        nodes: opts.config.nodelink.nodes,
        config: {
          clientName: "RemixStoat-Player/1.0.0"
        }
      });
      this.nodelink.on("nodeReady", () => {
        this.nodelinkReady = true;
        this.emit("nodeReady");
      });
      this.nodelink.init("648200414054842368");
    }
  }

  workerJob(jobId, data, onMessage = null, msg = null) {
    const __dirname = import.meta.dirname;
    return new Promise((res, rej) => {
      const worker = new Worker(path.join(__dirname, './worker.mjs'), { workerData: { jobId, data } });
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
      worker.on("exit", (code) => { if (code !== 0) rej(code) });
    });
  }

  isEmpty() {
    return this.queue.isEmpty();
  }

  shuffle() {
    if (this.isEmpty()) return "There is nothing to shuffle in the queue.";
    this.queue.shuffle();
  }

  addToQueue(data, top = false) {
    this.queue.add(data, top);
  }
  /** @type {boolean} */
  get paused() {
    return this.player?.playbackPaused || false;
  }
  pause() {
    if (!this.player || !this.queue.getCurrent()) return ":negative_squared_cross_mark: There's nothing playing at the moment!";
    if (this.paused) return ":negative_squared_cross_mark: Already paused. Use the `resume` command to continue playing!";
    this.player.pause();
    this.emit("playback", false);
  }
  resume() {
    if (!this.player || !this.queue.getCurrent()) return ":negative_squared_cross_mark: There's nothing playing at the moment!";
    if (!this.player.paused) return ":negative_squared_cross_mark: Not paused. To pause, use the `pause` command!";
    this.player.resume();
    this.emit("playback", true);
  }
  skip() {
    if (!this.player || !this.queue.getCurrent()) return ":negative_squared_cross_mark: There's nothing playing at the moment!";
    this.player.stop();
    this.emit("update", "queue");
  }
  clear() {
    this.queue.clear();
    this.emit("update", "queue");
  }

  getCurrent() {
    const current = this.queue.getCurrent();
    if (!current) return "There's nothing playing at the moment.";
    return this.getVideoName(current);
  }
  /**
   * @param {Video} vid
   * @param {boolean} [code]
   * @returns {string}
   */
  getVideoName(vid, code = false) {
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
  /**
   * @typedef ListData
   * @property {Object} current
   * @property {string} current.title
   * @property {string} current.artist
   * @property {string} current.url
   * @property {string} current.elapsed
   * @property {string} current.duration
   *
   * @property {Object} totalTime
   * @property {number} totalTime.time
   * @property {string} totalTime.timestamp
   *
   * @property {Object[]} queue
   * @property {string} queue[].title
   * @property {string} queue[].artist
   * @property {string} queue[].url
   * @property {string} queue[].duration
   */
  /**
   * @returns {ListData}
   */
  list() {
    const current = this.queue.getCurrent();
    const length = this.queue.getDuration();
    const result = {
      current: null,
      queue: [],
      totalTime: {
        time: length,
        timestamp: (length != Infinity) ? Utils.prettifyMS(length * 1000, "d:h:!m:!s") : "--:--"
      }
    }
    if (current) {
      result.current = {
        title: current.title,
        artist: current.author.name,
        url: (current.type === "radio") ? current.author.url : current.url,
        elapsed: this.getCurrentElapsedDuration(),
        duration: (current.type === "radio") ? "??:??" : this.getDuration(current.duration)
      }
    }

    result.queue = this.queue.getQueue().map(v => {
      return {
        title: v.title,
        artist: v.author.name,
        url: (v.type === "radio") ? v.author.url : v.url,
        duration: (v.type === "radio") ? "??:??" : this.getDuration(v.duration)
      }
    });
    return result;
  }
  async lyrics() {
    const current = this.queue.getCurrent();
    if (!current) return [];
    const node = await this.getNode();
    var results;
    if (current.encoded) {
      results = await node.loadLyrics({
        encoded: current.encoded
      });
    } else {
      results = await node.loadLyrics(current.title);
    }
    // TODO: add synchronisation, possibly
    return {
      lines: results.data?.lines.map(e => e.text),
      provider: results.data?.provider
    };
  }
  loop(choice) {
    if (!["song", "queue"].includes(choice)) return "'" + choice + "' is not a valid option. Valid are: `song`, `queue`";
    const state = this.queue.toggleLoop(choice);
    const name = choice.charAt(0).toUpperCase() + choice.slice(1);
    return (state) ? name + " loop activated" : name + " loop disabled";
  }
  remove(index) {
    if (!index && index != 0) throw "Index can't be empty";
    const oldSize = this.queue.size();
    const msg = this.queue.remove(index);
    if (oldSize != this.queue.size()) this.emit("update", "queue");
    return msg;
  }
  async nowPlaying() {
    const current = this.queue.getCurrent();
    if (!current) return { msg: "There's nothing playing at the moment." };
    let loopqueue = (this.queue.loop) ? "**enabled**" : "**disabled**";
    let songloop = (this.queue.songLoop) ? "**enabled**" : "**disabled**";
    const vol = ((this.connection?.preferredVolume || 1) * 100) + "%";
    const paused = !!this.connection?.media.paused; // TODO: integrate
    if (current.type === "radio") {
      const data = await meta(current.url);
      return { msg: "Streaming **[" + current.title + "](" + current.author.url + ")**\n\n" + current.description + " \n\n### Current song: " + data.title + "\n\nVolume: " + vol + "\n\nQueue loop: " + loopqueue + "\nSong loop: " + songloop, image: await this.uploadThumbnail() }
    }
    if (current.type === "external") {
      return { msg: "Playing **[" + current.title + "](" + current.url + ") by [" + current.artist + "](" + current.author.url + ")** \n\nVolume: " + vol + "\n\nQueue loop: " + loopqueue + "\nSong loop: " + songloop, image: await this.uploadThumbnail() }
    }
    return { msg: "Playing: **[" + current.title + "](" + (current.spotifyUrl || current.url) + ")** (" + this.getCurrentElapsedDuration() + "/" + this.getDuration(this.queue.current.duration) + ")" + "\n\nVolume: " + vol + "\n\nQueue loop: " + loopqueue + "\nSong loop: " + songloop, image: await this.uploadThumbnail() };
  }
  uploadThumbnail() {
    return new Promise((res) => {
      //return res();
      const current = this.queue.getCurrent();
      if (!current) return res(null);
      if (!current.thumbnail) return res(null);
      https.get(current.thumbnail, async (response) => {
        res(await this.upload.upload(response, current.title));
      });
    });
  }
  getThumbnail() {
    return new Promise(async (res) => {
      const current = this.queue.getCurrent();
      if (!current) return res({ msg: "There's nothing playing at the moment.", image: null });
      if (!current.thumbnail) return res({ msg: "The current media resource doesn't have a thumbnail.", image: null });
      res({ msg: `The thumbnail of the video [${current.title}](${current.url}): `, image: await this.uploadThumbnail() });
    });
  }
  /**
   * @param {number} v
   * @returns {string}
   */
  setVolume(v) {
    if (!this.voice || !this.connection) return "Not connected to a voice channel.";

    const connection = this.voice.getVoiceConnection(this.connection.channelId);
    if (!connection) return "Not connected!";

    this.connection.preferredVolume = v;
    if (connection.media) connection.media.setVolume(v);

    this.emit("volume", v);
    return "Volume changed to `" + (v * 100) + "%`.";
  }
  /**
   * @param {Video} s
   */
  announceSong(s) {
    if (!s) return;
    if (s.type === "radio") {
      this.emit("message", "Now streaming _" + s.title + "_ by [" + s.author.name + "](" + s.author.url + ")");
      return;
    }
    var author = (!s.artists) ? "[" + s.author.name + "](" + s.author.url + ")" : s.artists.map(a => `[${a.name}](${a.url})`).join(" & ");
    this.emit("message", "Now playing [" + s.title + "](" + (s.spotifyUrl || s.url) + ") by " + author);
  }
  /**
   *
   * @param {number|Object} duration
   * @param {string} duration.timestamp
   * @returns {string}
   */
  getDuration(duration) {
    if (typeof duration === "object") {
      return duration.timestamp;
    } else {
      return Utils.prettifyMS(duration, "h:!m:!s");
    }
  }
  /**
   * @returns {string}
   */
  getCurrentElapsedDuration() {
    return this.getDuration(this.player.seconds * 1000);
  }

  // functional core
  // TODO: potentially touch up the following parts as well
  async streamResource(url) {
    const response = await axios({ method: 'get', url: url, responseType: 'stream' });
    const buffered = new PassThrough({
      highWaterMark: 10 * 1024 * 1024,
    });
    response.data.pipe(buffered);
    response.data.on("error", (err) => {
      buffered.destroy(err);
    });
    return buffered;
  }
  /**
   *Waits for a NodeLink node to become ready
   * @returns {Promise<undefined>}
   */
  async waitReady() {
    if (this.nodelinkReady) return;

    return new Promise(res => {
      this.once("nodeReady", res);
    });
  }
  /**
   * @returns {Promise<Node>}
   */
  async getNode() {
    await this.waitReady();
    const node = this.nodelink.nodes.findNode();
    if (node) return node;

    return new Promise((res) => {
      this.nodelink.once("nodeReady", () => {
        res(this.nodelink.nodes.findNode());
      });
    });
  }

  async playNext() {
    const songData = this.queue.next();
    if (!songData) {
      this.emit("stopplay");
      return false;
    }

    const connection = this.voice.getVoiceConnection(this.connection.channelId);
    var streamUrl;
    var directStream;
    if (songData.type == "external" || songData.type == "radio") {
      streamUrl = songData.url;
    } else if (songData.encoded) {
      const node = await this.getNode();
      const load = (await node.loadDirectStream({
        encoded: songData.encoded
      }, 100, 0));
      streamUrl = null;
      directStream = load.stream;
    }

    const stream = (streamUrl) ? await this.streamResource(streamUrl) : directStream;

    if (!stream) {
      this.emit("stopplay");
      return false;
    }

    connection.media.once("startplay", () => this.emit("streamStartPlay", Date.now()));
    connection.media.playStream(stream, (!streamUrl) ? [
            `-f s16le`,
            `-ar 48000`,
            `-ac 2`
          ] : undefined);
    stream.once("data", () => this.startedPlaying = Date.now());
    if (this.connection.preferredVolume) connection.media.setVolume(this.connection.preferredVolume);
    this.announceSong(songData);
    this.emit("startplay", songData);
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
        this.queue.reset();
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
  /**
   * Gracefull shutdown and export for later reinstatement.
   * @returns {{channel: string, messagingChannel: string, queue:{current: SerialisedVideo, queued: SerialisedVideo[]}}}
   */
  close() {
    this.playerStatus = "stopping";
    const data = {
      channel: this.connection.channelId,
      messagingChannel: this.messageChannel.id,
      queue: this.queue.export()
    };
    data.queue.queued = data.queue.queued.map(e => ({
      encoded: e.encoded,
      id: e.videoId
    }));
    data.queue.current = (data.queue.current) ? {
      encoded: data.queue.current.encoded,
      id: data.queue.current.videoId,
      restart: Math.max(this.player.seconds * 1000 - 1000, 0) // restart one second earlier
    } : null;
    this.leave();
    this.playerStatus = "online";
    return data;
  }
  preparePlay() {
    if (this.connection.state == Revoice.State.OFFLINE) return "Please let me join first.";
    if (!this.connection.media) {
      let p = new MediaPlayer(true);
      this.player = p;
      this.connection.play(p);
    }
  }
  /**
   * @param {string} channel
   * @returns {Promise<undefined>} fulfills when joined
   */
  join(channel) {
    return new Promise(res => {
      this.voice.join(channel, this.LEAVE_TIMEOUT).then(connection => {
        this.connection = connection;
        connection.once("join", res);
        var roomFetched = false;
        connection.on("roomfetched", () => {
          if (roomFetched) return;
          roomFetched = true;
          this.emit("roomfetched", connection.users)
        });
        this.connection.on("state", (state) => {
          console.log(state);
          if (state == Revoice.State.IDLE && !roomFetched) {
            this.emit("roomfetched", connection.users);
            // TODO: set roomFetched to true?
          }
          this.state = state;
          if (state == Revoice.State.OFFLINE && !this.leaving) {
            this.emit("autoleave");
            return;
          }
          if (state == Revoice.State.IDLE) this.playNext();
        });
      });
    });
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
      }).catch(error => {
        res(error);
      });
    });
  }
  playResult(id, result = 0, next = false) {
    if (!this.searches.has(id)) return null;
    const res = this.searches.get(id)[result];

    let prep = this.preparePlay();
    if (prep) return prep;

    this.addToQueue(res, next);
    if (!this.queue.getCurrent()) this.playNext();
    return res;
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
      if (!this.queue.getCurrent()) this.playNext();
    }).catch(reason => {
      console.log("reason", reason);
      reason = reason || "An error occured. Please contact the support if this happens reocurringly.";
      events.emit("message", reason);
    });
    return events;
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

    if (!this.queue.getCurrent()) this.playNext();
  }
}
