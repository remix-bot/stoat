const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder()
    .setName("thumbnail")
    .setDescription("Request the thumbnail of the currently playing song.", "commands.thumbnail")
    .addAliases("thumb"),
  run: async function(msg) {
    const p = await this.getPlayer(msg);
    if (!p) return;
    let data = await p.getThumbnail();
    msg.channel.sendEmbed(data.msg, false, {
      media: data.image
    });
  }
}
