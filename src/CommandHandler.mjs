import { Utils } from "./Utils.mjs";
import { EventEmitter } from "node:events";
import { Message, MessageHandler } from "./MessageHandler.mjs";
import { Client } from "revolt.js";

export class CommandBuilder {
  constructor() {
    this.name = null;
    this.description = null;
    this.id = null;
    this.aliases = [];
    /** @type {Command[]} */
    this.subcommands = [];
    /** @type {Option[]} */
    this.options = [];
    /** @type {CommandRequirement[]} */
    this.requirements = [];
    this.category = "default";
    this.examples = [];

    this.uid = Utils.uid();
  }
}
export class CommandRequirement {

}
export class Option {

}
export class Flag extends Option {

}

export class CommandHandler extends EventEmitter {
  onPing = null;
  pingPrefix = true;
  owners = [];

  /** @type {MessageHandler} */
  messages;
  /** @type {Client} */
  client;

  commandNames = [];
  commands = [];

  /**
   *
   * @param {MessageHandler} handler
   * @param {string} [prefix]
   */
  constructor(handler, prefix="!") {
    super();

    this.messages = handler;
    this.client = handler.client;
    this.prefix = prefix;

    this.helpCommand = "help";

    this.replyHandler = (message, msg) => {
      msg.replyEmbed(this.format(message));
    }

    this.messages.onMessage(this.messageHandler.bind(this));
  }

  /**
   * @param {string} serverId
   * @returns {string}
   */
  getPrefix(serverId) {
    // TODO:
    return this.prefix; // preliminary
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  format(text) {
    return text
      .replace(/\$prefix/gi, this.prefix)
      .replace(/\$helpCmd/gi, this.helpCommand);
  }

  /**
   * @param {Message} msg
   */
  messageHandler(msg) {
    if (!msg || !msg.content) return;
    if (msg.message.mentionIds?.includes(this.client.user.id)) {
      if (msg.content.trim().toUpperCase() === `<@${this.client.user.id}>`) {
        // TODO: permission checking
        return this.onPing(msg);
      }
    }
    const prefix = this.getPrefix(msg.channel.channel.serverId);
    const ping = `<@${this.client.user.id}>`;
    if (!(msg.content.startsWith(prefix) || msg.content.replace(/\u00A0/gi, " ").startsWith(ping))) return;
    // TODO: permission checking
    const len = (msg.content.startsWith(prefix)) ? prefix.length : ping.length;
    const args = msg.content
      .replace(/\u00A0/gi, " ")
      .slice(len)
      .trim()
      .split(" ")
      .map(e => e.trim())

    if (args[0] === this.helpCommand) {
      // TODO: help command
    }

    if (!this.commandNames.includes(args[0].toLowerCase())) {
      // TODO: typo detection
      this.replyHandler("Unknown Command. Use `$prefix$helpCmd` to view all possible commands.", msg);
    }
  }
}
