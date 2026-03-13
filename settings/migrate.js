const { SettingsManager, RemoteSettingsManager } = require("./Settings.js");
const config = require("../config.json");

const sm = new SettingsManager();
const rsm = new RemoteSettingsManager(config.mysql);

const servers = sm.guilds.entries();

rsm.on("ready", async () => {
  for (const [id, s] of servers) {
    console.log(id);
    if (rsm.hasServer(id)) {
      await rsm.remoteSave(s);
      continue;
    }

    await rsm.create(id, s);
  }

  process.exit(1);
});
