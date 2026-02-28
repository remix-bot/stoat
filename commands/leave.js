const { CommandBuilder } = require("../Commands.js");

function leaveChannel(msg, cid, p) {
  return new Promise(async (res) => {
    this.playerMap.delete(cid);
    const port = p.port - 3050;
    const m = await msg.reply(this.em("Leaving...", msg), false);
    const left = p.leave();
    //p.leave().then(async left => {
    p.destroy(); // wait for the ports to be open again
    this.freed.push(port);
    m.edit(this.em((left) ? `✅ Successfully Left` : `Not connected to any voice channel`, msg));
    res();
  });
}

module.exports = {
  command: new CommandBuilder()
    .setName("leave")
    .setDescription("Make the bot leave your current voice channel", "commands.leave")
    .addAliases("l", "stop"),
  run: async function(msg) {
    const p = await this.getPlayer(msg, false, false);
    if (!p) return;
    if (!p.connection) return msg.reply(this.em("Player not initialized.", msg), false);
    const cid = p.connection.channelId;
    leaveChannel.call(this, msg, cid, p);
  },
  export: {
    name: "leaveChannel",
    object: leaveChannel
  }
}
