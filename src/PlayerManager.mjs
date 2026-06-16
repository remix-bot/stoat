import { Revoice } from "revoice.js";
import Player from "./Player.mjs";
import { CommandHandler } from "./CommandHandler.mjs";
import { Message } from "./MessageHandler.mjs";
import { SettingsManager } from "./Settings.mjs";
import { Dashboard } from "./dashboard/Dashboard.mjs";

export class PlayerManager {
  /** @type {Revoice} */
  revoice;
  /** @type {SettingsManager} */
  settings;
  /** @type {CommandHandler} */
  commands;
  /** @type {Map<string, Player>} */
  playerMap = new Map();
  /** @type {Object} */
  config;
  /** @type {Object} */
  playerConfig;
  /** @type {("online"|"stopping"|"offline")} */
  state = "online";

  /**
   *
   * @param {Revoice} revoice
   * @param {SettingsManager} settings
   * @param {CommandHandler} commands
   * @param {Dashboard} dashboard
   * @param {Object} config
   * @param {Object} config.config The configuration for the bot. The parsed config.json
   * @param {Object} config.player Any config data that should be passed to new player objects
   */
  constructor(revoice, settings, commands, dashboard, config) {
    this.revoice = revoice;
    this.commands = commands;
    this.settings = settings;
    this.dashboard = dashboard;
    this.config = config.config;
    this.playerConfig = config.player;
  }

  /**
   * Prompts the user to select a voice channel to connect to and returns the id of it after connecting.
   * @param {Message} msg
   * @returns {Promise<string|null>}
   */
  promptVC(msg) {
    return new Promise(async res => {
      if (msg.channel.channel.type === "Group") {
        return this.initPlayer(msg, msg.channel.id, (p) => {
          if (!p.connection.users.find(u => u.id == msg.author.id)) {
            msg.replyEmbed("You don't seem to be connected to <#" + msg.channel.id + ">. Did you forget to join?");
          }
          res(msg.channel.id);
        });
      }
      const channels = msg.channel.server.channels.filter(c => c.isVoice);
      const reactions = ["🥇", "🥈", "🥉", "🥇", "🥈", "🥉", "🥇", "🥈", "🥉",];//[":one:",":two:",":three:",":four:",":five:",":six:",":seven:",":eight:",":nine:"];
      if (channels.length != 0) {
        var channelSelection = "Please select one of the following channels by clicking on the reactions below\n\n";
        channels.slice(0, 9).forEach((c, i) => {
          channelSelection += (i + 1) + ". <#" + c.id + ">\n";
        });
      }
      const m = await msg.replyEmbed({
        embedText: ((channelSelection) ? channelSelection + "\n**..or**" : "Please") + " send a message with the voice channel! (Mention/Id/Name)\nSend 'x' to cancel.",
        interactions: (channels.length != 0) ? {
          restrict_reactions: true,
          reactions: reactions.slice(0, Math.min(channels.length, 9))
        } : undefined
      });
      var unsubscribeMessages;
      const unsubscribeReactions = m.onReaction(reactions, (e) => {
        const idx = reactions.findIndex(r => r === e.emoji_id);
        const c = channels[idx];
        this.initPlayer(msg, c.id, (p) => {
          if (!p.connection.users.find(u => u.id == msg.author.id)) {
            msg.replyEmbed("You don't seem to be connected to <#" + c.id + ">. Did you forget to join?", true);
          }
          res(c.id);
        });

        unsubscribeMessages();
        unsubscribeReactions();
      }, msg.author);

      unsubscribeMessages = msg.channel.onMessageUser((m) => {
        if (m.content.toLowerCase() === "x") {
          unsubscribeMessages();
          unsubscribeReactions();
          m.replyEmbed("Cancelled!");
          return res(false);
        }
        if (!this.commands.validateInput("voiceChannel", m.content, m)) {
          return m.replyEmbed("Invalid voice channel. Please try again and check capitalization! (`x` to cancel)");
        }
        const channel = this.commands.formatInput("voiceChannel", m.content, m);
        unsubscribeMessages();
        unsubscribeReactions();
        this.initPlayer(m, channel, (p) => {
          if (!p.connection.users.find(u => u.id == msg.author.id)) {
            msg.replyEmbed("You don't seem to be connected to <#" + channel + ">. Did you forget to join?");
          }
          res(channel);
        });
      }, msg.author);
    });
  }

