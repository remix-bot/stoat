import { Utils } from "./Utils.mjs";
import { EventEmitter } from "node:events";
import { Message, MessageHandler } from "./MessageHandler.mjs";
import { Channel, Client, Message as StoatMessage, User } from "revolt.js";

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

    this.subcommandError = "Invalid subcommand. Try one of the following options: `$previousCmd <$cmdlist>`";
    /** @type {CommandBuilder} */
    this.parent = null;
  }
  /**
   * @param {string} n
   * @returns {CommandBuilder}
   */
  setName(n) {
    this.name = n;
    this.aliases.push(n.toLowerCase());
    return this;
  }
  /**
   * @param {string} d
   * @returns {CommandBuilder}
   */
  setDescription(d) {
    this.description = d;
    return this;
  }
  /**
   * @param {string} id
   * @returns {CommandBuilder}
   */
  setId(id) {
    this.id = id;
    return this;
  }
  /**
   * @template T
   * @callback Config
   * @param {T} req
   */
  /**
   * @param {Config<T>} config
   * @returns {CommandBuilder}
   */
  setRequirement(config) {
    let req = config(new CommandRequirement());
    this.requirements.push(req);
    return this;
  }
  /**
   * @param {Config<CommandBuilder>} config
   * @returns {CommandBuilder}
   */
  addSubcommand(config) {
    let sub = config(new CommandBuilder());
    sub.parent = this;
    this.subcommands.push(sub);
    return this;
  }
  /**
   * @param {Config<Option>} config
   * @param {boolean=} flag
   * @returns {CommandBuilder}
   */
  addStringOption(config, flag = false) {
    this.options.push(config(Option.create("string", flag)));
    return this;
  }
  /**
   * @param {Config<Option>} config
   * @param {boolean=} flag
   * @returns {CommandBuilder}
   */
  addNumberOption(config, flag = false) {
    this.options.push(config(Option.create("number", flag)));
    return this;
  }
  /**
   * @param {Config<Option>} config
   * @param {boolean=} flag
   * @returns {CommandBuilder}
   */
  addBooleanOption(config, flag = false) {
    this.options.push(config(Option.create("boolean", flag)));
    return this;
  }
  /**
   * @param {Config<Option>} config
   * @param {boolean=} flag
   * @returns {CommandBuilder}
   */
  addChannelOption(config, flag = false) {
    this.options.push(config(Option.create("channel", flag)));
    return this;
  }
  /**
   * @param {Config<Option>} config
   * @param {boolean=} flag
   * @returns {CommandBuilder}
   */
  addUserOption(config, flag = false) {
    this.options.push(config(Option.create("user", flag)));
    return this;
  }
  /**
   * @param {Config<Option>} config
   * @param {boolean=} flag
   * @returns {CommandBuilder}
   */
  addTextOption(config) {
    if (this.options.findIndex(e => e.type === "text") !== -1) throw "There can only be 1 text option.";
    this.options.push(config(new Option("text")));
    return this;
  }
  /**
   * @param {Config<Option>} config
   * @param {boolean=} flag
   * @returns {CommandBuilder}
   */
  addChoiceOption(config, flag = false) {
    this.options.push(config(Option.create("choice", flag)));
    return this;
  }
  /**
   * @param {string} alias
   * @returns {CommandBuilder}
   */
  addAlias(alias) {
    if (this.aliases.findIndex(e => e == alias.toLowerCase()) !== -1) return; // alias already added
    this.aliases.push(alias.toLowerCase());
    return this;
  }
  /**
   * @param  {...string} aliases
   * @returns {CommandBuilder}
   */
  addAliases(...aliases) {
    aliases.forEach((a) => this.addAlias(a));
    return this;
  }
  /**
   * @param {string} cat
   * @returns {CommandBuilder}
   */
  setCategory(cat) {
    this.category = cat;
    return this;
  }
  /**
   * @param  {...string} examples
   * @returns {CommandBuilder}
   */
  addExamples(...examples) {
    this.examples.push(...examples);
    return this;
  }
}

