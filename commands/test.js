const { CommandBuilder } = require("../Commands.js");
const Uploader = require("revolt-uploader");

module.exports = {
  command: new CommandBuilder()
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
    ).addTextOption(o =>
      o.setName("string")
        .setDescription("A cool string")
        .setRequired(true)),
  run: async function (msg, data) {
    const uploader = new Uploader(this.client);
    console.log(data.options);
    const id = await uploader.uploadFile("./dashboard/static/assets/icon.png", "img");
    const embed = this.em("Ref String: " + data.get("string").value + "; " + data.get("test").value + "; Option received: " + data.getById("testOption")?.value, msg);
    embed.embeds[0].media = id;
    embed.attachments = [id];
    msg.reply(embed, false)
  }
}
