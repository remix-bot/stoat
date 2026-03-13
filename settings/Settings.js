const fs = require("fs");
const mysql = require("mysql")
const EventEmitter = require("events");

class ServerSettings { // TODO: switch to better db system
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
      if (!this.data[key]) this.data[key] = d[key];
    }
  }
  get serializationData() {
    return {
      ...this.data,
      id: this.id
    }
  }
  serialize() {
    return this.serializationData;
  }
  serializeObject() {
    return this.serializationData;
  }
}


/**
 * Creates a server settings manager. Stores everything in a JSON file.
 * To save the current configs you have to call .saveAsync()
 * Deprecated for obvious reasons. Use RemoteSettingsManager instead.
 *
 * @class SettingsManager
 *
 * @deprecated
 */
class SettingsManager {
  guilds = new Map();
  storagePath = "./storage/settings.json";
  defaults = {};
  descriptions = {};

  constructor(storagePath=null) {
    if (storagePath) this.storagePath = storagePath;

    this.load();

    return this;
  }
  loadDefaults(filePath) {
    return new Promise(res => {
      fs.readFile(filePath, (d) => {
        let parsed = JSON.parse(d);
        this.descriptions = parsed.descriptions;
        this.defaults = parsed.values;
        res(this.defaults);
      });
    });
  }
  loadDefaultsSync(filePath) {
    const d = fs.readFileSync(filePath, "utf8");
    let parsed = JSON.parse(d);
    this.descriptions = parsed.descriptions;
    this.defaults = parsed.values;
  }
  load() {
    if (!fs.existsSync(this.storagePath)) {
      const data = {
        servers: []
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(data));
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
    let missing = (arr, target) => {
      return arr.filter(i => target[i] === undefined);
    }
    this.guilds.forEach((val, key) => {
      if (!this.hasServer(key)) return;
      let missingValues = missing(Object.keys(this.defaults), this.guilds.get(key).getAll());
      if (missingValues.length == 0) return;

      missingValues.forEach(m => {
        val.set(m, this.defaults[m]);
      });
    });
  }
  save() {
    let s = [];
    this.guilds.forEach((val, _k) => {
      s.push(val.serialize());
    });
    const d = {
      servers: s
    }
    fs.writeFileSync(this.storagePath, JSON.stringify(d));
  }
  saveAsync() {
    return new Promise((res) => {
      let s = [];
      this.guilds.forEach((val, _k) => {
        s.push(val.serializeObject());
      });
      const d = {
        servers: s
      }
      fs.writeFile(this.storagePath, JSON.stringify(d), () => {
        res();
      });
    });
  }
  update(server, key) {
    if (!this.guilds.has(server.id)) {
      this.guilds.set(server.id, server);
    }
    const s = this.guilds.get(server.id);
    s.data[key] = server.data[key];
  }
  isOption(key) {
    return key in this.defaults;
  }

  hasServer(id) {
    return this.guilds.has(id);
  }
  getServer(id) {
    return (!this.guilds.has(id)) ? new ServerSettings(id, this) : this.guilds.get(id);
  }
}

class RemoteSettingsManager extends EventEmitter { // mysql based manager
  // TODO: setup instructions
  guilds = new Map();
  descriptions = {};
  defaults = {};

  serverConfig = null;

  db = null;

  constructor(config, defaultsPath) {
    super();

    this.db = mysql.createPool({
      connectionLimit : 15,
      ...config
    });

    if (defaultsPath) this.loadDefaultsSync(defaultsPath);

    this.load();

    return this;
  }

  query(query) {
    return new Promise(res => {
      this.db.query(query, (error, results, fields) => { res({ error, results, fields })});
    });
  }

  async load() {
    const res = await this.query("SELECT * FROM settings");
    if (res.error) {
      console.error("settings init error; ", res.error);
      console.error("retrying in 2 seconds");
      return setTimeout(() => {
        this.load();
      }, 2000);
    }

    const results = res.results;
    results.forEach((r) => {
      let server = new ServerSettings(r.id, this);
      server.deserialize(JSON.parse(r.data));
      server.checkDefaults(this.defaults);
      this.guilds.set(server.id, server);
    });

    this.emit("ready");
  }
  async remoteUpdate(server, key) {
    const r = await this.query("UPDATE settings SET data = JSON_SET(data, '$." + key + "', '" + server.data[key] + "') WHERE id='" + server.id + "'")
    if (r.error) console.error("settings update error; ", r.error);
  }
  async remoteSave(server) {
    const r = await this.query("UPDATE settings SET data = '" + JSON.stringify(server.data) + "' WHERE id='" + server.id + "'");
    if (r.error) console.error("settings server save error; ", r.error);
  }

  loadDefaultsSync(filePath) {
    const d = fs.readFileSync(filePath, "utf8");
    let parsed = JSON.parse(d);
    this.descriptions = parsed.descriptions;
    this.defaults = parsed.values;
  }

  saveAsync() {
    return new Promise(async (res) => {
      const p = []; // promises
      this.guilds.forEach((val, _k) => {
        p.push(this.remoteSave(val));
      });

      await Promise.allSettled(p);
      res();
    });
  }
  async create(id, server) {
    const r = await this.query("INSERT INTO settings (id, data) VALUES ('" + id + "', '" + JSON.stringify(server.data) +  "')");
    if (r.error) console.error("settings create server error; ", r.error);
  }

  update(server, key) {
    if (!this.guilds.has(server.id)) {
      this.guilds.set(server.id, server);
      this.create(server.id, server);
    }
    const s = this.guilds.get(server.id);
    s.data[key] = server.data[key];
    this.remoteUpdate(server, key);
  }
  isOption(key) {
    return key in this.defaults;
  }

  hasServer(id) {
    return this.guilds.has(id);
  }
  getServer(id) {
    return (!this.guilds.has(id)) ? new ServerSettings(id, this) : this.guilds.get(id);
  }
}

module.exports = { SettingsManager, RemoteSettingsManager, ServerSettings };
