import { Remix } from "../index.mjs";
import { CommandBuilder } from "../src/CommandHandler.mjs";
import { LastFMManager } from "../src/LastFMManager.mjs";
import { Message } from "../src/MessageHandler.mjs";

export const command = new CommandBuilder()
  .setName("lastfm")
  .setDescription("Set up, manage and use your last.fm link to Remix.")
  .addAliases("lfm")
  .addRequirement(r =>
    r.setOwnerOnly(true)
  ).addSubcommand(s =>
    s.setName("link")
      .setId("link")
      .setDescription("Start the linking process for last.fm.")
  ).addSubcommand(s =>
    s.setName("confirm")
      .setId("conf")
      .setDescription("Confirm a login attempt.")
      .addStringOption(o =>
        o.setName("token")
          .setDescription("The token provided by the lastfm login command.")
          .setRequired(true)
      )
);
/**
 *
 * @param {Message} msg
 * @param {*} data
 */
export const run = async function (msg, data) {
  /** @type {LastFMManager} */
  const mgr = this.lastFm;
  switch (data.commandId) {
    case "link":
      const authData = await mgr.getAuthUrl(msg.authorId);
      msg.replyEmbed(this.handler.format(`Grant access on [${authData.url}](${authData.url}). Then, within an hour, come back and run \`$prefixlastfm confirm ${authData.token}\``, msg.channel.channel.serverId));
      break;
    case "conf":
      const error = await mgr.getAuthToken(msg.author.id, data.get("token").value);
      msg.replyEmbed((!error) ? "Your account has successfully been connected to lastfm." : error);
      break;
    default:
      msg.replyEmbed("An error occured. Error: `INTERNAL_COMMAND_ERROR`", false, { colour: "red" });
      return;
  }
}
