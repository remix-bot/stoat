import { MessageHandler, PageBuilder } from "./MessageHandler.mjs";
import { Client } from "revolt.js"
import * as fs from "fs";
import { Utils } from "./Utils.mjs";
import { CommandBuilder, CommandHandler } from "./CommandHandler.mjs";
import { MySqlSettingsManager } from "./Settings.mjs";

const config = JSON.parse(fs.readFileSync("../config.json"));

const client = new Client();
const messages = new MessageHandler(client);
const commands = new CommandHandler(messages);

const settings = new MySqlSettingsManager(config.mysql, "../storage/defaults.json");

commands.addCommand(new CommandBuilder()
  .setName("test")
  .addChannelOption((c) =>
    c.setName("channel")
      .setRequired(true)
      .setType("voiceChannel")
  ));

console.log(Utils.uid());

client.on("ready", async () => {
  console.log("ready");

  const channel = messages.getChannel("01JMJEG538ZPW3DNBDR4N18414");
  //await channel.sendEmbed("Hi!")
  const msg = await messages.getOrFetch("01KJZJXSBQVW27PXPWEAZFADC5", "01JMJEG538ZPW3DNBDR4N18414");
  console.log(msg);

  var counter = 0;
  const close = msg.onReaction(["👉"], (event) => {
    console.log("event", event);
    if (counter++ == 2) return close();
    msg.replyEmbed("Hi, how are you?").then(m => {
      //console.log(m);
      //m.editEmbed("new content");
    });
  });
});

messages.onMessage((message) => {
  if (message.content !== "test") return;
  const builder = new PageBuilder(["1", "2", "3", "4", "5", "6"]).setMaxLines(2).setForm("Title\n\n$content\n$currentPage/$maxPage");
  const content = [{
    content: new PageBuilder(`# Home\n\nWelcome to the Remix help page.\n\nRemix is Stoat's first open-source music bot. It supports a variety of streaming services and has many features, with one of the newest being the [Web Dashboard](https://remix.fairuse.org/).\n\nWe hope you enjoy using Remix!\n\nTo get started, just click on the reactions below to find out more about the commands. In the case that reactions don't work for you, there's also the possibility to look through them by using \`${"!"}help <page number>\` :)`).setForm("$content\n\n###### Page $currentPage/$maxPage").setMaxLines(8),
    reaction: "🏠",
    title: "Home Page"
  }, {
    content: new PageBuilder("If you need help with anything or encounter any issues, hop over to our support server [Remix HQ](https://stt.gg/Remix)!\nAlternatively, you can write a dm to any of the following people:\n\n- <@01FZ5P08W36B05M18FP3HF4PT1> (Community Manager)\n- <@01G9MCW5KZFKT2CRAD3G3B9JN5> (Lead Developer)\n- <@01FVB1ZGCPS8TJ4PD4P7NAFDZA> (Junior Developer)").setForm("# Support\n\n$content\n\n###### Page $currentPage/$maxPage").setMaxLines(8),
    reaction: "💻",
    title: "Support Info"
  }]
  //messages.initPagination(builder, message);
  messages.initCatalog(content, message);
});

client.loginBot(config.token);
