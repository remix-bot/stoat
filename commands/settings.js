const { CommandBuilder } = require("../Commands.js");
const runnables = require("../settings/runnables");

module.exports = {
  command: function() {
    return new CommandBuilder()
      .setName("settings")
      .setDescription("Change/Get settings in the current server.", "commands.settings")
      .addAliases("s")
      .addExamples("$prefixsettings get", "$prefixsettings get locale", "$prefixsettings set locale de-DE")
      .setCategory("util")
      .addRequirement(e => e.addPermission("ManageServer"))
      .addSubcommand(cmd =>
        cmd.setName("set")
          .setId("setSettings")
          .setDescription("Set the value of a specific setting.", "subcommands.settings.set")
          .addChoiceOption(c =>
            c.addChoices(...Object.keys(this.settingsMgr.defaults))
              .setName("setting")
              .setDescription("The name of the setting you want to set.", "options.settings.set.setting")
              .setRequired(true)
          ).addTextOption(c =>
            c.setName("value")
              .setDescription("The new value.", "options.settings.set.value")
              .setRequired(true))
      ).addSubcommand(cmd =>
        cmd.setName("get")
          .setDescription("Get the value of a specific setting or the settings of the server.", "subcommands.settings.get")
          .setId("getSettings")
          .addChoiceOption(c =>
            c.addChoices(...Object.keys(this.settingsMgr.defaults))
              .setName("setting")
              .setDescription("Get the current value of a setting.", "options.settings.get.setting")
              .setRequired(false)
            )
      ).addSubcommand(cmd =>
        cmd.setName("reset")
          .setDescription("Reset a setting to it's default value.", "subcommands.settings.reset")
          .setId("reset")
          .addChoiceOption(c =>
            c.addChoices(...Object.keys(this.settingsMgr.defaults))
              .setName("setting")
              .setDescription("The setting to reset", "options.settings.reset.setting")
              .setRequired(true)
            )
      ).addSubcommand(cmd =>
        cmd.setName("help")
          .setDescription("Display help for the settings system.", "subcommands.settings.help")
          .setId("help")
          .addChoiceOption(c =>
            c.addChoices(...Object.keys(this.settingsMgr.defaults))
              .setName("setting")
              .setDescription("Optional setting to explain.", "options.settings.help.setting")
              .setRequired(false)
            )
        )
  },
  run: function(message, data) {
    const set = this.getSettings(message);
    const cmd = data.commandId;
    const setting = data.get("setting").value;
    switch(cmd) {
      case "setSettings":
        var failed = false;
        if (runnables[data.get("setting").value]) failed = runnables[data.get("setting").value].call(this, data.get("value").value, { msg: message, d: data })
        if (failed) return message.replyEmbed(failed);
        set.set(data.get("setting").value, data.get("value").value);
        message.replyEmbed("Settings changed!");
      break;
      case "getSettings":
        if (setting) return message.replyEmbed(`\`${setting}\` is set to \`${set.get(setting)}\``);
        const d = set.getAll();
        let msg = "The settings for this server (" + message.channel.server.name + ") are as following: \n\n";
        for (key in d) {
          msg += "- " + key + ": `" + d[key] + "`\n";
        }
        message.replyEmbed(msg.trim(), false, {
          title: "Settings",
          icon_url: message.channel.server.iconURL
        });
      break;
      case "reset":
        set.reset(setting);
        message.replyEmbed("`" + setting + "` has been reset to `" + set.get(setting) + "`.");
      break;
      case "help":
        if (!setting) {
          const m = `# Settings

          Settings are server-wide. To be able to change them, you need the \`ManageServer\` permission.
          They allow you to customise things like Remix' command prefix, profile picture or certain behaviour in voice channels.

          You can view the current server settings by using the \`$prefixsettings get\` command.

          To display more information about an individual option, use \`$prefixsettings help <option name>\`

          Available options are: \`${Object.keys(this.settingsMgr.defaults).join("`, `")}\``.replaceAll("$prefix", set.get("prefix"));
          message.replyEmbed(m);
          return;
        }

        const description = this.settingsMgr.descriptions[setting];
        var m = "## Settings: " + setting + "\n\n";
        m += description + "\n\n";
        m += "Current value: `" + this.getSettings(message).get(setting) + "`";

        message.replyEmbed(m);
      break;
    }
  }
}
