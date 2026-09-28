import { CommandBuilder } from "../src/CommandHandler.mjs";

export const command = new CommandBuilder()
  .setName("join")
  .setDescription("Make the bot join a specific voice channel.", "commands.join")
  .setId("join")
  .addChannelOption((option) =>
    option.setName("Channel ID")
      .setType("voiceChannel")
      .setId("cid")
      .setDescription("Specify the channel the bot should join. It will try to find it automatically, if not provided. If it doesn't find you though, it will fail and you will have to provide the channel. This is necessary due to (current) Stoat limitations.", "options.join.channel-deprecated")
      .setDynamicDefault((_client, message) => {
        if (!message) return null;
        const user = message.authorId;
        var id = null;
        message.channel.server.channels.forEach((c) => {
          if (!c.isVoice) return;
          if (!c.voiceParticipants?.has(user)) return;
          id = c.id;
        });
        return id;
      })
      .setRequired(true)
  );
export const run = function(message, data) {
  const cid = data.getById("cid").value || this.players.checkVoiceChannels(message);
  this.players.initPlayer(message, cid);
}
