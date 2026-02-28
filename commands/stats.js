const { CommandBuilder } = require("../Commands.js");
module.exports = {
  command: new CommandBuilder()
    .setName("stats")
    .setDescription("Display stats about the bot like the uptime.", "commands.stats")
    .addAliases("info")
    .setCategory("util"),
  run: async function(message) {
    const reason = (this.config.restart) ? "🪛 Cause for last restart: `" + this.config.restart + "`\n": "";
    const version = "🏦 Build: [`" + this.comHash + "`](" + this.comLink + ") 🔗";
    const time = this.prettifyMS(Math.round(process.uptime()) * 1000);
    const footer = this.config.customStatsFooter || "";
    const users = (this.config.fetchUsers) ? `\n👤 User Count: \`${this.client.users.size()}\`` : "";
    const start = Date.now();
    const msg = await message.channel.sendMessage(this.em(`__**Stats:**__\n\n📂 Server Count: \`${this.client.servers.size()}\`${users}\n📣 Player Count: \`${this.revoice.connections.size}\`\n🏓 Ping: \`...\`\n⌛ Uptime: \`${time}\`\n${reason}${version}${footer}`, message));
    const ping = Date.now() - start;
    msg.edit(this.em(`__**Stats:**__\n\n📂 Server Count: \`${this.client.servers.size()}\`${users}\n📣 Player Count: \`${this.revoice.connections.size}\`\n🏓 Ping: \`${ping}ms\`\n⌛ Uptime: \`${time}\`\n${reason}${version}${footer}`, message));
  }
}