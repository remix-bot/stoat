const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder()
    .setName("pause")
    .setDescription("Pause the playback in your voice channel", "commands.pause"),
  run: async function(message) {
    const p = await this.getPlayer(message);
    if (!p) return;
    let res = p.pause() || `✅ The song has been paused!`;
    message.channel.sendMessage(this.em(res, message));
  }
}
