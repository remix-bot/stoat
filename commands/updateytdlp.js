const { CommandBuilder } = require("../Commands.js");
const { execFile } = require("child_process");
const YTDlpWrap = require("yt-dlp-wrap-extended").default;

module.exports = {
  command: new CommandBuilder()
    .setName("update")
    .setDescription("Update the youtube-dlp binaries", "commands.update")
    .addAliases("uy", "u")
    .addRequirement(r =>
      r.setOwnerOnly(true)),
  run: async function (message, data) {
    if (!this.ytdlp || typeof this.ytdlp.binaryPath !== "string") {
      message.reply(this.em("ytdlp not set or binary path not typeof string", message), false);
      return;
    }

    await message.reply(this.em("spawning ytdlp update process", message), false);
    execFile(this.ytdlp.binaryPath, ["-U"], (err, stdout, stderr) => {
      if (err) {
        message.reply(this.em("yt-dlp update check failed: `" + err.message + "`", message), true);
        console.warn("[Command: update] yt-dlp update check failed:", err.message);
        return;
      }
      this.ytdlp = new YTDlpWrap(this.ytdlp.binaryPath);
      console.log("[Command: update] yt-dlp update:", (stdout || stderr || "up to date").split("\n")[0]);
      message.reply(this.em("yt-dlp update output: `" + (stdout || stderr || "up to date").split("\n")[0] + "`", message), true);
    });
  }
}
