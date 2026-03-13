const { CommandBuilder } = require("../Commands.js");

function leaveChannel(msg, cid, p) {
  return new Promise(async (res) => {
    this.playerMap.delete(cid);
    const port = p.port - 3050;
    const m = await msg.replyEmbed("Leaving...");
    const left = p.leave();
    //p.leave().then(async left => {
    p.destroy(); // wait for the ports to be open again
    this.freed.push(port);
    m.editEmbed((left) ? `✅ Successfully Left` : `Not connected to any voice channel`);
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
    if (!p.connection) return msg.replyEmbed("Player not initialized.");
    const cid = p.connection.channelId;
    this.players.leave(msg, cid);
  },
  export: {
    name: "leaveChannel",
    object: leaveChannel
  }
}
