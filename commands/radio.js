const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: function() {
    if (this.config.radio.length === 0) return null;
    return new CommandBuilder()
    .setName("radio")
    .setDescription("Add a certain radio station to the queue. Radios are infinite streams that can be added and skipped just as any other song.", "commands.radio")
    .addAliases("r")
    .addChoiceOption(c =>
      c.addChoices(...[...this.config.radio.map(r => r.name), "list"])
        .setDefault(this.config.radio[0].name)
        .setName("station")
        .setDescription("The radio station you'd like to add. To list all stations, just use `list` in this position")
        .setRequired(false)
    )
  },
  run: async function(msg, data) {
    if (data.get("station").value === "list") {
      // list all radio stations
      var m = "Currently available radio stations: \n\n";
      this.config.radio.forEach(r => {
        m += "- " + r.detailedName + " (" + r.name + "): \n  - " + r.description.replaceAll("\n", "\n  - ");
      });
      m += " \n\nUse the name in the brackets to select that station in the radio command.\n\n";
      m += "Example: `%radio zamrock`";

      msg.replyEmbed(m);
      return;
    }

    const p = await this.getPlayer(msg);
    if (!p) return;

    const radio = this.config.radio.find(e => e.name === data.get("station").value);
    msg.channel.sendEmbed("Adding radio station to queue...").then(m => {
      const _messages = p.playRadio(radio);
      m.editEmbed("Added `" + radio.detailedName + "` to the queue.");
    });
  }
}
