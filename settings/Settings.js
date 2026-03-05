const fs = require("fs");
const EventEmitter = require("events");

class ServerSettings {
  id;
  manager;
  data = {};

  constructor(id, mgr) {
    this.id = id;
    this.manager = mgr;
    this.loadDefaults();
    return this;
  }
  set(key, value) {
    this.data[key] = value;
    this.manager.update(this, key);
  }
  get(key) {
    return this.data[key];
  }
  reset(key) {
    return this.set(key, this.manager.defaults[key]);
  }
  getAll() {
    return this.data;
  }
  loadDefaults() {
    for (let key in this.manager.defaults) {
      this.data[key] = this.manager.defaults[key];
    }
  }
  deserialize(json) {
    for (let k in json) {
      if (k == "id") continue;
      this.data[k] = json[k];
    }
  }
  checkDefaults(d) {
    for (let key in d) {
      if (this.data[key] === undefined) this.data[key] = d[key];
    }
  }
  get serializationData() {
    return { ...this.data, id: this.id };
  }
  serialize() { return this.serializationData; }
  serializeObject() { return this.serializationData; }
}

/**
 * Local file-based settings manager.
 * @deprecated Use MySQLSettingsManager or MongoSettingsManager instead.
 */
class SettingsManager {
  guilds = new Map();
  storagePath = "./storage/settings.json";
  defaults = {};
  descriptions = {};

  constructor(storagePath = null) {
    if (storagePath) this.storagePath = storagePath;
    this.load();
    return this;
  }
  loadDefaultsSync(filePath) {
    const d = fs.readFileSync(filePath, "utf8");
    let parsed = JSON.parse(d);
    this.descriptions = parsed.descriptions;
    this.defaults = parsed.values;
  }
  load() {
    if (!fs.existsSync(this.storagePath)) {
      fs.writeFileSync(this.storagePath, JSON.stringify({ servers: [] }));
    }
    let json = JSON.parse(fs.readFileSync(this.storagePath, "utf8"));
    json.servers.forEach((s) => {
      let server = new ServerSettings(s.id, this);
      server.deserialize(s);
      server.checkDefaults(this.defaults);
      this.guilds.set(s.id, server);
    });
  }
  syncDefaults() {
    this.guilds.forEach((val, key) => {
      if (!this.hasServer(key)) return;
      const missing = Object.keys(this.defaults).filter(i => this.guilds.get(key).getAll()[i] === undefined);
      missing.forEach(m => val.set(m, this.defaults[m]));
    });
  }
  save() {
    let s = [];
    this.guilds.forEach((val) => s.push(val.serialize()));
    fs.writeFileSync(this.storagePath, JSON.stringify({ servers: s }));
  }
  saveAsync() {
    return new Promise((res) => {
      let s = [];
      this.guilds.forEach((val) => s.push(val.serializeObject()));
      fs.writeFile(this.storagePath, JSON.stringify({ servers: s }), () => res());
    });
  }
  update(server, key) {
    if (!this.guilds.has(server.id)) this.guilds.set(server.id, server);
    this.guilds.get(server.id).data[key] = server.data[key];
  }
  isOption(key) { return key in this.defaults; }
  hasServer(id) { return this.guilds.has(id); }
  getServer(id) {
    return (!this.guilds.has(id)) ? new ServerSettings(id, this) : this.guilds.get(id);
  }
}

/**
 * MySQL-based remote settings manager.
 * Config: pass a mysql connection config object.
 */
class MySQLSettingsManager extends EventEmitter {
  guilds = new Map();
  defaults = {};
  descriptions = {};
  db = null;

