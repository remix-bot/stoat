import { Channel, Server, User, VoiceParticipant } from "revolt.js";
import { Remix } from "../../index.mjs";
import { CommandBuilder, CommandHandler, Option } from "../CommandHandler.mjs";
import Player from "../Player.mjs";
import { Utils } from "../Utils.mjs";
import { DatabaseManager } from "./DatabaseManager.mjs";
import { RedisHandler } from "./RedisHandler.mjs";


export class Dashboard {
  enabled = false;
  expiryTime = 1000 * 60 * 60 * 6;
  /**
   *
   * @param {Remix} remix
   * @param {Object} opts
   * @param {boolean} opts.enabled Wether the Dashboard is enabled and connections should be attempted
   * @param {Object} opts.redis
   * @param {string} opts.redis.url Connection string in the following format: redis[s]://[[username][:password]@][host][:port][/db-number]
   * @param {Object} opts.mysql
   */
  constructor(remix, opts) {
    this.enabled = opts?.enabled;
    this.remix = remix;

    this.db = new DatabaseManager(opts.mysql);

    if (!this.enabled) return this;

    this.redis = new RedisHandler(opts.redis);
    this.redis.setRequestHandler(async (data) => {
      switch (data.type) {
        case "fetchPlayers":
          return this.remix.players.playerList().map(p => Dashboard.convertPlayer(p));
        case "user":
          return Dashboard.convertUser(this.remix.client.users.get(data.key));
        case "sharedServers":
          return await this.remix.getSharedServers(this.remix.client.users.get(data.key));
        case "server":
          try {
            const member = await this.remix.client.servers.get(data.key)?.fetchMember(data.accessor);
            const server = Dashboard.convertServer(this.remix.client.servers.get(data.key));
            server.channels.filter(e => member.hasPermission(this.remix.client.channels.get(e.id), "ViewChannel"));
            return server;
          } catch (e) {
            if (Utils.isJSON(e)) {
              if (JSON.parse(e).type === "NotFound") return { error: "Unauthorised." };
            }
            const id = Utils.uid();
            console.log(e, id);
            return { error: "An error occured. Id: " + id };
          }
        case "commands":
          return this.remix.handler.commands.map(c => Dashboard.convertCommand(c, this.remix.handler));

        case "function":
          return await this.runFunction(data.params);
      }
    });
  }
  /**
   * @param {Object} params
   * @param {string} params.func
   * @param {any} [params.data]
   * @returns {Promise<any>}
   */
  async runFunction(params) {
    var user;
    if (!!params?.data?.user) {
      try {
        user = await this.remix.client.users.fetch(params.data.user);
      } catch (e) {
        console.log(e);
        return { error: "Invalid User" };
      }
    }
    switch (params.func) {
      case "join":
        var voiceChannel, textChannel;
        try {
          voiceChannel = await this.remix.messages.getOrFetchChannel(params.data.channel);
          textChannel = await this.remix.messages.getOrFetchChannel(params.data.text);
        } catch (e) {
          console.log(e);
          return { error: "Invalid Channel" };
        }
        if (!user) return { error: "Invalid user" };
        if (this.remix.players.hasPlayer(voiceChannel.id)) return { message: "Already Connected" };
        const message = await textChannel.sendEmbedAsUser(`[Web] Joining <#${voiceChannel.id}>`, user);
        this.remix.players.initPlayer(message, voiceChannel.id);
        return { message: "Joining" };
      case "pausePlayback":
        var id = params.data.player;
        var player = this.remix.players.getPlayerFromMap(id);
        if (!player) return { error: "Player not found" };
        if (!user) return { error: "Invalid user" };
        var msg = player.pause() || "Paused successfully";
        await player.messageChannel.sendEmbedAsUser(msg, user)
        return { message: msg };
      case "resumePlayback":
        var id = params.data.player;
        var player = this.remix.players.getPlayerFromMap(id);
        if (!player) return { error: "Player not found" };
        if (!user) return { error: "Invalid user" };
        var msg = player.resume() || "Resume Successfully";
        await player.messageChannel.sendEmbedAsUser(msg, user)
        return { message: msg };
      case "skip":
        var id = params.data.player;
        var player = this.remix.players.getPlayerFromMap(id);
        if (!player) return { error: "Player not found" };
        if (!user) return { error: "Invalid user" };
        var msg = player.skip() || "Skipped Song";
        await player.messageChannel.sendEmbedAsUser(msg, user)
        return { message: msg };
      case "volume":
        var id = params.data.player;
        var player = this.remix.players.getPlayerFromMap(id);
        if (!player) return { error: "Player not found" };
        if (!user) return { error: "Invalid user" };
        var msg = player.setVolume(params.data.volume);
        await player.messageChannel.sendEmbedAsUser(msg, user)
        return { message: msg };
      case "addToQueue":
        var id = params.data.player;
        var player = this.remix.players.getPlayerFromMap(id);
        if (!player) return { error: "Player not found" };
        if (!user) return { error: "Invalid user" };
        /** @type {"video"|"radio")} */
        var type = params.data.type;
        var query = params.data.query;
        if (type === "radio") {
          const radio = this.remix.config.radio.find(e => e.name === query);
          if (!radio) {
            return { error: "Invalid radio station" };
          }
          player.messageChannel.sendEmbedAsUser("Adding radio station to queue...", user).then(m => {
            player.playRadio(radio);
            m.editEmbedAsUser(`Added ${radio.detailedName} to the queue`, user);
          });
          return { message: "Adding radio station" };
        }
        msg = player.play(query);
        if (typeof msg === "string") {
          return { error: msg };
        }
        console.log(msg);
        if (!!msg) {
          player.messageChannel.sendEmbedAsUser("Searching...", user).then(m => {
            msg.on("message", (message) => {
              m.editEmbedAsUser(message, user);
            });
          });
        }
        return { message: "Adding to queue" };
      case "leave":
        if (!user) return { error: "Invalid user" };
        if (!this.remix.players.hasPlayer(params.data.channel)) return { error: "Unknown player" };
        player = this.remix.players.getPlayerFromMap(params.data.channel);
        if (!player.connection.users?.find(u => u.id === user.id)) return { error: "You have to be in the voice channel to perform this action" };
        player.messageChannel.sendEmbedAsUser("Leaving Channel <#" + params.data.channel + ">", user).then(m => {
          this.remix.players.leave(m, params.data.channel);
        });
        return { message: "Leaving" };
      case "testConnection":
        try {
          const channel = await this.remix.messages.getOrFetchChannel("01GS0SMQ660JH731K29T2C9RM9");
          await channel.sendEmbed("Connection Test. Time: <t:" + Math.floor(Date.now() / 1000) + ":f>")
        } catch (e) {
          console.log("Connection test failed: ", e);
          return { error: e.toString() }
        }
        return { success: true }
    }
  }

