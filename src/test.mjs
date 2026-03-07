import { MessageHandler, PageBuilder } from "./MessageHandler.mjs";
import { Client } from "revolt.js"
import * as fs from "fs";
import { Utils } from "./Utils.mjs";
import { CommandBuilder, CommandHandler } from "./CommandHandler.mjs";

const client = new Client();
const messages = new MessageHandler(client);
const commands = new CommandHandler(messages)

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
  messages.initPagination(builder, message);
});

client.loginBot(JSON.parse(fs.readFileSync("../config.json")).token);
