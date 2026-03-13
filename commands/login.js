const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder() // TODO: maybe move to own website category?
    .setName("login")
    .setDescription("Confirm a login of your account on the website", "commands.login")
    .setCategory("util")
    .addStringOption(o =>
      o.setName("id")
        .setDescription("The id you got from logging in at the dashboard.", "options.login.id")
        .setRequired(true)),
  run: async function(msg, data) { // TODO: temporary login (without creating account)
    const log = data.get("id").value;
    const verified = await this.loadedModules.get("wb-dashboard").instance.login(log, msg.author);
    const m = (typeof verified == "string")
      ? "Login failed! Reason: `" + verified + "`. If this is an error and the issue persist, please contact a team member through the server in my description."
      : (verified == true) ? "Login succeeded! You can continue to the webpage now." : "An unknown error occured. Please contact a team member if this issue persists!";
    msg.reply(this.em(m, msg), false);
  }
}
