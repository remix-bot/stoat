const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder()
    .setName("skip")
    .setDescription("Skip the current playing song.", "commands.skip"),
  run: async function(message) {
    const p = await this.getPlayer(message);
    if (!p) return;
    let res = p.skip() || `✅ Song skipped!`;
    message.channel.sendMessage(this.em(res, message));
  }
}
