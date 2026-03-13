const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder()
    .setName("loop")
    .setDescription("Toggle the looping of your queue/song.", "commands.loop")
    .addChoiceOption(opt =>
      opt.setName("type")
        .addChoices("queue", "song")
        .setDescription("Specifies what loop should be toggled.", "options.loop.type")
        .setRequired(true)),
  run: async function(message, data) {
    const p = await this.getPlayer(message, data);
    if (!p) return;
    const res = p.loop(data.options[0].value);
    message.channel.sendEmbed(res);
  }
}
