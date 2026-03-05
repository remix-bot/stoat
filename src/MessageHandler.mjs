import { Client, User, Message as StoatMessage, Channel as StoatChannel } from "revolt.js";

export class MessageHandler {
  /**
   * Stoat.js client instance
   * @type {Client}
   * @public
   */
  client;
  observedReactions;

  constructor(client) {
    this.client = client;

    this.observedReactions = new Map();

    this.setupEvents();
  }
  setupEvents() {
    const reactionUpdate = (message, user, emoji) => {
      const event = { user_id: user, emoji_id: emoji };
      if (!this.observedReactions.has(message.id)) return;
      if (event.user_id == this.client.user.id) return;
      const observer = this.observedReactions.get(message.id);
      if (!observer.reactions.includes(event.emoji_id)) return;
      if (observer.user) if (observer.user != user) return;
      observer.cb(event, message);
    }
    this.client.on("messageReactionAdd", reactionUpdate);
    this.client.on("messageReactionRemove", reactionUpdate);
  }

  /**
   * Checks if the bot has the specified permissions in a specific channel and returns missing ones.
   *
   * @param {string[]} permissions An array of permissions to check for.
   * @param {StoatChannel} channel The channel to check the permissions in.
   * @returns {string[]} Missing permissions.
   */
  checkPermissions(permissions, channel) {
    return permissions.filter(p => !channel.havePermission(p));
  }
  /**
   *
   * @param {string[]} permissions Permissions to check for.
   * @param {StoatMessage} message The message to reply to in case of missing permissions.
   * @returns {Promise<boolean>} If all permissions are given.
   */
  async assertPermissions(permissions, message) {
    const missing = this.checkPermissions(permissions, message.channel);
    if (missing.length == 0) return true;


    if (missing.includes("SendMessage")) {
      try {
        const dm = await message.member?.user.openDM();
        dm.sendMessage({
          content: " ",
          embeds: [
            this.#embedify("I am unable to send messages in <#" + message.channelId + ">. Please contact a server administrator and grant me the \"SendMessage\" permission.")
          ]
        });
      } catch (e) {
        console.log("[MessageHandler] Error sending message in DMs (" + message.authorId + "): ", e);
      }
      return false;
    }

    this.replyEmbed(message, "I need the following permissions: `" + missing.join(",") + "`. Please contact a server administrator to address this.", { mention: true });

    return false;
  }

  /**
   * Listen for new messages
   *
   * @param {function} listener A callback function which will be called with a {Message} object
   */
  onMessage(listener) {
    this.client.on("messageCreate", (msg) => {
      listener(new Message(msg, this));
    });
  }

  /**
   * Get a cached message by id.
   *
   * @param {string} id The message id
   * @returns {Message}
   */
  get(id) {
    const msg = this.client.messages.get(id);
    if (!msg) return null;
    return new Message(msg, this);
  }
  /**
   * Either gets a message from cache or fetches it.
   *
   * @param {string} id message id
   * @param {string} channelId channel d
   * @returns {Promise<Message>}
   */
  async getOrFetch(id, channelId) {
    const msg = this.get(id);
    if (msg) return msg;

    return new Message(await this.client.messages.fetch(channelId, id), this);
  }
  /**
   * Get a cached channel by id.
   *
   * @param {string} id channel id
   * @returns {Channel}
   */
  getChannel(id) {
    const c = this.client.channels.get(id);
    return new Channel(c, this);
  }
  /**
   * Analog to MessageHandler.getOrFetch
   * @param {string} id
   * @returns {Promise<Channel>}
   */
  async getOrFetchChannel(id) {
    const c = this.getChannel(id);
    if (c) return c;
    return new Channel(await this.client.channels.fetch(id), this);
  }

  observeReactions(msg, reactions, cb, user) {
    this.observedReactions.set(msg.id, {
      reactions: reactions,
      user: (user) ? user.id : null,
      cb
    });
    return msg.id;
  }
  unobserveReactions(i) {
    return this.observedReactions.delete(i);
  }

