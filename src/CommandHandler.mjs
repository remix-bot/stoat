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
  /** @type {CommandBuilder[]} */
  commands = [];

  invalidFlagError = "Invalid flag `$invalidFlag`. It doesn't match any options on this command.\n`$previousCmd $invalidFlag`";

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
      msg.replyEmbed(this.format(message, msg.channel.channel.serverId));
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
   * @param {string} [serverId]
   * @returns {string}
   */
  format(text, serverId) {
    const prefix = (!serverId) ? this.prefix : this.getPrefix(serverId);
    return text
      .replace(/\$prefix/gi, prefix)
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
      return;
    }
    return this.processCommand(this.commands.find(e => e.aliases.includes(args[0].toLowerCase())), args, msg);
  }
  /**
   * @param {CommandBuilder} cmd
   * @param {string[]} args
   * @param {Message} msg
   * @param {string|boolean} [previous] Recursively set value, **internally managed**.
   * @param {boolean} external Determines if this was called outside of a CommandHandler.
   */
  processCommand(cmd, args, msg, previous = false, external = false) {
    if (cmd.requirements.length > 0 && !external) {
      if (!this.assertRequirements(cmd, msg)) return;
    }
    if (previous === false) previous = this.format("$prefix" + cmd.name, msg.channel.channel.serverId);
    if (!cmd) return console.warn("[CommandHandler.processCommand] Invalid case: `cmd` falsy.");
    if (!external) this.emit("command", { command: cmd, message: msg });

    if (cmd.subcommands.length != 0) {
      let idx = cmd.subcommands.findIndex(el => {
        if (!args[1]) return false;
        return el.name.toLowerCase() === args[1].toLowerCase();
      });
      if (idx === -1) {
        let list = cmd.subcommands.map(s => s.name).join(" | ");
        let e = "Invalid subcommand. Try one of the following options: `$previousCmd <$cmdlist>`".replace(/\$previousCmd/gi, previous).replace(/\$cmdList/gi, list);
        return (!external) ? this.replyHandler(e, msg) : e;
      }
      return this.processCommand(cmd.subcommands[idx], args.slice(1), msg, previous + this.format(" " + cmd.subcommands[idx].name), external);
    }

    // options
    const opts = [];
    const texts = [];

    const collectArguments = (index, currVal, as) => {
      const lastChar = currVal.charAt(currVal.length - 1);
      if (lastChar === '"') return { args: as, index };
      let a = args[++index];
      if (!a) return null;
      as.push(a);
      return collectArguments(index, a, as);
    }
    const options = cmd.options.slice().sort((a, b) => {
      const aText = (a.type === "text") ? 1 : 2;
      const bText = (b.type === "text") ? 1 : 2;
      return aText - bText;
    });
    // TODO copied from old code:
    // TODO: fix problems with flags after the last argument (!test string -u <@01G9MCW5KZFKT2CRAD3G3B9JN5>)
    const usedOptions = [];
    var usedArgumentCount = 0;
    for (let i = 0, argIndex = 1; i < options.length; i++) {
      if (options[i] instanceof Flag) i++; // ignore pure flag options. They are processed as they appear at argIndex
      const o = options[i];
      if (o?.type === "text") { texts.push(o); continue; } // text options are processed last
      if ((args[argIndex] || "").startsWith("-")) { // flag processing
        const flagName = args[argIndex].slice(1);
        const op = cmd.options.find(e => e.aliases.includes(flagName));
        if (!op) {
          const error = this.invalidFlagError.replace(/\$previousCmd/gi, previous).replace(/\$invalidFlag/gi, "-" + flagName);
          return (!external) ? this.replyHandler(error, msg) : error;
        }
        previous += " " + args[argIndex];
        var value = args[++argIndex];
        if ((value || "").startsWith('"') && (["string", "text", "channel", "voiceChannels"].includes(op.type))) {
          const data = collectArguments(argIndex, value, [value]);
          if (!data) return this.textWrapError;
          argIndex += data.index - argIndex;
          value = data.args.join(" ").slice(1, data.args.join(" ").length - 1);
        }
        argIndex++;
        // TODO: continue from l. 643 in Commands.js
      }
    }
  }
  /**
   * @param {CommandBuilder} cmd
   * @param {Message} msg
   * @returns {boolean}
   */
  assertRequirements(cmd, msg) {
    const server = msg.member.server;
    for (let i = 0; i < cmd.requirements.length; i++) {
      let req = cmd.requirements[i];
      if (req.ownerOnly && !this.owners.includes(msg.author.id)) return false;
      for (let j = 0; j < req.getPermissions().length; j++) {
        let p = req.getPermissions()[j];
        if (p === "Owner-only command") continue;
        if (!msg.member.hasPermission(server, p) && !this.owners.includes(msg.author.id)) {
          this.replyHandler(req.permissionError, msg);
          return false;
        }
      }
    }
    return true;
  }

  addCommand(builder) {
    this.commandNames.push(...builder.aliases);
    this.commands.push(builder);

    this.commands.sort((a, b) => {
      let A = a.name.toUpperCase();
      let B = b.name.toUpperCase();
      return (A < B) ? -1 : (A > B) ? 1 : 0;
    });

    return this.commands;
  }
}
