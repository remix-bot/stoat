import crypto from "crypto";
import url from "node:url";
import { DatabaseManager } from "./dashboard/DatabaseManager.mjs";

export class LastFMManager {
  /**
   * @param {{key: string, secret: string, url: string, authUrl: string}} config
   * @param {DatabaseManager} db
   */
  constructor(config, db) {
    this.config = config;
    this.apiUrl = new url.URL(this.config.url);
    this.authUrl = new url.URL(this.config.authUrl);

    this.db = db;

    /** @type {Map<string, string>} */
    this.tokens = new Map();

    /** @type {Map<string, {username: string, key: string, linked: number}>} */
    this.sessions = new Map();
  }
  /**
   *
   * @param {{name:string, value: string}[]} parameters
   * @param {string} secret
   */
  static createSignature(parameters, secret) {
    parameters.sort((a, b) => a.name.localeCompare(b.name));
    const sorted = parameters.flatMap((e) => e.name + e.value);
    return crypto.createHash("md5").update(sorted.join("") + secret).digest("hex");
  }

  /**
   *
   * @param {string} path
   * @param {string} method
   * @param {{name: string, value: string}[]} params
   */
  async fetch(path, method, params) {
    const p = {};
    p.method = method.toLowerCase();
    params.forEach(param => {
      p[param.name] = param.value;
    });
    p.format = "json";
    return await (fetch(this.constructUrl(path, p))
      .then(response => response.json()))
  }

  /**
   *
   * @param {string} path
   * @param {Object} query
   * @param {url.Url} [base]
   */
  constructUrl(path, query, base) {
    base ||= this.apiUrl;
    return url.format({
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port,
      host: base.host,
      pathname: path,
      query
    });
  }

  async fetchRequestToken() {
    const sig = LastFMManager.createSignature([{ name: "method", value: "auth.getToken" }, { name: "api_key", value: this.config.key }], this.config.secret);
    const res = await this.fetch("/2.0", "auth.gettoken", [{ name: "api_key", value: this.config.key }, { name: "api_sig", value: sig }]);
    if (res.error) {
      console.error("Last.fm request token error: ", res);
      return null;
    }
    this.lastRefreshed = Date.now();
    this.requestToken = res.token;
    return this.requestToken;
  }
  /**
   *
   * @param {string} userId
   * @param {string} requestToken
   */
  async getAuthToken(userId, requestToken) {
    if (this.tokens.get(userId) !== requestToken) return "This auth token was generated for a different user.";

    const sig = LastFMManager.createSignature([{
      name: "method",
      value: "auth.getSession"
    }, {
      name: "api_key", value: this.config.key
    }, {
      name: "token", value: requestToken
    }], this.config.secret);

    const res = await this.fetch("/2.0", "auth.getSession", [{
      name: "method", value: "auth.getSession"
    }, {
      name: "api_key", value: this.config.key
    }, {
      name: "token", value: requestToken
    }, {
      name: "api_sig", value: sig
    }]);

    if (res.error) {
      console.error("Last.fm error for user " + userId + ": ", res);
      return "An error occured during the verification of the token. Please restart the linking process or contact an administrator.";
    }
    this.tokens.delete(userId);

    const session = res.session;
    const success = await this.db.storeLastFmSession(userId, session.name, session.key);
    if (!success) return "An error occured while storing your token. Please contact an administrator if this happens again.";
    this.sessions.set(userId, {
      username: res.name,
      key: res.key,
      linked: Date.now()
    });
  }
  /**
   * Get from cache or database
   * @param {string} userId
   */
  async getSession(userId) {
    if (this.sessions.has(userId)) return this.sessions.get(userId);
    const res = await this.db.getLastFmSession(userId);
    if (!res) return null;
    this.session.set(userId, res);
    return res;
  }

  /**
   * @param {string} userId
   */
  async getAuthUrl(userId) {
    const token = await this.fetchRequestToken();
    this.tokens.set(userId, token);
    return {
      url: this.constructUrl("/api/auth", { api_key: this.config.key, token }, this.authUrl),
      token
    }
  }
}
