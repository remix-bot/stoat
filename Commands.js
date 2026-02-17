const EventEmitter = require("events");

class CommandBuilder extends EventEmitter {
  constructor() {
    super();

    this.name = null;
    this.description = null;
    this.id = null;
    this.aliases = [];
    this.subcommands = [];
    this.options = [];
    this.requirements = [];
    this.category = "default";
    this.examples = [];

    this.translations = {};
    this.uid = this.guid();

    this.subcommandError = "Invalid subcommand. Try one of the following options: `$previousCmd <$cmdlist>`";
    this.parent = null;

    return this;
  }
  guid() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
  }
  get command() {
    return (this.parent) ? this.parent.command + " " + this.name : this.name;
  }
  set command(_val) {
    throw "Disabled";
  }
  setName(n) {
    this.name = n;
    this.aliases.push(n.toLowerCase());
    return this;
  }
  setDescription(d, t) {
    this.description = d;
    if (t) this.setTranslation(t, "description");
    return this;
  }
  setId(id) {
    this.id = id;
    return this;
  }
  addRequirement(config) {
    let req = config(new CommandRequirement());
    this.requirements.push(req);
    return this;
  }
  addSubcommand(config) {
    let sub = config(new CommandBuilder());
    sub.parent = this;
    this.subcommands.push(sub);//new SubcommandBuilder()));
    return this;
  }
  addStringOption(config, flag=false) {
    this.options.push(config(Option.create("string", flag)))
    return this;
  }
  addNumberOption(config, flag=false) {
    this.options.push(config(Option.create("number", flag)));
    return this;
  }
  addBooleanOption(config, flag=false) {
    this.options.push(config(Option.create("boolean", flag)));
    return this;
  }
  addChannelOption(config, flag=false) {
    this.options.push(config(Option.create("channel", flag)));
    return this;
  }
  addUserOption(config, flag=false) {
    this.options.push(config(Option.create("user", flag)));
    return this;
  }
  addTextOption(config) {
    if (this.options.findIndex(e=>e.type=="text") !== -1) throw "There can only be 1 text option.";
    this.options.push(config(new Option("text")));
    return this;
  }
  addChoiceOption(config, flag=false) {
    this.options.push(config(Option.create("choice", flag)));
    return this;
  }
  addAlias(alias) {
    if (this.aliases.findIndex(e => e == alias.toLowerCase()) !== -1) return; // alias already added
    this.aliases.push(alias.toLowerCase());
    return this;
  }
  addAliases(...aliases) {
    aliases.forEach((a) => this.addAlias(a));
    return this;
  }
  setCategory(cat) {
    this.category = cat;
    return this;
  }
  addExamples(...examples) {
    this.examples.push(...examples);
    return this;
  }

  translation(property) {
    return this.translations[property];
  }
  setTranslation(key, property) {
    if (typeof key === "string") return this.translations[property] = { key: key };
    this.translations[property] = key;
  }
}
class CommandRequirement {
  ownerOnly = false;
  constructor() {
    this.permissions = [];
    this.permissionError = "You don't have the needed permissions to run this command!";

    return this;
  }
  setOwnerOnly(bool) {
    this.ownerOnly = bool;
    return this;
  }
  addPermission(p) {
    this.permissions.push(p);
    return this;
  }
  addPermissions(...p) {
    this.permissions.push(...p);
    return this;
  }
  getPermissions() {
    return (this.ownerOnly) ? [...this.permissions, "Owner-only command"] : this.permissions;
  }
  setPermissionError(e) {
    this.permissionError = e;
  }
}
class Option {
  channelRegex = /^(<|<\\)#(?<id>[A-Z0-9]+)>/;
  userRegex = /^(<|<\\)@(?<id>[A-Z0-9]+)>/;
  idRegex = /^(?<id>[A-Z0-9]+)/;

