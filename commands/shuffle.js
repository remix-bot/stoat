const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder()
    .setName("shuffle")
    .setDescription("Re-orders the queue randomly.", "commands.shuffle"),
  run: async function(message) {
    const p = await this.getPlayer(message);
    if (!p) return;
    let res = p.shuffle() || `✅ Shuffled!`;
    message.channel.sendMessage(this.em(res, message));
  }
}
