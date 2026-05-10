const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder() // TODO: maybe move to own website category?
    .setName("dashboard")
    .setDescription("Display information about the dashboard.")
    .setCategory("util"),
  run: async function (msg, data) { // TODO: temporary login (without creating account)
    const url = this.config.dashboardUrl;
    msg.reply(this.em("## Dashboard\n\nThe Dashboard is accessible under [" + url + "](" + url + "). Please note that it is very early and experimental version and is thus subject to many bugs.\n\nAccessing the actual dashboard will require you to connect to a Stoat account. However, this does not require access to your actual Stoat login information. You will have to provide your User ID or your Username + Discriminator. Afterwards you'll have to confirm your identity by sending a command with a certain token to Remix, verifying you. That is all that will happen and none of your data passes our servers.", msg), false);
  }
}
