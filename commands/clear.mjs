import { CommandBuilder } from "../src/CommandHandler.mjs";

export const command = new CommandBuilder()
  .setName("clear")
  .setDescription("Remove all songs from the queue.", "commands.clear")
  .addAliases("c");
export const run = async function(msg) {
  const p = await this.getPlayer(msg);
  if (!p) return;
  p.clear();
  msg.channel.sendEmbed("✅ Queue cleared.");
}
