import { CommandBuilder } from "../src/CommandHandler.mjs";
export const command = new CommandBuilder()
  .setName("tuna")
  .setDescription("[Currently in testing, thus restricted] Overlay a sound from Voicemod Tuna (soundboard).")
  .addTextOption((option) =>
    option.setName("query")
      .setDescription("The term to search for. TODO: include direct links")
      .setRequired(true)
  ).addRequirement(r =>
    r.setOwnerOnly(true)
  );
export const run = async function (message, data) {
  if (!this.tuna) {
    return message.replyEmbed("Voicemod Tuna not configured!");
  }
  const p = await this.getPlayer(message);
  if (!p) return;
  const query = data.get("query").value;
  message.replyEmbed("Searching...").then(async (msg) => {
    const data = await this.tuna.search(query);
    const result = data.items[0];
    p.playOverlay(await result.download());
    msg.editEmbed(`Triggered *${result.title}*`);
  });
}
