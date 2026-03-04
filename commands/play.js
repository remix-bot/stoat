const { CommandBuilder } = require("../Commands.js");
module.exports = {
  command: new CommandBuilder()
    .setName("play")
    .setId("play")
    .setDescription("Play a youtube video from url/query or a playlist by url. Other services are supported as well.\nSearches will be done on `Youtube Music` by default.\nIf you want to search on `YouTube` you will have to specify that with `-u yt` explicitly.", "commands.play")
    .addExamples("$prefixplay take over league of legends", "$prefixplay -provider yt 'take over league of legends'", "$prefixp take over league of legends")
    .addTextOption((option) =>
      option.setName("query")
        .setDescription("A YouTube query/url, playlist url, or a link to a Spotify, SoundCloud, or YouTube Music song.", "options.play.query")
        .setRequired(true)
    ).addChoiceOption(o =>
      o.setName("provider")
        .setDescription("The search result provider (YouTube, YouTube Music or SoundCloud). Default: SoundCloud", "options.search.provider") // same as search provider flag
        .addFlagAliases("p", "u", "use")
        .addChoices("ytm", "yt", "scld")
        .setDefault("ytm")
    , true).addAlias("p"),
  run: async function(message, data) {
    const p = await this.getPlayer(message);
    if (!p) return;
    const query = data.get("query").value;
    message.reply(this.em("Searching...", message), false).then((msg) => {
      const messages = p.play(query, false, data.get("provider").value);
      messages.on("message", (d) => {
        msg.edit(this.em(d, message));
      });
    });
  }
}
