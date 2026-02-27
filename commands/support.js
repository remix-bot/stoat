const { CommandBuilder } = require("../Commands.js");

module.exports = {
  command: new CommandBuilder()
    .setName("support")
    .setDescription("The support server for Remix. Feel free to ask help, report bugs or just chat :)", "commands.support")
    .addAliases("server")
    .setCategory("util"),
  run: function(msg) {
    msg.reply(this.em("# Support Server \n\nFor anything regarding Remix, just head over to our server: \n[Remix HQ](https://stt.gg/Remix)\n\n# Other\n\nIf you don't want to join, feel free to contact!\n- <@01FZ5P08W36B05M18FP3HF4PT1>\n- <@01FVB1ZGCPS8TJ4PD4P7NAFDZA>\n- <@01G9MCW5KZFKT2CRAD3G3B9JN5>", msg), false);
  }
}
