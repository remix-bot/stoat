const { CommandBuilder } = require("../Commands.js");
const RevoltPlayer = require("../Player.js");

function joinChannel(message, cid, cb=()=>{}, ecb=()=>{}) {
  if (!this.client.channels.has(cid)) {
    ecb();
    return message.reply(this.em("Couldn't find the channel `" + cid + "`\nUse the help command to learn more about this. (`%help join`)", message), false)
  }

  if (this.playerMap.has(cid)) {
    cb(this.playerMap.get(cid));
    return message.reply(this.em("Already joined <#" + cid + ">.", message), false);
  }
  this.channels.push(cid);
  const settings = this.getSettings(message);
  const pOff = this.freed.shift() || ++this.currPort; // reuse old ports
  const p = new RevoltPlayer(this.config.token, {
    voice: this.revoice,
    portOffset: pOff,
    client: this.client,
    spotify: this.spotifyConfig,
    uploader: this.uploader,
    settings: settings,
    spotifyClient: this.spotify,
    geniusClient: this.geniusClient,
    messageChannel: message.channel,
    ytdlp: this.ytdlp
  });
  p.on("autoleave", async () => {
    message.channel.sendMessage(this.em("Left channel <#" + cid + "> because of inactivity.", message));
    const port = p.port - 3050;
    this.playerMap.delete(cid);
    p.destroy();
    this.freed.push(port);
  });
  p.on("leave", () => {
    p.connection.users.forEach(user => {
      if (!this.observedVoiceUsers.has(user.id)) return;
      const cbs = this.observedVoiceUsers.get(user.id);
      p.emit("userupdate", user, "leave");
      cbs.forEach(c => c.cb.call(this, "left", p));
    });
  });
  p.on("message", (m) => {
    if ((this.getSettings(message).get("songAnnouncements")) == "false") return;
    message.channel.sendMessage(this.em(m, message))
  });
  p.on("roomfetched", () => {
    p.connection.users.forEach(user => {
      if (!this.observedVoiceUsers.has(user.id)) return;
      const cbs = this.observedVoiceUsers.get(user.id); // .id because this is a revoice user object
      p.emit("userupdate", user, "join");
      cbs.forEach(c => c.cb.call(this, "joined", p));
    });
  });
  this.playerMap.set(cid, p);
  message.reply(this.em("Joining Channel...",   message), false).then((message) => {
    p.join(cid).then(() => {
      message.edit(this.em(`:white_check_mark: Successfully joined <#${cid}>`, message));
      cb(p);

      p.connection.on("userjoin", (user) => {
        if (!this.observedVoiceUsers.has(user.id)) return;
        const cbs = this.observedVoiceUsers.get(user.id); // .id because this is a revoice user object
        p.emit("userupdate", user, "join");
        cbs.forEach(c => c.cb.call(this, "joined", p));
      });
      p.connection.on("userleave", (user) => {
        if (!this.observedVoiceUsers.has(user.id)) return;
        const cbs = this.observedVoiceUsers.get(user.id);
        p.emit("userupdate", user, "leave");
        cbs.forEach(c => c.cb.call(this, "left"));
      });
    });
  });
}

module.exports = {
  command: new CommandBuilder()
    .setName("join")
    .setDescription("Make the bot join a specific voice channel.", "commands.join")
    .setId("join")
    .addChannelOption((option) =>
      option.setName("Channel ID")
        .setType("voiceChannel")
        .setId("cid")
        .setDescription("Specify the channel, the bot should join. This is necessary due to (current) Revolt limitations.", "options.join.channel")
        .setRequired(false)
    ),
  run: function(message, data) {
    const cid = data.getById("cid").value || this.checkVoiceChannels(message);
    joinChannel.call(this, message, cid);
  },
  export: {
    name: "joinChannel",
    object: joinChannel
  }
}
