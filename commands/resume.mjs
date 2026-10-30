import { CommandBuilder } from "../src/CommandHandler.mjs";

export const command = new CommandBuilder()
  .setName("resume")
  .setDescription("Resume the playback in your voice channel", "commands.resume");
export const run = async function(message) {
  const p = await this.getPlayer(message);
  if (!p) return;
  let res = p.resume() || `✅ The song has been resumed!`;
  message.channel.sendEmbed(res);
}
