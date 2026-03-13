const { CommandBuilder } = require("../Commands.js");
const fs = require("fs");

module.exports = {
  command: new CommandBuilder()
    .setName("reload")
    .setDescription("Reload a specified command.")
    .addStringOption(o =>
      o.setName("command")
        .setDescription("The name of the root command that should be reloaded.")
        .setRequired(true)
    ).addRequirement(r =>
      r.setOwnerOnly(true)
    ),
  run: function(msg, data) {
    const com = data.get("command").value;
    if (com == "scandir") {
      const dir = __dirname;
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
      // TODO: scanning for new commands
    }
    const command = this.handler.commands.find(c => c.name == com);
    if (!command) return msg.reply(this.em("Unknown Command", msg), false);

    // remove all references
    command.subcommands.forEach(sub => {
      this.runnables.delete(sub.uid);
    });
    this.handler.removeCommand(command);
    this.runnables.delete(command.uid);

    const file = this.commandFiles.get(command.uid);
    this.commandFiles.delete(command.uid);
    delete require.cache[require.resolve(file)];
    const cData = require(file);
    const builder = (typeof cData.command == "function") ? cData.command.call(this) : cData.command;
    if (cData.export) this[cData.export.name] = cData.export.object;
    this.handler.addCommand(builder);
    if (cData.run) {
      this.runnables.set(builder.uid, cData.run);
      builder.subcommands.forEach(sub => {
        this.runnables.set(sub.uid, cData.run);
      });
    }
    this.commandFiles.set(builder.uid, file);
    msg.reply(this.em("Successfully reloaded!", msg), false);
  }
}
