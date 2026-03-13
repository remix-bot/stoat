const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder()
    .setName("list")
    .setDescription("List the songs in the queue of your current voice channel.", "commands.list")
    .addAliases("queue", "q"),
  run: async function(message) {
    const p = await this.getPlayer(message);
    if (!p) return;
    var messages = p.list().split("\n");
    // TODO: rewrite following line; Ugly as hell
    this.pagination("Current Queue:\n```\n" + ((messages.length == 1) ? "" : messages[0] + "\n\n") + "$content\n```\nPage $currPage/$maxPage", (messages.length == 1) ? messages : messages.slice(1), message, 6)
  }
}
