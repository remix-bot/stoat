import { Client, User, Message as StoatMessage } from "revolt.js";

export class MessageHandler {
  /**
   * Stoat.js client instance
   * @type {Client}
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

  #masquerade(msg) {
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
      color: "#e9196c",
      ...options // including media, icon_url, title...
    }
    return {
      description: "" + text, // convert bools and numbers to strings
      ...options
    }
  }
  #createEmbed(text, message, options = {}) {
    return {
      content: " ",
      embeds: [this.#embedify(text, options)],
      masquerade: this.#masquerade(message)
    }
  }

  // TODO: check permissions
  reply(replyingTo, message, mention = false) {
    return replyingTo.reply(message, mention);
  }
  replyEmbed(replyingTo, message, options = {}) {
    options = {
      mention: false,
      embed: {},
      ...options
    }
    const embed = this.#createEmbed(message, replyingTo, options.embed);
    return replyingTo.reply(embed, options.mention);
  }
}

export class Message {
  /**
   * The actual underlying message instance
   * @type {StoatMessage}
   */
  message;
  handler;

  constructor(message, handler) {
    this.message = message;
    this.handler = handler;
  }

  get content() {
    return this.message.content;
  }
  get id() {
    return this.message.id;
  }
  get author() {
    return this.message.author;
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
  replyEmbed(content, mention = false, embedOptions) {
    return this.handler.replyEmbed(this.message, content, {
      mention,
      embed: embedOptions
    });
  }
}