  /**
   * Searches the channels of the current server and returns the channel the user is found to be in, if found.
   * @param {Message} message
   * @returns {string} channelId
   */
  checkVoiceChannels(message) {
    if (!message) return null;
    const user = message.authorId;
    var id = null;
    message.channel.server.channels.forEach(c => {
      if (!c.isVoice) return;
      if (!c.voiceParticipants.has(user)) return;
      id = c.id;
    });
    return id;
  }
  /**
   * Returns the current player instance for the author of the message.
   * If the user is not connected yet and promptJoin is set to true, connecting to the channel will be attempted.
   * @param {Message} message
   * @param {boolean} [promptJoin] Defaults to true
   * @returns {Promise<Player>}
   */
  async getPlayer(message, promptJoin = true, verifyUser = true) {
    if (this.state !== "online") {
      message.replyEmbed("Shutting down. Please wait a few minutes until you try again. If this happens a lot, please contact an admin.", true);
      return false;
    }
    const user = this.revoice.getUser(message.author.id).user;
    var cid = user?.connectedTo;
    // TODO: enable joining dms
    if (message.channel.type === "Group") cid = message.channel.id;
    if (!cid) cid = this.checkVoiceChannels(message);
    var player = this.playerMap.get(cid);
    if (!player && cid && promptJoin) {
      player = await (new Promise((res) => {
        this.initPlayer(message, cid, (p) => {
          res(p);
        });
      }));
      if (!player.connection.users.find(u => u.id == message.author.id)) {
        message.replyEmbed("You don't seem to be connected to <#" + cid + ">. Did you forget to join?", true);
      }
      return player;
    }
    if (!((verifyUser) ? user : true) || !cid || !player) {
      if (!promptJoin) {
        message.replyEmbed("It doesn't look like we're in the same voice channel.")
        return false;
      }
      var success = await this.promptVC(message);
      if (!success) return null;
      cid = success;
    }
    player = this.playerMap.get(cid);
    return player;
  }
  /**
   * @param {Message} msg
   * @param {string} cid
   * @returns {Promise<undefined>}
   */
  async leave(msg, cid) {
    const p = this.playerMap.get(cid);
    if (!p) return msg.replyEmbed(`Player not found`);
    const m = await msg.replyEmbed("Leaving...");
    const left = p.leave();
    p.destroy();
    this.playerMap.delete(cid);
    m.editEmbed((left) ? `✅ Successfully Left` : `Not connected to any voice channel`);
  }
  /**
   * @param {string} cid
   * @returns
   */
  hasPlayer(cid) {
    return this.playerMap.has(cid);
  }
  /**
   * @param {string} cid
   * @returns
   */
  getPlayerFromMap(cid) {
    return this.playerMap.get(cid);
  }


