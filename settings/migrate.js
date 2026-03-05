const { SettingsManager, MySQLSettingsManager, MongoSettingsManager } = require("./Settings.js");
const config = require("../config.json");

const TARGET = (config.db || "mongo").toLowerCase();

const sm = new SettingsManager();
sm.loadDefaultsSync("./storage/defaults.json");
const servers = Array.from(sm.guilds.entries());

if (servers.length === 0) {
  console.log("No servers found in local storage. Nothing to migrate.");
  process.exit(0);
}

console.log(`Migrating ${servers.length} server(s) to ${TARGET}...`);

if (TARGET === "mongo") {
  const rsm = new MongoSettingsManager(
    config.mongodb.uri,
    config.mongodb.database,
    "./storage/defaults.json"
  );
  rsm.on("ready", async () => {
    for (const [id, s] of servers) {
      try {
        await rsm.saveServer(s);
        console.log(`✓ ${id}`);
      } catch (err) {
        console.error(`✗ ${id}:`, err);
      }
    }
    console.log("Done!");
    process.exit(0);
  });

} else if (TARGET === "mysql") {
  const rsm = new MySQLSettingsManager(config.mysql, "./storage/defaults.json");
  rsm.on("ready", async () => {
    for (const [id, s] of servers) {
      try {
        if (rsm.hasServer(id)) {
          await rsm.remoteSave(s);
        } else {
          await rsm.create(id, s);
        }
        console.log(`✓ ${id}`);
      } catch (err) {
        console.error(`✗ ${id}:`, err);
      }
    }
    console.log("Done!");
    process.exit(0);
  });
}