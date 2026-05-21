import { compare, genSalt, hash } from "bcryptjs";
import { createPool } from "mysql2/promise";
import mysql2 from "mysql2/promise";
const { FieldPacket, PoolOptions, QueryResult } = mysql2;

/**
 * @typedef {import('../Player.mjs').SerialisedVideo} SerialisedVideo
 */

export class DatabaseManager {
  /**
   * @param {PoolOptions} config Based on https://sidorares.github.io/node-mysql2/docs#using-connection-pools
   */
  constructor(config) {
    this.db = createPool({
      connectionLimit: 15,
      ...config
    });
  }
  /**
   * @param {string} query
   * @returns {Promise<[QueryResult, FieldPacket[]]>}
   */
  async query(query) {
    return this.db.query(query);
  }
  /**
   * @param {string} query
   * @param {string[]} [data]
   * @returns {Promise<QueryResult>}
   */
  async execute(query, data) {
    const [res, _fields] = await this.db.execute(query, data);
    return res;
  }
  /**
   * @param {string} plain
   * @returns {Promise<string>}
   */
  async hash(plain) {
    const salt = await genSalt(10);
    return hash(plain, salt);
  }
  /**
   * @param {string} plain
   * @param {string} hash
   * @returns {Promise<string>}
   */
  async compareHash(plain, hash) {
    return await compare(plain, hash);
  }
  /**
   *
   * @param {Object[]} states
   * @param {string} states[].channel
   * @param {string} states[].messagingChannel
   * @param {Object} states[].queue
   * @param {SerialisedVideo} states[].queue.current
   * @param {SerialisedVideo[]} states[].queue.queued
   */
  async storePlayerStates(states) { // TODO
    const serialised = states.map(s => {
      return {
        channel: s.channel,
        messaging: s.messagingChannel,
        queue: JSON.stringify(s.queue),
      };
    });
    console.log(serialised);

    const sql = `INSERT INTO player_states (channel, text, queue) VALUES (?, ?, ?)`;
    const promises = serialised.map(s => {
      return this.db.execute(sql, [
        s.channel, s.messaging, s.queue
      ]);
    });
    console.log(promises);
    await Promise.allSettled(promises);
    console.log("done");
    this.db.unprepare(sql);
  }

  /**
   *
   * @param {string} user Stoat user id
   * @param {string} username last.fm username
   * @param {string} session session token
   */
  async storeLastFmSession(user, username, session) {
    try {
      await this.db.execute("DELETE FROM lastfm_sessions WHERE userid=?", [user]);
      const res = await this.db.execute("INSERT INTO lastfm_sessions (userid, username, session, linked) VALUES (?, ?, ?, NOW())", [
        user, username, session
      ]);
    } catch (e) {
      console.error("INSERT lastfm_sessions error: ", e);
      return false;
    }
    return true;
  }
  /**
   *
   * @param {string} user
   */
  async getLastFmSession(user) {
    try {
      const res = await this.db.execute("SELECT * FROM lastfm_sessions WHERE userid=?", [user]);
      if (res.length === 0) return null;
      /** @type {{username: string, key: string, linked: number}} */
      const result = res[0];
      return {
        username: result.username,
        key: result.session,
        linked: result.linked,
      }
    } catch (e) {
      console.error("SELECT lastfm_sessions error for user " + user + ": ", e);
      return null;
    }
  }

  /**
   * Gracefully closes any database connections
   * @returns {Promise<void>}
   */
  close() {
    return this.db.end();
  }
}