export class CommandRequirement {
  ownerOnly = false;
  constructor() {
    this.permissions = [];
    this.permissionError = "You don't have the needed permissions to run this command!";

    return this;
  }
  /**
   * @param {boolean} bool
   * @returns {CommandRequirement}
   */
  setOwnerOnly(bool) {
    this.ownerOnly = bool;
    return this;
  }
  /**
   * @param {string} p Stoat.js permission String
   * @returns {CommandRequirement}
   */
  addPermission(p) {
    this.permissions.push(p);
    return this;
  }
  /**
   * @param  {...string} p Stoat.js permission Strings.
   * @returns {CommandRequirement}
   */
  addPermissions(...p) {
    this.permissions.push(...p);
    return this;
  }
  /**
   * @returns {string}
   */
  getPermissions() {
    return (this.ownerOnly) ? [...this.permissions, "Owner-only command"] : this.permissions;
  }
  /**
   * @param {string} e
   * @returns {CommandRequirement}
   */
  setPermissionError(e) {
    this.permissionError = e;
    return this;
  }
}
export class Option {
  channelRegex = /^(<|<\\)#(?<id>[A-Z0-9]+)>/;
  userRegex = /^(<|<\\)@(?<id>[A-Z0-9]+)>/;
  idRegex = /^(?<id>[A-Z0-9]+)/;

  /**
   * @callback DynamicDefault
   * @param {Client, Message}
   */
  /** @type DynamicDefault */
  dynamicDefault;

