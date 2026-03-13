const { CommandBuilder } = require("../Commands.js");
const { Message } = require("../src/MessageHandler.mjs");

module.exports = {
  command: new CommandBuilder()
    .setName("player")
    .setDescription("Create an emoji player control for your voice channel", "commands.player"),
  /**
   * @param {Message} msg
   */
  run: async function(msg) {
    const p = await this.getPlayer(msg);
    if (!p) return;

    const Timeout = this.config.playerAFKTimeout || 10 * 6000;
    const controls = ["▶️", "⏸️", "⏭️", "🔁", "🔀"];
    const form = "Currently Playing: $current\n\n$lastMsg";
    var lastContent = form.replace(/\$current/gi, p.getCurrent()).replace(/\$lastMsg/gi, "Control updates will appear here");
    msg.replyEmbed({
      content: " ",
      embedText: lastContent,
      interactions: {
        restrict_reactions: true,
        reactions: controls
      }
    }).then((m) => {

      var suspensionTimeout = setTimeout(() => close(), Timeout);

      var lastUpdate = "Control updates will appear here";
      const update = (s = lastUpdate) => {
        lastContent = form.replace(/\$current/gi, p.getCurrent()).replace(/\$lastMsg/gi, s);
        m.editEmbed(lastContent);
        lastUpdate = s;
      }
      const close = () => {
        unobserve();
        m.editEmbed({
          content: "Player Session Closed",
          embedText: lastContent + "\n\nSession Closed. The player controls **won't respond** from here.",
        }, {
          colour: "red"
        });
      }
      p.on("message", () => {
        update();
      });
      const unobserve = m.onReaction(controls, (e) => {
        var reply = "";
        switch (e.emoji_id) {
          case controls[0]:
            reply = p.resume(true) || "Successfully Resumed";
            break;
          case controls[1]:
            reply = p.pause(true) || "Successfully Paused";
            break;
          case controls[2]:
            reply = p.skip(true) || "Successfully Skipped";
            break;
          case controls[3]:
            reply = p.loop("queue", true);
            break;
          case controls[4]:
            reply = p.shuffle(true) || "Successfully shuffled";
            break;
        }
        clearTimeout(suspensionTimeout);
        suspensionTimeout = setTimeout(() => {
          close();
        }, Timeout);
        update(reply);
      });
    });
  }
}
