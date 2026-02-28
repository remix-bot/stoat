const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder()
    .setName("resume")
    .setDescription("Resume the playback in your voice channel", "commands.resume"),
  run: async function(message) {
    const p = await this.getPlayer(message);
    if (!p) return;
    let res = p.resume() || `✅ The song has been resumed!`;
    message.channel.sendMessage(this.em(res, message));
  }
}
