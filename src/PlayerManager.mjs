import { Revoice } from "revoice.js";
import Player from "./Player.mjs";
import { CommandHandler } from "./CommandHandler.mjs";
import { Message } from "./MessageHandler.mjs";
import { SettingsManager } from "./Settings.mjs";

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

  /**
   *
   * @param {Revoice} revoice
   * @param {SettingsManager} settings
   * @param {CommandHandler} commands
   * @param {Object} config
   * @param {Object} config.config The configuration for the bot. The parsed config.json
   * @param {Object} config.player Any config data that should be passed to new player objects
   */
  constructor(revoice, settings, commands, config) {
    this.revoice = revoice;
    this.commands = commands;
    this.settings = settings;
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
          if (!p.connection.users.find(u => u.id == message.author.id)) {
            msg.replyEmbed("You don't seem to be connected to <#" + c.id + ">. Did you forget to join?");
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
    const user = message.author.id;
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
  async getPlayer(message, promptJoin = true, verifyUser=true) {
    const user = this.revoice.getUser(message.author.id).user;
    var cid = user?.connectedTo;
    // TODO: enable joining dms
    if (message.channel.type === "Group") cid = message.channel.id;
    if (!cid) cid = this.checkVoiceChannels(message);
    var player = this.playerMap.get(cid);
    if (!player && cid) {
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
    const m = await msg.replyEmbed("Leaving...");
    const left = p.leave();
    p.destroy();
    m.editEmbed((left) ? `✅ Successfully Left` : `Not connected to any voice channel`);
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
    });
    p.on("leave", () => {
      // TODO: cleanup
    });
    p.on("message", (m) => {
      if (this.settings.getServer(message.channel.server.id).get("songAnnouncements") == "false") return;
      message.channel.sendEmbed(m);
    });
    p.on("roomfetched", () => {
      // TODO: observe voice users
    });
    this.playerMap.set(cid, p);
    message.replyEmbed("Joining Channel...").then(async message => {
      await p.join(cid);
      message.editEmbed(`✅ Successfully joined <#${cid}>`);
      cb(p);

      // TODO: listen to joining/leaving users
    });
  }
}
