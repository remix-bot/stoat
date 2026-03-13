const { CommandBuilder } = require("../Commands.js");
const { MessageHandler } = require("../src/MessageHandler.mjs");

function awaitMessage(msg, count, player) {
  /** @type {MessageHandler} */
  const messages = this.messages;
  const channel = messages.getChannel(msg.channel.id);
  const unobserve = channel.onMessageUser((m) => {
    if (m.content.trim().toLowerCase() == "x") {
      unobserve();
      return m.replyEmbed("Cancelled!");
    }
    let c = parseInt(m.content.trim().replace(/\./g, ""));
    if (isNaN(c)) return m.replyEmbed("Invalid number! (Send 'x' to cancel)");
    if (c < 0 || c > count) return m.replyEmbed("Index out of range! (`1 - " + count + "`)");
    let v = player.playResult(msg.authorId, c - 1);
    m.replyEmbed((typeof v == "string") ? v : `Added [${v.title}](${v.url}) to the queue!`);
    unobserve();
  }, msg.author);
}

module.exports = {
  command: new CommandBuilder()
    .setName("search")
    .setDescription("Display the search results for a given query", "commands.search")
    .addExamples("$prefixsearch never gonna give you up", "$prefixsearch -provider yt 'never gonna give you up'")
    .addChoiceOption(o =>
      o.setName("provider")
        .setDescription("The search result provider (YouTube, YouTube Music or SoundCloud). Default: SoundCloud", "options.search.provider")
        .addChoices("yt", "ytm", "scld")
        .setDefault("ytm")
        .addFlagAliases("p", "u", "use"), true)
    .addTextOption(o =>
      o.setName("query")
        .setDescription("The query to search for.", "options.search.query")
        .setRequired(true)
    ),
  run: async function(msg, data) {
    const p = await this.getPlayer(msg);
    if (!p) return;
    let query = data.get("query").value;
    let provider = data.get("provider")?.value;
    msg.replyEmbed("Loading results...").then(async m => {
      let res = await p.fetchResults(query, msg.authorId, provider);
      m.editEmbed(res.m);
      awaitMessage.call(this, msg, res.count, p);
    });
  }
}