  /**
   * @param {Message} message
   * @param {string} cid
   * @param {Function} [cb] Callback on success. Player is given as parameter.
   */
  initPlayer(message, cid, cb=()=>{}) {
    if (!this.commands.client.channels.has(cid)) {
      return message.replyEmbed("Couldn't find the channel `" + cid + "`\nUse the help command to learn more about this.");
    }
    if (this.playerMap.has(cid)) {
      cb(this.playerMap.get(cid));
      return message.replyEmbed("Already joined <#" + cid + ">.");
    }
    const p = new Player(this.config.token, {
      ...this.playerConfig,
      messageChannel: message.channel
    });
    p.on("autoleave", () => {
      message.channel.sendEmbed("Left channel <#" + cid + "> because of inactivity.");
      p.destroy();
      this.playerMap.delete(cid);
    });
    const unsubscribe = this.setupEvents(p);
    p.on("leave", () => {
      // TODO: cleanup
      this.dashboard.playerUpdate({
        type: "close"
      }, p);
      unsubscribe();
      this.playerMap.delete(cid);
    });
    p.on("message", (m) => {
      if (this.settings.getServer(message.channel.server.id).get("songAnnouncements") == "false") return;
      message.channel.sendEmbed(m);
    });
    p.on("roomfetched", () => {
      // TODO: observe voice users
      this.dashboard.playerUpdate({
        type: "init"
      }, p);
    });
    this.playerMap.set(cid, p);
    message.replyEmbed("Joining Channel...").then(async message => {
      await p.join(cid);
      message.editEmbed(`✅ Successfully joined <#${cid}>`);
      cb(p);

      // TODO: listen to joining/leaving users
      p.connection.on("userJoin", (user) => {
        console.log("join", user);
        const u = Dashboard.convertUser(this.commands.client.users.get(user.id));
        this.dashboard.updatePlayer({
          type: "join",
          data: u,
        }, p);
        this.dashboard.updateUser({
          type: "join",
          data: cid,
        }, u);
      });
      p.connection.on("userleave", (user) => {
        const u = Dashboard.convertUser(this.commands.client.users.get(user.id));
        this.dashboard.updatePlayer({
          type: "leave",
          data: u,
        }, p);
        this.dashboard.updateUser({
          type: "leave",
          data: cid,
        }, u);
      });
    });
  }
  /**
   * @param {Player} player
   */
  setupEvents(player) {
    const emit = (event, data) => {
      const payload = {
        type: event,
        data: data
      };
      console.log("emit", payload);
      this.dashboard.updatePlayer(payload, player);
    }
    const startPlayHandler = song => {
      emit("startplay", Dashboard.convertVideo(song));
    }
    const streamStartPlayHandler = (date) => {
      emit("streamStartPlay", date);
    }
    const stopPlayHandler = () => {
      emit("stopplay");
    }
    const volumeHandler = (v) => {
      emit("volume", v);
    }
    const userHandler = (u, type) => {
      // TODO:
      //emit("user" + type, this.except(u, "api"));
    }
    const playbackHandler = (playing) => {
      emit((playing) ? "resume" : "pause", {
        elapsedTime: player.player.seconds * 1000
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
    const queueHandler = (e) => {
      const serialised = {
        type: e.type
      };
      console.log("queue");
      switch (e.type) {
        case "add":
          serialised.data = {
            append: e.data.append,
            data: Dashboard.convertVideo(e.data.data),
          }
          break;
        case "remove":
          serialised.data = {
            index: e.data.index,
            removed: Dashboard.convertVideo(e.data.removed),
            old: e.data.old.map(v => Dashboard.convertVideo(v)),
            new: e.data.new.map(v => Dashboard.convertVideo(v))
          }
          break;
        case "shuffle":
          serialised.data = e.data.map(v => Dashboard.convertVideo(v));
          break;
        case "update":
          serialised.data = {
            current: Dashboard.convertVideo(e.data.current),
            old: Dashboard.convertVideo(e.data.old),
            loop: e.data.loop,
          }
          break;
        default:
          break;
      }

      emit("queue", serialised);
    }
    player.on("startplay", startPlayHandler);
    player.on("streamStartPlay", streamStartPlayHandler);
    player.on("stopplay", stopPlayHandler);
    player.on("volume", volumeHandler);
    player.on("userupdate", userHandler);
    player.on("playback", playbackHandler);
    player.queue.on("queue", queueHandler);
    return () => {
      player.removeListener("startplay", startPlayHandler);
      player.removeListener("streamStartPlay", streamStartPlayHandler);
      player.removeListener("stopplay", stopPlayHandler);
      player.removeListener("volume", volumeHandler);
      player.removeListener("userupdate", userHandler);
      player.removeListener("playback", playbackHandler);
      player.queue.removeListener("queue", queueHandler);
    };
  }

  /**
   * Instructs the PlayerManager to shut down gracefully, storing the current state of each player and returning those states.
   */
  close() {
    this.state = "stopping";

    const players = this.playerList().filter(p => p.connection.state !== "off").map(p => {
      return p.close();
    });
    this.state = "offline";
    return players;
  }

  /**
   * @returns {string[]}
   */
  channelList() {
    const channels = [];
    for (let [k, _v] of this.playerMap) {
      channels.push(k);
    }
    return channels;
  }
  /**
   * @returns {Player[]}
   */
  playerList() {
    const players = [];
    for (let [_k, v] of this.playerMap) {
      players.push(v);
    }
    return players;
  }
}
