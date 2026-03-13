const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder()
    .setName("servers")
    .setDescription("Fetch a list of servers the bot is in")
    .addRequirement(r =>
      r.setOwnerOnly(true)),
  run: function(msg) {
    let m = this.client.allServers.map(e => "\"" + e.name).join("\"\n");
    this.pagination("```js\n$content\n```\n\nPage $currPage/$maxPage", m, msg, 10);
  }
}
