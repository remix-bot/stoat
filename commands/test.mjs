import { CommandBuilder } from "../src/CommandHandler.mjs";
import Uploader from "revolt-uploader";
import { Message } from "../src/MessageHandler.mjs";

export const command = new CommandBuilder()
  .setName("test")
  .setDescription("A test command used for various purposes.")
  .addRequirement(r =>
    r.setOwnerOnly(true)
  ).addUserOption(o =>
    o.setName("user")
      .setDescription("A user")
      .addFlagAliases("u")
      .setDefault("01G9MCW5KZFKT2CRAD3G3B9JN5")
      .setId("testOption")
  , true).addStringOption(o =>
      o.setName("test")
        .setDescription("test string")
        .setRequired(true)
  ).addChannelOption(o =>
    o.setName("channel")
      .setDescription("A channel"));
/**
 *
 * @param {Message} msg
 * @param {*} data
 */
export const run = async function (msg, data) {
  const message = "Hi, how are you";
  const user = msg.author;
  console.log(await msg.channel.sendEmbedAsUser(message, user));
  msg.replyEmbed(`user: <@${data.get("user").value}>\nstring: ${data.get("test").value}\nchannel: <#${data.get("channel").value}>`);
  /*const uploader = new Uploader(this.client);
  console.log(data.options);
  const id = await uploader.uploadFile("./dashboard/static/assets/icon.png", "img");
  msg.replyEmbed({
    embedText: "Ref String: " + data.get("string").value + "; " + data.get("test").value + "; Option received: " + data.getById("testOption")?.value,
    attachments: [id]
  }, false, {
    media: id
    })*/
};