  /**
   * @typedef {"string"|"number"|"boolean"|"user"|"channel"|"voiceChannel"|"choice"|"text"} OptionType
   */
  /**
   * @param {OptionType} type
   */
  constructor(type = "string") {
    this.name = null;
    this.description = null;
    this.required = false
    this.id = null;
    this.uid = Utils.uid();

    /** @type {OptionType} */
    this.type = type;
    this.tError = null;
    this.aliases = [null];
    this.choices = []; // only for choice options
    this.translations = {};
    this.defaultValue = null;
    this.dynamicDefault = null;

    this.tError = null; // custom type error
  }
  static create(type, flag = false) {
    return (!flag) ? new Option(type) : new Flag(type);
  }
  /**
   * @param {string} n
   * @returns {Option}
   */
  setName(n) {
    this.name = n;
    this.aliases[0] = n;
    return this;
  }
  /**
   * @param {string} d
   * @returns {Option}
   */
  setDescription(d) {
    this.description = d;
    return this;
  }
  /**
   * @param {boolean} r
   * @returns {Option}
   */
  setRequired(r) {
    this.required = r;
    return this;
  }
  /**
   * @param {string} id
   * @returns {Option}
   */
  setId(id) {
    this.id = id;
    return this;
  }
  /**
   * @param {OptionType} t
   * @returns {Option}
   */
  setType(t) {
    this.type = t;
    return this;
  }
  /**
   * @param  {...string} a
   * @returns {Option}
   */
  addFlagAliases(...a) {
    this.aliases.push(...a);
    return this;
  }
  /**
   * Only available for choice options!
   * @param {string} c
   * @returns {Option}
   */
  addChoice(c) {
    if (this.type != "choice") throw ".addChoice is only available for choice options!";
    this.choices.push(c);
    return this;
  }
  /**
   * Only available for choice options!
   * @param  {...string} cs
   * @returns {Option}
   */
  addChoices(...cs) {
    if (this.type != "choice") throw ".addChoices is only available for choice options!";
    cs.forEach(c => this.addChoice(c));
    return this;
  }
  /**
   * @param {string} value
   * @returns {Option}
   */
  setDefault(value) {
    this.defaultValue = value;
    return this;
  }
  /**
   * @param {DynamicDefault} callback
   * @returns {Option}
   */
  setDynamicDefault(callback) {
    this.dynamicDefault = callback;
    return this;
  }
  /**
   * Checks wether the given value is considered "empty".
   * @param {any} i
   * @returns {boolean}
   */
  empty(i) {
    if (i == undefined) return true;
    return (!i && !i.contains("0"));
  }
  /**
   * Checks if the input is valid for the current option type.
   * @param {string} i
   * @param {Client} client
   * @param {StoatMessage} msg
   * @param {OptionType=} type
   * @returns {boolean}
   */
  validateInput(i, client, msg, type) {
    switch (type || this.type) {
      case "text":
      case "string":
        return !!i; // check if string is empty
      case "number":
        return !isNaN(i) && !isNaN(parseFloat(i));
      case "boolean":
        return (
          i == "0" ||
          i == "1" ||
          i.toLowerCase() == "true" ||
          i.toLowerCase() == "false"
        );
      case "choice":
        return this.choices.includes(i);
      case "user":
        return this.userRegex.test(i) || this.idRegex.test(i);
      case "channel":
        if (i === undefined) return false;
        return this.channelRegex.test(i) || this.idRegex.test(i) || client.channels.filter(c => c.name == i).length > 0;
      case "voiceChannel":
        if (msg.channel.type === "Group") return true;

        const results = this.channelRegex.exec(i) ?? this.idRegex.exec(i);

        if (msg.channel.serverId === "eval") {  // eval is a dry-run conducted to check the syntax of a channel
          return (results) ? results.groups["id"] : i;
        }

        const channel = client.channels.find(
          c => c.name == i
            && (msg.channel)
            ? (c.serverId == msg.channel.serverId || c.serverId == "eval") // eval is a dry-run conducted to check the syntax of a channel
            : false);

        const cObj = (results) ? client.channels.get(results.groups["id"]) : (channel) ? channel : null;
        return (cObj) ? cObj.isVoice || cObj.type === "Group" : null;
      // TODO: Add roles
    }
  }
  /**
   * Formats the given input into a canonical version, depending on the type.
   * @param {string} i
   * @param {Client} client
   * @param {StoatMessage} msg
   * @param {OptionType=} type
   * @returns {string|number|User|Channel}
   */
  formatInput(i, client, msg, type) {
    switch (type || this.type) {
      case "text":
      case "string":
        return i;
      case "number":
        return parseFloat(i);
      case "boolean":
        return i.toLowerCase() === "true" || i == "1"; // NOTE: this should cover the allowed values from .validateInput()
      case "choice":
        return i; // TODO: implement choice type
      case "user":
        var rs = this.userRegex.exec(i) ?? this.idRegex.exec(i);
        rs &&= rs.groups["id"];
        return rs;
      case "channel":
        const results = this.channelRegex.exec(i) ?? this.idRegex.exec(i);

        const channel = client.channels.find(c => c.name == i);
        return (results) ? results.groups["id"] : (channel) ? channel.id : null;
      case "voiceChannel":
        if (msg.channel.type === "Group") return msg.channel.id;

        const r = this.channelRegex.exec(i) ?? this.idRegex.exec(i);

        if (msg.channel.serverId === "eval") {
          return (r) ? r.groups["id"] : i || null;
        }

        const c = client.channels.find(c => c.name == i && (c.isVoice) && c.server?.id == msg.channel.server.id);
        return (r) ? r.groups["id"] : (c) ? c.id : null;
    }
  }
  /** @type {string} */
  get typeError() {
    if (this.tError) return this.tError;
    switch (this.type) {
      case "choice":
        let e = "Invalid value '$currValue'. The option `" + this.name + "` has to be one of the following options: \n";
        e += "- " + this.choices.join("\n- ");
        e += "\nSchematic: `$previousCmd <" + this.type + ">`";
        return e;
      case "channel":
        return "Invalid value '$currValue'. The option `" + this.name + "` has to be a channel mention, id, or name (capitalisation matters!). You can specify channel names with multiple words using quotes: \"Channel Name\"\n\nSchematic: `$previousCmd <" + this.type + ">`";
      default:
        return "Invalid value '$currValue'. The option `" + this.name + "` has to be of type `" + this.type + "`.\nSchematic: `$previousCmd <" + this.type + ">`";
    }
  }
  set typeError(e) {
    this.tError = e;
  }
}
export class Flag extends Option {
  /**
   * @param {OptionType} type
   */
  constructor(type = "string") {
    if (type == "text") throw "Flags can't be of type 'text'!";
    super(type);
  }
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
  textWrapError = "Malformed string `$value`: Missing a closing quote character (`$quote`) after the desired string.";

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

