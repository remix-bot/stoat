const { CommandBuilder } = require("../Commands.js");

// TODO: add fetching of lyrics for song queries
module.exports = {
  command: new CommandBuilder()
    .setName("lyrics")
    .setDescription("Fetch the lyrics of the current song. Please note that the lyrics might differ from the actual ones, as Genius doesn't always find the right song.", "commands.lyrics")
    .addAliases("lyric"),
  run: async function(message) {
    const p = await this.getPlayer(message);
    if (!p) return;

    const n = message.replyEmbed("Fetching lyrics from genius...");

    var messages = await p.lyrics();
    if (!messages) return (await n).editEmbed("Couldn't find the lyrics for this song on genius!");
    if (messages.length == 0) return message.replyEmbed("There's nothing playing at the moment.");
    messages = messages.split("\n");
    (await n).message.delete();
    this.pagination("Lyrics for " + p.getVideoName(p.queue.getCurrent()) + ": \n```\n$content\n```\nPage $currPage/$maxPage", messages, message, 15)
  }
}
