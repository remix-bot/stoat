const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder()
    .setName("clear")
    .setDescription("Remove all songs from the queue.", "commands.clear")
    .addAliases("c"),
  run: async function(msg) {
    const p = await this.getPlayer(msg);
    if (!p) return;
    p.clear();
    msg.channel.sendMessage(this.em("✅ Queue cleared.", msg));
  }
}