  sendMessage() {

  }
  /**
   * @typedef APIUser
   * @property {string} id
   * @property {string} discriminator
   * @property {string} username
   * @property {string} displayName
   * @property {Object} avatar
   * @property {string} avatar.url
   */
  /**
   * @param {User} user
   * @returns {APIUser}
   */
  static convertUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      discriminator: user.discriminator,
      username: user.username,
      displayName: user.displayName,
      avatar: {
        url: user.avatarURL || user.defaultAvatarURL
      },
    }
  }
  /**
   * @typedef {Object} Video
   * @property {("radio"|"video"|"external")} type
   * @property {string} title
   * @property {string} description
   * @property {string} videoId
   * @property {string} url
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
   * @param {Video} vid
   */
  static convertVideo(vid) {
    if (!vid) return null;
    return {
      title: vid.title,
      url: (vid.type === "radio") ? vid.author.url : vid.url,
      videoId: vid.videoId,
      type: vid.type,
      duration: (vid.type === "radio") ? "--:--" : ((typeof vid.duration === "object") ? vid.duration.timestamp : Utils.prettifyMS(vid.duration, "h:!m:!s")),
      description: vid.description,
      artist: {
        name: vid.author?.name || vid.artist,
        url: vid.author?.url
      },
      thumbnail: vid.thumbnail
    }
  }
  /**
   * @param {Channel} channel
   */
  static convertChannel(channel) {
    if (!channel) return null;
    return {
      name: channel.name,
      displayName: channel.displayName,
      id: channel.id,
      icon: channel.iconURL || null,
      description: channel.description,
      isVoice: channel.isVoice,
      voiceParticipants: Array.from(channel.voiceParticipants.values()).map(p => {
        const user = p.client.users.get(p.userId);
        if (!user) return p.userId;
        return Dashboard.convertUser(user); // VoiceParticipant appears to have a client property with a client object
      }),
      mature: channel.mature,
      serverId: channel.serverId
    }
  }
  /**
   * @param {Server} server
   */
  static convertServer(server) {
    if (!server) return null;
    return {
      name: server.name,
      id: server.id,
      icon: server.iconURL || null,
      channelIds: Array.from(server.channelIds.values()),
      description: server.description,
      ownerId: server.ownerId,
      channels: server.channels.map(Dashboard.convertChannel),
    }
  }
  /**
   *
   * @param {Player} player
   */
  static convertPlayer(player) {
    const channel = player.client.channels.get(player.connection.channelId);
    return {
      loop: (player.queue.loop * 1) + (player.queue.songLoop * 2), // decode using bitwise shifts
      paused: player.paused,
      volume: (player.connection?.preferredVolume || 1) * 100,
      queue: {
        current: Dashboard.convertVideo(player.queue.current),
        data: player.queue.data.map(v => Dashboard.convertVideo(v))
      },
      users: player.connection.users?.map(u => u.id), // TODO: investigate how users can be undefined
      channel: (!!player.connection) ? Dashboard.convertChannel(channel) : null,
      server: (!!player.connection) ? Dashboard.convertServer(channel.server) : null,
    }
  }
  /**
   * @param {Option} opt
   */
  static convertOption(opt) {
    return {
      type: opt.type,
      name: opt.name,
      choices: opt.choices,
      description: opt.description,
      required: opt.required,
      uid: opt.uid,
      defaultValue: opt.defaultValue,
      dynamicDefaultPresent: !!opt.dynamicDefault
    }
  }
  /**
   *
   * @param {CommandBuilder} com
   * @param {CommandHandler} commands
   * @returns
   */
  static convertCommand(com, commands) {
    return {
      name: com.name,
      description: com.description,
      uid: com.uid,
      aliases: com.aliases,
      subcommands: com.subcommands.map(c => Dashboard.convertCommand(c, commands)),
      category: com.category,
      examples: com.examples,
      usage: commands.helpHandler.commandUsage(com, {
        message: {
          server: { id: "01FZ62C8WFS3HBEN5QTN8RZRQG" }
        }
      }),
      // TODO: add requirements
      options: com.options.map(o => Dashboard.convertOption(o)),
    }
  }
  update() {

  }
  /**
   * Global player update
   * @param {Object} details
   * @param {Player} player
   */
  playerUpdate(details, player) {
    if (!this.enabled) return;
    const serialised = Dashboard.convertPlayer(player);
    this.redis.send(this.redis.platform + ":players", JSON.stringify({
      ...details,
      player: serialised
    }));
  }
  /**
   * @param {Object} details
   * @param {Player} player
   */
  updatePlayer(details, player) {
    if (!this.enabled) return;
    const channel = this.redis.platform + ":player_" + player.connection.channelId;
    this.redis.send(channel, JSON.stringify(details));
  }
  /**
   * @param {Object} details
   * @param {User} user
   */
  userUpdate(details, user) {
    if (!this.enabled) return;
    const channel = this.redis.platform + ":users";
    this.redis.send(channel, JSON.stringify({
      ...details,
      user: Dashboard.convertUser(user)
    }));
  }
  updateUser(details, user) {
    if (!this.enabled) return;
    const channel = this.redis.platform + ":user_" + user.id;
    this.redis.send(channel, JSON.stringify(details));
  }
  /**
   *
   * @param {string} user
   * @param {string} code
   * @returns {Promise<string|null>} null == success
   */
  async confirmLogin(user, code) {
    if (!this.enabled) return "Dashboard not enabled.";
    var res;
    try {
      res = await this.db.execute("SELECT * FROM login_codes WHERE user=?", [user]);
    } catch (e) {
      const id = Utils.uid();
      console.log("[Dashboard] Mysql error, id: ", id, e);
      return "An error occured, please contact an administrator if this happens again. Error id: `" + id + "`";
    }
    if (res.length === 0) return "If this is a valid code, it was not created for your account.";
    for (let i = 0; i < res.length; i++) {
      if ((await this.db.compareHash(code, res[i].token))) {
        if (Date.now() - this.expiryTime > (new Date(res[i].createdAt)).getTime()) return "Login token expired";
        await this.db.execute("UPDATE login_codes SET verified=true WHERE id=?", [res[i].id]);
        return null;
      }
    }
    return "Invalid code.";
  }
}
