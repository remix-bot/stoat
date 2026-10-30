import { CommandBuilder } from "../src/CommandHandler.mjs";

export const command = new CommandBuilder()
  .setName("np")
  .setDescription("Request the name and url of the currently playing song.", "commands.np")
  .addAliases("current", "nowplaying");
export const run = async function(msg) {
  const p = await this.getPlayer(msg);
  if (!p) return;
  msg.replyEmbed("Loading...").then(async m => {
    let data = await p.nowPlaying();
    m.editEmbed(data.msg, {
      media: data.image
    });
  });
}
