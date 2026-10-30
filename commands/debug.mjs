import { CommandBuilder } from "../src/CommandHandler.mjs";

export const command = new CommandBuilder()
  .setName("debug")
  .setDescription("A debug command for various purposes.")
  .addRequirement(r => r.setOwnerOnly(true))
  .addChoiceOption(o =>
    o.setName("target")
      .setDescription("The target that should be examined.")
      .addChoices("voice")
      .setRequired(true));
export const run = function(msg, data) {
  switch(data.get("target").value) {
    case "voice":
      var servers = [];
      var iterator = this.players.playerMap.entries();
      for (let v = iterator.next(); !v.done; v = iterator.next()) {
        servers.push(v.value[1]);
      };
      servers = servers.map(s => {
        const channel = this.client.channels.get(s.connection.channelId);
        return {
          name: channel.name,
          id: channel.id,
          status: s.connection.state,
          servername: channel.server.name,
          serverid: channel.server.id
        }
      });
      servers.map(s => {

      })
      break;
  }
}