  constructor(type="string") {
    this.name = null;
    this.description = null;
    this.required = false
    this.id = null;
    this.uid = this.guid();

    this.type = type;
    this.tError = null;
    this.aliases = [null];
    this.choices = []; // only for choice options
    this.translations = {};
    this.defaultValue = null;

    return this;
  }
  static create(type, flag=false) {
    return (!flag) ? new Option(type) : new Flag(type);
  }
  guid() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
  }
  setName(n) {
    this.name = n;
    this.aliases[0] = n;
    return this;
  }
  setDescription(d, t) {
    this.description = d;
    if (t) this.setTranslation(t, "description");
    return this;
  }
  setRequired(r) {
    this.required = r;
    return this;
  }
  setId(id) {
    this.id = id;
    return this;
  }
  setType(t) {
    this.type = t;
    return this;
  }
  addFlagAliases(...a) {
    this.aliases.push(...a);
    return this;
  }
  addChoice(c) {
    if (this.type != "choice") throw ".addChoice is only available for choice options!";
    this.choices.push(c);
    return this;
  }
  addChoices(...cs) {
    if (this.type != "choice") throw ".addChoices is only available for choice options!";
    cs.forEach(c => this.addChoice(c));
    return this;
  }
  setDefault(value) {
    this.defaultValue = value;
    return this;
  }
  empty(i) {
    // FIXME: ig
    if (i == undefined) return true;
    return (!i && !i.contains("0")); // check if string is empty
  }
  validateInput(i, client, msg, type) {
    switch(type || this.type) {
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
  get typeError() {
    if (this.tError) return this.tError;
    switch(this.type) { // TODO: translate
      case "choice":
        let e = "Invalid value '$currValue'. The option `$optionName` has to be one of the following options: \n";
        e += "- " + this.choices.join("\n- ");
        e += "\nSchematic: `$previousCmd <$optionType>`";
        return e;
      case "channel":
        return "Invalid value '$currValue'. The option `$optionName` has to be a channel mention, id, or name (capitalisation matters!). You can specify channel names with multiple words using quotes - \"Channel Name\"\n\nSchematic: `$previousCmd <$optionType>`";
      default:
        return "Invalid value '$currValue'. The option `$optionName` has to be of type `$optionType`.\nSchematic: `$previousCmd <$optionType>`";;
    }
  }
  set typeError(e) {
    this.tError = e;
  }
  translation(property) {
    return this.translations[property];
  }
  setTranslation(key, property) {
    if (typeof key === "string") return this.translations[property] = { key: key };
    this.translations[property] = key;
  }
}
class Flag extends Option {
  constructor(type="string") {
    if (type == "text") throw "Flags can't be of type 'text'!";
    super(type);
  }
}

class CommandHandler extends EventEmitter {
  customPrefixes = new Map();
  cachedGuilds = [];
  parentCallback = null;
  onPing = null;
  pingPrefix = true;
  owners = [];

  paginateHelp = false;
  paginationHandler = null;
  customHelp = false;
  helpHandler = null;

  requiredPermissions = ["SendMessage"];

  invalidFlagError = "Invalid flag `$invalidFlag`. It doesn't match any options on this command.\n`$previousCmd $invalidFlag`";

  constructor(client, prefix="!") {
    super();

    this.client = client;
    this.prefix = prefix;
    this.acceptCommand = "a";
    this.helpCommand = "help";
    this.commandNames = [];
    this.commands = [];

    this.fixMap = new Map(); // typo corrections

    this.minMatchScore = 0.75;
    this.msgCharLimit = 2000;
    this.helpContentCharLimit = 250;
    this.commandLimit = 5;
    this.replyHandler = (t, msg) => {
      msg.reply(t);
    }
    this.translationHandler = null;

    this.client.on("messageCreate", (msg)=>this.messageHandler(msg))

    return this;
  }
  getPrefix(guildId) {
    if (!guildId) return this.prefix;
    if (!this.cachedGuilds.includes(guildId)) return this.prefix;
    if (!this.customPrefixes.has(guildId)) return this.prefix;
    return this.customPrefixes.get(guildId);
  }
  checkPermissions(message) {
    for (let i = 0; i < this.requiredPermissions.length; i++) {
      let perm = this.requiredPermissions[i];
      if (!message.channel.havePermission(perm)) {
        message.member.user.openDM().then(dm => {
          dm.sendMessage("Please grant me the `" + perm + "` permission in <#" + message.channel.id + "> or contact a server administrator. I am unable to operate without this.");
        }).catch(() => {});
        return false;
      }
    }
    return true;
  }
  messageHandler(msg) {
    if (!msg || !msg.content) return;
    if (!this.cachedGuilds.includes(msg.channel.serverId)) {
      this.cachedGuilds.push(msg.channel.serverId);
      let cp = this.request("prefix", msg);
      if (cp !== this.prefix) {
        this.customPrefixes.set(msg.channel.serverId, cp);
      }
    }
    if (msg.mentionIds) {
      if (msg.mentionIds.includes(this.client.user.id) && msg.content.trim().toUpperCase() == `<@${this.client.user.id}>`) {
        if (!this.checkPermissions(msg)) return;
        return this.onPing(msg);
      }
    }
    const prefix = this.getPrefix(msg.channel.serverId);
    const ping = `<@${this.client.user.id}> `;
		if (!(msg.content.startsWith(prefix) || msg.content.replace(/\u00A0/gi, " ") .startsWith(ping))) return;
    if (!this.checkPermissions(msg)) return;
    const len = (msg.content.startsWith(prefix)) ? prefix.length : ping.length;
		console.log(msg.content);
    const args = msg.content
			.replace(/\u00A0/gi, " ")
      .slice(len)
      .trim()
      .split(" ")
      .map((el) => el.trim())
		console.log(args);
    if (args[0] === this.acceptCommand && this.fixMap.has(msg.authorId)) {
      //if (!this.fixMap.has(msg.author_id)) return this.replyHandler(this.f("No command stored that can be corrected!"));
      let cmd = this.fixMap.get(msg.authorId);
      this.fixMap.delete(msg.authorId);
      return this.processCommand(cmd.cmd, cmd.args, msg);
    } else if (args[0] === this.helpCommand) {
      if (!args[1] && this.customHelp) return this.dispatchCustomHelp(msg);
      if (!args[1]) return (this.paginateHelp) ? this.genHelp(null, msg, true) : this.replyHandler(this.f(this.getHelpPage(this.commandLimit, 0, msg, ...this.commands), msg.channel.serverId), msg);

      if (args.length > 1) {
        // check if a new page is requested
        let newPage = this.isNumber(args[1]);
        if (newPage) {
          newPage = parseInt(args[1]);
          if (newPage < 1 || newPage > this.getHelpPages()) return this.replyHandler("`" + newPage + "` is not a valid page number!", msg);
          return this.replyHandler(this.f(this.getHelpPage(this.commandLimit, newPage - 1, msg, ...this.commands), msg.channel.serverId), msg);
        }
      }

      if (args.length > 2) {
        let currCmd = null;
        let prefix = "";
        for (let i = 0; i < args.slice(1).length; i++) {
          let a = args.slice(1)[i];
          let curr = (currCmd) ? currCmd.subcommands : this.commands;
          let idx = curr.findIndex(e => e.aliases.filter(al => al.toLowerCase() == a.toLowerCase()).length > 0);
          if (idx === -1) return this.replyHandler(this.f("Unknown command `$prefix" + prefix + a + "`!", msg.channel.serverId), msg);
          currCmd = curr[idx];
          prefix += a + " ";
        }
        return this.replyHandler(this.genCommandHelp(currCmd, msg), msg);
      } else {
        let idx = this.commands.findIndex(e => e.aliases.filter(al => al.toLowerCase() == args[1].toLowerCase()).length > 0);
        if (idx === -1) return this.replyHandler(this.f(this.t("Unknown command `$prefix" + args[1] + "`!", "cmdHandler.command.invalid", msg, {command: "`$prefix" + args[1] + "`"}), msg.channel.serverId), msg);
        return this.replyHandler(this.genCommandHelp(this.commands[idx], msg), msg);
      }
    }
    if (!this.commandNames.includes(args[0].toLowerCase())) {
      // unknown command; try to find a similar command
      // TODO: include help command in search
      // TODO: fix aliases being preferred/being selected without any actual match with the word
      const matches = this.commandNames.filter(c => c.length > 1).map(c => {
        return {
          score: this.calcMatch(args[0], c),
          command: c
        }
      });
      matches.sort((a,b) => b.score-a.score);
      if (matches[0].score < this.minMatchScore) return; // unknown command, not similar to existing one

      // match found, suggest to user
      let cmd = this.commands.find(e => e.aliases.includes(matches[0].command));
      this.fixMap.set(msg.authorId, { cmd: cmd, args: args });

      let fixed = matches[0].command + " " + args.slice(1).join(" ");
      this.replyHandler(this.f(this.t("Did you mean `$prefix" + fixed + "`? (Type `$prefix$accept` to run this)", "cmdHandler.command.suggestion", msg, { command: "`$prefix" + fixed + "`", acceptCommand: "`$prefix$accept`"}), msg.channel.serverId), msg);
      return;
    }
    return this.processCommand(this.commands.find(e => e.aliases.includes(args[0].toLowerCase())), args, msg);
  }
  calcMatch(word, base, insensitive=true) {
    insensitive = (insensitive) ? "i" : "";
    let matching = 0;
    let used = [];
    word.split("").forEach(c => {
      if (used.includes(c)) return;
      let m = base.match(new RegExp(c, "g" + insensitive));
      used.push(c);
      if (m === null) return;
      matching += m.length;
    });
    return matching / base.length;
  }
  setHelpCommand(name) {
    this.helpCommand = name;
  }
  setReplyHandler(reply) {
    this.replyHandler = reply;
  }
  setPrefix(p) {
    this.prefix = p;
  }
  setPingPrefix(bool) {
    this.pingPrefix = bool;
  }
  setPaginationHandler(handler) {
    this.paginationHandler = handler;
  }
  setHelpHandler(handler) {
    this.helpHandler = handler;
  }
  setTranslationHandler(handler) {
    this.translationHandler = handler;
  }
  enableHelpPagination(bool) {
    this.paginateHelp = bool;
  }
  enableCustomHelpHandling(bool) {
    this.customHelp = bool;
  }
  setCustomPrefix(guildId, p) {
    //if (p == this.prefix) return; // comment because this prevents resetting of the prefix
    if (!this.cachedGuilds.includes(guildId)) this.cachedGuilds.push(guildId);
    this.customPrefixes.set(guildId, p);
  }
  setOnPing(cb) {
    this.onPing = cb;
  }
  request(type, data) {
    return this.parentCallback.call(this, { type, data });
  }
  setRequestCallback(cb) {
    this.parentCallback = cb;
  }
  setAcceptCommand(c) {
    this.acceptCommand = c;
    return this.acceptCommand;
  }
  isNumber(n) {
    return !isNaN(n) && !isNaN(parseFloat(n));
  }
  addOwners(...ids) {
    this.owners.push(...ids)
    return this.owners;
  }
  userCommands(cmds) {
    return cmds.filter(c =>
      c.requirements.findIndex(r =>
        r.ownerOnly
      ) === -1);
  }
  validateString(s, msg, type) {
    return (new Option()).validateInput(s, this.client, msg, type);
  }
  formatString(s, msg, type) {
    return (new Option()).formatInput(s, this.client, msg, type);
  }

  f(text, i) { // text format function
    text = text.replace(/\$prefix/gi, this.getPrefix(i));
    text = text.replace(/\$accept/gi, this.acceptCommand);
    text = text.replace(/\$helpCmd/gi, this.helpCommand);
    return text;
  }
  processCommand(cmd, args, msg, previous=false, external=false) { // external: called by something outside of command handler
    if (cmd.requirements.length > 0 && !external) {
      const server = msg.member.server;
      for (let i = 0; i < cmd.requirements.length; i++) {
        let req = cmd.requirements[i];
        if (req.ownerOnly && !this.owners.includes(msg.authorId)) return;
        for (let j = 0; j < req.getPermissions().length; j++) {
          let p = req.getPermissions()[j];
          if (p == "Owner-only command") continue;
          if (!msg.member.hasPermission(server, p) && !this.owners.includes(msg.authorId)) return this.replyHandler(req.permissionError, msg);
        }
      }
    }
    if (previous === false) previous = this.f("$prefix" + cmd.name, msg.channel.serverId);
    if (!cmd) return console.warn("Something sus is going on... [CommandHandler.processCommand]");
    if (!external) this.emit("command", { command: cmd, message: msg });
    if (cmd.subcommands.length != 0) {
      // If there are any subcommands, ignore options
      let idx = cmd.subcommands.findIndex(el => {
        if (!args[1]) return false;
        return el.name.toLowerCase() == args[1].toLowerCase()
      });
      if (idx === -1) {
        let list = cmd.subcommands.map(s => s.name).join(" | ");
        let e = this.t(cmd.subcommandError, "cmdHandler.subcommand.invalid", msg).replace(/\$cmdlist/gi, list).replace(/\$previousCmd/gi, previous);
        return (!external) ? this.replyHandler(e, msg) : e;
      }
      return this.processCommand(cmd.subcommands[idx], args.slice(1), msg, previous + this.f(" " + cmd.subcommands[idx].name), external);
    }
    // validate options
    let opts = [];
    let texts = [];

    var collectArguments = (index, currVal, as) => { // used for text wrapping
      const lastChar = currVal.charAt(currVal.length - 1);
      if (lastChar == '"') return { args: as, index };
      let a = args[++index];
      if (!a) return null;
      as.push(a);
      return collectArguments(index, a, as);
    }
    const options = cmd.options.slice().sort((a, b) => {
      const aText = (a.type === "text") ? 1 : 2;
      const bText = (b.type === "text") ? 1 : 2;
      return aText - bText;
    }); // TODO: fix problems with flags after the last argument (!test string -u <@01G9MCW5KZFKT2CRAD3G3B9JN5>)
    const usedOptions = [];
    var usedArgumentCount = 0;
    for (let i = 0, argIndex = 1; i < options.length; i++) { // argIndex starts at 1 to exclude command itself
      if (options[i] instanceof Flag) i++; // ignore pure flag options
      const o = options[i];
      if (o?.type == "text") { texts.push(o); continue; } // text options are processed last
      if ((args[argIndex] || "").startsWith("-")) { // flags
        const flagName = args[argIndex].slice(1);
        const op = cmd.options.find(e => e.aliases.includes(flagName));
        if (!op) return (!external) ? this.replyHandler(this.invalidFlagError.replace(/\$previousCmd/gi, previous).replace(/\$invalidFlag/gi, "-" + flagName), msg) : this.invalidFlagError.replace(/\$previousCmd/gi, previous).replace(/\$invalidFlag/gi, "-" + flagName);
        previous += " " + args[argIndex];
        var value = args[++argIndex];
        // text quote wrapping
        if ((value || "").startsWith('"') && (["string", "text", "channel", "voiceChannel"].includes(op.type))) {
          const data = collectArguments(argIndex, value, [value]);
          if (!data) return this.textWrapError; // TODO: this
          argIndex += data.index - argIndex;
          value = data.args.join(" ").slice(1, data.args.join(" ").length - 1);
        }
        argIndex++;
        i--; // check current option next time
        let valid = op.validateInput(value, this.client, msg);
        //console.log(previous);
        if (!valid && (op.required || !op.empty(value))) {
          let e = op.typeError.replace(/\$optionType/gi, op.type).replace(/\$previousCmd/gi, previous).replace(/\$currValue/gi, value).replace(/\$optionName/gi, op.name);
          return (!external) ? this.replyHandler(e, msg) : e;
        }
        usedArgumentCount += 2;
        previous += " " + value;
        opts.push({
          value: op.formatInput(value, this.client, msg),
          name: op.name,
          id: op.id,
          uid: op.uid
        });
        usedOptions.push(op.uid);
        continue;
      }
      if (!o) continue; // continue after flag processing is done
      if (opts.findIndex(op => op.uid == o.uid) !== -1) continue; // options has been processed already
      var value = args[argIndex];
      if ((args[argIndex] || "").startsWith('"') && (["string", "text", "channel", "voiceChannel"].includes(o.type))) {
        const data = collectArguments(argIndex, args[argIndex], [args[argIndex]]);
        if (!data) return this.textWrapError;
        argIndex += data.index - argIndex;
        value = data.args.join(" ");
        value = value.slice(1, value.length - 1);
      }
      let valid = o.validateInput(value, this.client, msg);
      if (!valid && (o.required || !o.empty(value))) { // TODO: improve checking on optional options
        let e = o.typeError.replace(/\$optionType/gi, o.type).replace(/\$previousCmd/gi, previous).replace(/\$currValue/gi, value).replace(/\$optionName/gi, o.name);
        return (!external) ? this.replyHandler(e, msg) : e;
      }
      if (o.empty(value)) value = o.defaultValue;

      opts.push({
        value: o.formatInput(value, this.client, msg),
        name: o.name,
        id: o.id,
        uid: o.uid
      });
      usedOptions.push(o.uid);
      previous += " " + value;
      argIndex++;
      usedArgumentCount++;
    }
    if (texts.length > 0) {
      let o = texts[0];
      let text = args.slice(usedArgumentCount + 1).join(" ");
      if (o.required && !o.validateInput(text, this.client, msg)) {
        let e = o.typeError.replace(/\$optionType/gi, o.type).replace(/\$previousCmd/gi, previous).replace(/\$currValue/gi, text).replace(/\$optionName/gi, o.name);
        return (!external) ? this.replyHandler(e, msg) : e;
      }
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
      get: function(oName) {
        return this.options.find(o => o.name == oName);
      },
      getById: function(id) {
        return this.options.find(o => o.id == id);
      }
    };
    if (!external) this.emit("run", commandRunData);
    return commandRunData;
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
  removeCommand(builder) {
    builder.aliases.forEach(a => {
      const idx = this.commandNames.findIndex(n => n == a);
      if (idx === -1) return;
      this.commandNames.splice(idx, 1);
    });
    const idx = this.commands.findIndex(c => c.uid == builder.uid);
    if (idx == -1) return;
    this.commands.splice(idx, 1);
  }
  getDescription(obj, message) {
    const config = obj.translation("description");
    if (!config || !this.translationHandler) return obj.description;
    const translated = this.translationHandler(config.key, message, config.options);
    return (translated == config.key) ? obj.description : translated;
  }
  t(def, key, msg, options) {
    if (!this.translationHandler) return def;
    const translated = this.translationHandler(key, msg, options);
    return (translated == key) ? def : translated;
  }
  getHelpPages(cmdLimit=5) {
    return Math.ceil(this.commands.length / cmdLimit);
  }
  getHelpPage(cmdLimit=5, currPage=0, msg, ...cmds) {
    const split = (cmdLimit < cmds.length);
    if (!split) return this.genHelp(null, msg, false, ...cmds); // no need to chunk it into pages

    let s = (cmdLimit) * currPage;
    const commands = cmds.slice(s, s + cmdLimit);
    let max = Math.ceil(cmds.length / cmdLimit);
    let offset = cmdLimit * currPage;

    return this.genHelp({ curr: currPage + 1, max, offset }, msg, false, ...commands);
  }
  genHelp(page=null, message, paginate=false, ...cmds) {
    // TODO: make help more customizable
    if (cmds.length == 0) cmds.push(...this.userCommands(this.commands));
    cmds = this.userCommands(cmds);

    if (this.paginateHelp && message && paginate) {
      var form = "Available Commands (page $currPage/$maxPage): \n\n$content";
      form += "\n\nRun `$prefix$helpCmd <command>` to learn more about it. You can also include subcommands.\n";
      form += "For example: `$prefix$helpCmd settings get`\n\n";
      form += "Tip: Use the arrows beneath this message to turn pages, or specify the required page by using `$prefix$helpCmd <page number>`";

      const contents = cmds.map((cmd, i) => {
        return (i + 1) + ". **" + cmd.name + "**: " + this.getDescription(cmd, message).split("\n")[0];
      });

      this.paginationHandler(message, this.f(form), contents);
      return;
    }

    let p = (page) ? ` (page ${page.curr}/${page.max})` : ""; // TODO: translate
    const indexOffset = (page) ? page.offset : 0;

    let content = "Available Commands" + p + ": \n\n";
    if (page && page.curr != 1) content += (indexOffset) + ". [...]\n";

    cmds.forEach((cmd, i) => {
      content += (i + 1 + indexOffset) + ". **" + cmd.name + "**: " + this.getDescription(cmd, message) + "\n";
    });
    if (page && page.curr != page.max) content += (cmds.length + indexOffset) + ". [...]\n";

    content += "\nRun `$prefix$helpCmd <command>` to learn more about it. You can also include subcommands.\n";
    content += "For example: `$prefix$helpCmd command subcommandName`";
    if (page) content += "\n\nTip: Turn pages by using `$prefix$helpCmd <page number>`"

    return content;
  }
  genCommandHelp(cmd, msg) { // TODO: add better indicator for optional parameters/subcommands/options
    // TODO: make options work;
    // TODO: add help page for options
    // TODO: include references to the website
    // TODO: add titles to embeds
    let content = "# " + this.capitalize(cmd.name) + "\n";
    content += this.getDescription(cmd, msg) + "\n\n";
    content += "#### Usage: \n🖥️ `" + this.genCmdUsage(cmd, msg, "` `") + "`\n\n";
    if (cmd.examples.length > 0) content += "Example(s): \n- `" + cmd.examples.map(e => this.f(e,  msg?.channel?.serverId)).join("`\n- `") + "`\n\n";
    if (cmd.aliases.length > 1) {
      content += "#### Aliases: \n";
      cmd.aliases.forEach(alias => {
        content += "- " + alias + "\n";
      });
      content += "\n";
    }
    if (cmd.subcommands.length > 0) {
      content += "#### Subcommands: \n";
      cmd.subcommands.forEach(s => {
        content += "- " + s.name + ": " + this.getDescription(s, msg).split("\n")[0] + ((s.options.length > 0) ? "; (`" + s.options.length + " option(s)`)" : "") + "\n";
      });
      content += "\n";
    } else if (cmd.options.length > 0) {
      content += "#### Arguments: \n"; // TODO: IMPORTANT; visualise flags differently
      cmd.options.forEach(o => {
        /*const optional = ((o.required) ? "" : "; $\\color{gold}\\text{optional}$"); // TODO: create how-to-use page for help; explaining flags, optional arguments, etc
        const flag = (o instanceof Flag) ? "$\\fbox{\\color{white}\\text{Flag:}}$ " : "";*/
        const optional = ((o.required) ? "" : "?");
        const flag = (o instanceof Flag) ? "-" : "";
        if (o.type == "choice") {
          content += "- **" + flag + o.name + "**" + optional + ": " + this.getDescription(o, msg).split("\n")[0] + ";\n  - Allowed values: `" + o.choices.join("`, `") + "`\n  - Aliases: `" + o.aliases.join("`, `") + "`\n";
        } else {
          content += "- **" + flag + o.name + "**" + optional + ": " + this.getDescription(o, msg).split("\n")[0] + "\n  - Aliases: `" + o.aliases.join("`, `") + "`\n";
        }
        content += "\n";
      });
      content += "\n";
    }
    if (cmd.requirements.length > 0) { // TODO: add requirement inheritance (displaying parent requirements on subcommand help page)
      content += "#### Requirements: \n";
      cmd.requirements.forEach(r => {
        content += "- " + r.getPermissions().map(e=>"Permission `" + e + "`").join("\n- ")
      });
    }

    return content.trim();
  }
  genCmdUsage(cmd, msg, pre=" ") {
    if (cmd.subcommands.length > 0) {
      return cmd.command + " <" + cmd.subcommands.map(e=>e.name).join(" | ") + "> [...]".trim();
    } else {
      let options = this.f("$prefix" + cmd.command, msg?.channel?.serverId);
      cmd.options.forEach(o => {
        if (o.type == "text") return;
        if (o instanceof Flag) return options += pre + ((o.type == "choice") ? "-" + o.aliases[0] + " <" + o.choices.join(" | ") + ">" : " -" + o.aliases[0] + " '" + o.type + "'");
        options += pre + ((o.type == "choice") ? " <" + o.choices.join(" | ") + ">" : " '" + o.name + ": " + o.type + "'");
      });
      let o = cmd.options.find(e=>e.type=="text");
      if (o) options += pre + "'" + o.name + ": " + o.type + "'";
      return options.trim();
    }
  }
  dispatchCustomHelp(msg) {
    const commands = this.userCommands(this.commands).map((cmd) => {
      return {
        description: "**" + cmd.name + "**: " + this.getDescription(cmd, msg),
        command: cmd
      };
    });
    return this.helpHandler(commands, msg);
  }
  capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  generateCommandOverviewMD() {
    var table = "|Name|Description|Format|Alias|\n|---|---|---|---|\n";
    this.commands.forEach(c => {
      table += `|${c.name}|${c.description}|${this.genCmdUsage(c).replaceAll("|", "\\|")}|${c.aliases.join(", ")}|\n`;
    });
    return table;
  }
}

module.exports = { CommandHandler, CommandBuilder };