  constructor(config, defaultsPath) {
    super();
    const mysql = require("mysql");
    this.db = mysql.createPool({ connectionLimit: 15, ...config });
    if (defaultsPath) this.loadDefaultsSync(defaultsPath);
    this.load();
    return this;
  }
  query(query) {
    return new Promise(res => {
      this.db.query(query, (error, results, fields) => res({ error, results, fields }));
    });
  }
  async load() {
    const res = await this.query("SELECT * FROM settings");
    if (res.error) {
      console.error("Settings init error:", res.error, "— retrying in 2s");
      return setTimeout(() => this.load(), 2000);
    }
    res.results.forEach((r) => {
      let server = new ServerSettings(r.id, this);
      server.deserialize(JSON.parse(r.data));
      server.checkDefaults(this.defaults);
      this.guilds.set(server.id, server);
    });
    this.emit("ready");
  }
  async remoteUpdate(server, key) {
    const r = await this.query(`UPDATE settings SET data = JSON_SET(data, '$.${key}', '${server.data[key]}') WHERE id='${server.id}'`);
    if (r.error) console.error("Settings update error:", r.error);
  }
  async remoteSave(server) {
    const r = await this.query(`UPDATE settings SET data = '${JSON.stringify(server.data)}' WHERE id='${server.id}'`);
    if (r.error) console.error("Settings save error:", r.error);
  }
  async create(id, server) {
    const r = await this.query(`INSERT INTO settings (id, data) VALUES ('${id}', '${JSON.stringify(server.data)}')`);
    if (r.error) console.error("Settings create error:", r.error);
  }
  saveAsync() {
    return new Promise(async (res) => {
      const p = [];
      this.guilds.forEach((val) => p.push(this.remoteSave(val)));
      await Promise.allSettled(p);
      res();
    });
  }
  loadDefaultsSync(filePath) {
    const d = fs.readFileSync(filePath, "utf8");
    let parsed = JSON.parse(d);
    this.descriptions = parsed.descriptions;
    this.defaults = parsed.values;
  }
  update(server, key) {
    if (!this.guilds.has(server.id)) {
      this.guilds.set(server.id, server);
      this.create(server.id, server);
    }
    this.guilds.get(server.id).data[key] = server.data[key];
    this.remoteUpdate(server, key);
  }
  isOption(key) { return key in this.defaults; }
  hasServer(id) { return this.guilds.has(id); }
  getServer(id) {
    return (!this.guilds.has(id)) ? new ServerSettings(id, this) : this.guilds.get(id);
  }
}

/**
 * MongoDB-based remote settings manager.
 * Config: pass mongoURI and dbName.
 */
class MongoSettingsManager extends EventEmitter {
  guilds = new Map();
  defaults = {};
  descriptions = {};
  db = null;
  collection = null;

  constructor(mongoURI, dbName, defaultsPath) {
    super();
    const { MongoClient } = require("mongodb");
    if (defaultsPath) this.loadDefaultsSync(defaultsPath);
    const client = new MongoClient(mongoURI);
    client.connect()
      .then(() => {
        console.log("MongoDB connected");
        this.db = client.db(dbName);
        this.collection = this.db.collection("ServerSettings");
        this.load();
      })
      .catch(err => {
        console.error("Mongo connection error:", err, "— retrying in 3s");
        setTimeout(() => new MongoSettingsManager(mongoURI, dbName, defaultsPath), 3000);
      });
  }
  async load() {
    try {
      const results = await this.collection.find().toArray();
      results.forEach(doc => {
        const server = new ServerSettings(doc.id, this);
        server.deserialize(doc.data);
        server.checkDefaults(this.defaults);
        this.guilds.set(server.id, server);
      });
      this.emit("ready");
    } catch (err) {
      console.error("Settings load error:", err, "— retrying in 3s");
      setTimeout(() => this.load(), 3000);
    }
  }
  async update(server, key) {
    if (!this.collection) return console.error("DB not ready, cannot update.");
    if (!this.guilds.has(server.id)) this.guilds.set(server.id, server);
    await this.collection.updateOne(
      { id: server.id },
      { $set: { [`data.${key}`]: server.data[key] } },
      { upsert: true }
    );
  }
  async saveServer(server) {
    if (!this.collection) return console.error("DB not ready, cannot save.");
    await this.collection.updateOne(
      { id: server.id },
      { $set: { data: server.data } },
      { upsert: true }
    );
  }
  async saveAsync() {
    const promises = [];
    this.guilds.forEach(server => promises.push(this.saveServer(server)));
    await Promise.allSettled(promises);
  }
  loadDefaultsSync(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    this.descriptions = parsed.descriptions;
    this.defaults = parsed.values;
  }
  isOption(key) { return key in this.defaults; }
  hasServer(id) { return this.guilds.has(id); }
  getServer(id) {
    if (!this.guilds.has(id)) {
      const server = new ServerSettings(id, this);
      this.guilds.set(id, server);
      return server;
    }
    return this.guilds.get(id);
  }
}

/**
 * Factory: returns the right manager based on config.
 * 
 * In config.json, set:
 *   "db": "mongo"   → uses MongoSettingsManager
 *   "db": "mysql"   → uses MySQLSettingsManager
 *   (omitted)       → defaults to mongo
 */
function createSettingsManager(config, defaultsPath) {
  const type = (config.db || "mongo").toLowerCase();
  if (type === "mysql") {
    console.log("[Settings] Using MySQL backend");
    return new MySQLSettingsManager(config.mysql, defaultsPath);
  }
  console.log("[Settings] Using MongoDB backend");
  return new MongoSettingsManager(config.mongodb.uri, config.mongodb.database, defaultsPath);
}

module.exports = {
  SettingsManager,
  MySQLSettingsManager,
  MongoSettingsManager,
  RemoteSettingsManager: MongoSettingsManager, // backwards compat alias
  createSettingsManager,
  ServerSettings
};