  #masquerade(channel) {
    return null; // for now
    // TODO: integrate settings
    let a = this.getSettings(msg).get("pfp");
    let avatar = null;
    if (a == "dark") {
      avatar = ""; // TODO
    } else if (a == "light") {
      avatar = ""; // TODO
    } else if (a == "mono") {
      avatar = ""; // TODO
    } else if (a != "default") {
      avatar = a;
    }
    return (avatar) ? {
      name: this.client.user.displayName,
      avatar: avatar
    } : null;
  }
  #embedify(text = "", options = {}) {
    options = {
      colour: "#e9196c",
      ...options // including media, icon_url, title...
    }
    return {
      description: "" + text, // convert bools and numbers to strings
      ...options
    }
  }
  #createEmbed(text, message, options = {}) {
    var channel = message;
    if (message instanceof StoatMessage) {
      channel = message.channel;
    }
    return {
      content: " ",
      embeds: [this.#embedify(text, options)],
      masquerade: this.#masquerade(channel)
    }
  }

  /**
   * @param {StoatMessage} replyingTo
   * @param {string} message
   * @param {boolean} mention
   * @returns {Promise<StoatMessage>}
   */
  async reply(replyingTo, message, mention = false) {
    if (!(await this.assertPermissions(["SendMessage"], replyingTo))) return null;
    return new Message(await replyingTo.reply(message, mention), this);
  }

  /**
   * @param {StoatMessage} replyingTo
   * @param {string} message
   * @param {Object} options TODO, view code for defaults and possible options
   * @returns {Promise<StoatMessage>}
   */
  async replyEmbed(replyingTo, message, options = {}) {
    if (this.checkPermissions(["SendEmbeds", "SendMessage"], replyingTo.channel).length != 0) {
      return this.reply(replyingTo, message, options.mention);
    }
    options = {
      mention: false,
      embed: {},
      ...options
    }
    const embed = this.#createEmbed(message, replyingTo, options.embed);
    return new Message(await replyingTo.reply(embed, options.mention), this);
  }
  /**
   * @param {StoatChannel} channel
   * @param {string} message
   * @returns {Promise<Message>}
   */
  async sendMessage(channel, message) {
    // TODO: check permissions
    return new Message(await channel.sendMessage(message));
  }
  /**
   * @param {StoatChannel} channel
   * @param {string} content
   * @param {Object} options
   * @returns {Promise<Message>}
   */
  async sendEmbed(channel, content, options={}) {
    // TODO: check permissions
    const embed = this.#createEmbed(content, channel, options);
    return channel.sendMessage(embed);
  }

  editEmbed(message, newContent, options={}) {
    // TODO: permission checking
    const embed = this.#createEmbed(newContent, message, options);
    return message.edit(embed);
  }

  /**
   *
   * @param {PageBuilder} builder A configured PageBuilder with the content of the pages.
   * @param {StoatMessage} message Message to reply to.
   * @param {Object} options
   * @param {boolean} [options.mention=false] Wether the original message should be pinged.
   * @returns {Promise<undefined>} The promise resolves when the setup finishes.
   */
  async initPagination(builder, message, options) {
    options = {
      mention: false,
      ...options
    };
    if (!(await this.assertPermissions(["React", "SendMessage"], message))) {
      return;
    }

    const arrows = [ "👈", "👉" ];
  }
}

export class Channel {
  /**
   * The actual underlying stoat.js channel instance
   * @type {StoatChannel}
   */
  channel;
  /** @type {MessageHandler} */
  handler;

  /**
   * @param {StoatChannel channel
   * @param {MessageHandler} handler
   */
  constructor(channel, handler) {
    this.channel = channel;
    this.handler = handler;
  }

  /**
   * @param {string} content
   * @returns {Promise<Message>}
   */
  sendMessage(content) {
    return this.handler.sendMessage(this.channel, content);
  }
  /**
   * @param {string} content
   * @param {Object} embedOptions
   * @returns {Promise<Message>}
   */
  sendEmbed(content, embedOptions={}) {
    return this.handler.sendEmbed(this.channel, content, embedOptions);
  }
}

export class Message {
  /**
   * The actual underlying message instance
   * @type {StoatMessage}
   */
  message;
  /** @type {MessageHandler} */
  handler;

  constructor(message, handler) {
    this.message = message;
    this.handler = handler;
  }

  /**@type {string} */
  get content() {
    return this.message.content;
  }
  /**@type {string} */
  get id() {
    return this.message.id;
  }
  /** @type {User} */
  get author() {
    return this.message.author;
  }
  /** @type {Channel} */
  get channel() {
    return this.handler.getChannel(this.message.channel.id);
  }

  /**
   * onReaction Listens for reactions to this message. If called twice with different arguments, the latest function call will be valid and function as an observer.
   *
   * @param {string[]} reactions The reactions to listen to.
   * @param {function} callback Will be called if a matching reaction event is observed.
   * @param {User} user A stoat.js user object of the user you want to listen for.
   * @returns {function} close A function with zero arguments that unobserves this message. The callback will not be called again.
   */
  onReaction(reactions, callback, user=null) {
    const oid = this.handler.observeReactions(this.message, reactions, callback, user);
    return () => {
      this.handler.unobserveReactions(oid);
    }
  }

  reply(content, mention = false) {
    return this.handler.reply(this.message, content, mention);
  }
  replyEmbed(content, mention = false, embedOptions={}) {
    return this.handler.replyEmbed(this.message, content, {
      mention,
      embed: embedOptions
    });
  }

  editEmbed(content, embedOptions={}) {
    return this.handler.editEmbed(this.message, content, embedOptions);
  }
}

export class PageBuilder {
  form = "";
  maxLinesPerPage = 2;
  /**@type {string[]} */
  content = [];

  initiated = false;
  pages = [];

  /**
   * @param {string|string[]} content The content that should be paginated. Strings are split along `\n`
   */
  constructor(content) {
    if (!Array.isArray(content)) {
      this.content = content.split("\n");
      return;
    }
    this.content = content;
  }

  /**
   * @param {string} form The template defining the structure of the paginated message.
   * @returns
   */
  setForm(form) {
    this.form = form;
    return this;
  }
  /**
   * @param {number} [maxLinesPerPage=2] How many lines (separated by `\n`) should be displayed per page.
   * @returns
   */
  setMaxLines(maxLinesPerPage=2) {
    this.maxLinesPerPage = maxLinesPerPage;
    return this;
  }

  createPages() {
    if (this.initiated) return this.pages;

    const lines = this.content;
    const pages = [];
    for (let i = 0, n = 0; i < lines.length; i++, (i % this.maxLinesPerPage == 0) ? n++ : n) {
      let line = lines[i];
      if (!pages[n]) pages[n] = [];
      pages[n].push(line);
    }

    this.pages = pages;
    this.initiated = true;
    return pages;
  }

  /**
   * @param {number} n The zero-indexed page to return
   * @returns {string} The page content
   */
  getPage(n) {
    const pages = this.createPages();
    return form
      .replace(/\$maxPage/gi, pages.length)
      .replace(/\$currentPage/gi, n + 1)
      .replace(/\$content/gi, pages[n]);
  }
}
