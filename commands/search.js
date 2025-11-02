const { CommandBuilder } = require("../Commands.js");

function awaitMessage(msg, count, player) {
  const oid = this.observeUser(msg.authorId, msg.channelId, (m) => {
    if (m.content.trim().toLowerCase() == "x") {
      this.unobserveUser(oid);
      return m.reply(this.em("Cancelled!", m));
    }
    let c = parseInt(m.content.trim().replace(/\./g, ""));
    if (isNaN(c)) return m.reply(this.em("Invalid number! (Send 'x' to cancel)", m));
    if (c < 0 || c > count) return m.reply(this.em("Index out of range! (`1 - " + count + "`)", m));
    let v = player.playResult(msg.authorId, c - 1);
    m.reply(this.em((typeof v == "string") ? v : `Added [${v.title}](${v.url}) to the queue!`, m));
    this.unobserveUser(oid);
  });
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
        .setDefault("scld")
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
    msg.reply(this.em("Loading results...", msg)).then(async m => {
      let res = await p.fetchResults(query, msg.authorId, provider);
      m.edit(this.em(res.m, msg));
      awaitMessage.call(this, msg, res.count, p);
    });
  }
}