    const STRING_TYPES = ["string", "text", "channel", "voiceChannel"];

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
        if ((value || "").startsWith('"') && (STRING_TYPES.includes(op.type))) {
          const data = collectArguments(argIndex, value, [value]);
          if (!data) return this.replyHandler(this.textWrapError.replace(/\$value/gi, args.slice(argIndex).join(" ")).replace(/\$quote/gi, args[argIndex].charAt(0)), msg);
          argIndex += data.index - argIndex;
          value = data.args.join(" ").slice(1, data.args.join(" ").length - 1);
        }
        argIndex++;
        i--; // check current option next time
        let valid = op.validateInput(value, this.client, msg.message);
        if (!valid && (op.required || !op.empty(value))) {
          let e = op.typeError.replace(/\$previousCmd/gi, previous).replace(/\$currValue/gi, value);
          return (!external) ? this.replyHandler(e, msg) : e;
        }
        usedArgumentCount += 2;
        previous += " " + value;
        opts.push({
          value: op.formatInput(value, this.client, msg.message),
          name: op.name,
          id: op.id,
          uid: op.uid
        });
        usedOptions.push(op.uid);
        continue;
      }

      if (!o) continue; // I'll be honest, I have no idea when this condition is met but I am too scared to touch it.
      if (opts.findIndex(op => op.uid === o.uid) !== -1) continue; // option has already been processed
      var value = args[argIndex];
      if ((args[argIndex] || "").startsWith('"') && (STRING_TYPES.includes(o.type))) {
        const data = collectArguments(argIndex, args[argIndex], [args[argIndex]]);
        if (!data) return this.replyHandler(this.textWrapError.replace(/\$value/gi, args.slice(argIndex).join(" ")).replace(/\$quote/gi, args[argIndex].charAt(0)), msg);
        argIndex += data.index - argIndex;
        value = data.args.join(" ");
        value = value.slice(1, value.length - 1);
      }
      let valid = o.validateInput(value, this.client, msg.message);
      if (!valid && o.dynamicDefault) {
        value = o.dynamicDefault(this.client, msg);
        value = o.validateInput(value, this.client, msg.message);
      }
      if (!valid && (o.required || !o.empty(value))) {
        // TODO: improve checking on optional options (whatever that means)
        let e = o.typeError.replace(/\$previousCmd/gi, previous).replace(/\$currValue/gi, value);
        return (!external) ? this.replyHandler(e, msg) : e;
      }
      if (o.empty(value)) value = o.defaultValue;

      opts.push({
        value: o.formatInput(value, this.client, msg.message),
        name: o.name,
        id: o.id,
        uid: o.uid
      });
      usedOptions.push(o.uid);
      previous += " " + value;
      argIndex++;
      usedArgumentCount++;
    }
    // text option processing (processed last as they are potentially infinite)
    if (texts.length > 0) {
      let o = texts[0];
      let text = args.slice(usedArgumentCount + 1).join(" ");
      if (o.required && !o.validateInput(text, this.client, msg.message)) {
        let e = o.typeError.replace(/\$previousCmd/gi, previous).replace(/\$currValue/gi, text);
        return (!external) ? this.replyHandler(e, msg) : e;
      }
      // remove quote text wrapping
      const quote = (['"', "'"].includes(text.charAt(0))) ? text.charAt(0) : null;
      if (quote && text.charAt(text.length - 1) == quote) {
        text = text.slice(1, text.length - 1);
      }
      opts.push({
        name: o.name,
        value: text,
        id: o.id,
        uid: o.uid
      });
      usedOptions.push(o.uid);
    }
    options.filter(o => !usedOptions.includes(o.uid)).forEach(o => {
      if (!o.defaultValue) return;
      opts.push({
        name: o.name,
        value: o.defaultValue,
        id: o.id,
        uid: o.uid,
      });
    });
    const commandRunData = {
      command: cmd,
      commandId: cmd.id,
      options: opts,
      message: msg,
      get: function (oName) {
        return this.options.find(o => o.name == oName);
      },
      getById: function (id) {
        return this.options.find(o => o.id == id);
      }
    };
    if (!external) this.emit("run", commandRunData);
    return commandRunData;
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
