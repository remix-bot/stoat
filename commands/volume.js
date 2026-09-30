const { CommandBuilder } = require("../Commands.js");
const { default: Player } = require("../src/Player.mjs");

module.exports = {
  command: new CommandBuilder()
    .setName("volume")
    .setDescription("Change or get the current volume.", "commands.volume")
    .addNumberOption(o =>
      o.setName("volume")
        .setDescription("The new volume in percentages (e.g. `30` or `100`). Omitting this option will return the current value instead. If you go above 100% there might be quality loss.", "options.volume.volume")
        .setRequired(false)
    )
    .addAliases("v", "vol"),
  run: async function (message, data) {
    /** @type {Player} */
    const p = await this.getPlayer(message);
    if (!p) return;
    const vol = data.get("volume")?.value;
    if (!vol) {
      const curr = p.connection?.preferredVolume || 1;
      const emojis = ["🔈", "🔉", "🔊", "🔊"];
      const icon = emojis[Math.floor(curr * 3)];
      message.channel.sendEmbed(`${icon} Current volume: \`${curr * 100}%\``);
      return;
    }
    let res = p.setVolume(data.get("volume").value / 100);
    message.channel.sendEmbed(res);
  }
}
