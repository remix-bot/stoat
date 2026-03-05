import { MessageHandler } from "./MessageHandler.mjs";
import { Client } from "revolt.js"
import * as fs from "fs";

const client = new Client();
const messages = new MessageHandler(client);

client.on("ready", async () => {
  console.log("ready");

  const msg = await messages.getOrFetch("01KJZCKN01HF4KQAG0DWA98755", "01JMJEG538ZPW3DNBDR4N18414");
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

client.loginBot(JSON.parse(fs.readFileSync("../config.json")).token);
