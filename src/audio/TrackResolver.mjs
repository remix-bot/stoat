import { EventEmitter } from "node:events";
import { PROVIDERS } from "../constants/Providers.mjs";
import { Utils } from "../Utils.mjs";

/**
 * @typedef {import("../Player.mjs").Video} Video
 */

/**
 * @class TrackResolver
 * @augments EventEmitter
 * @classdesc Shared asynchronous track and search resolver using the shared Moonlink/NodeLink Manager.
 * Replaces per-command `worker.mjs` OS thread and duplicate WebSocket spawning.
 */
export class TrackResolver extends EventEmitter {
  /**
   * @param {import("moonlink.js").Manager} nodelink
   * @param {() => Promise<import("moonlink.js").Node>} getNodeFn
   */
  constructor(nodelink, getNodeFn) {
    super();
    this.nodelink = nodelink;
    this.getNode = getNodeFn;
  }

  /**
     * Strips a title string of common suffixes and other additions that are not part of the actual title.
     * @param {string} title
     * @returns {string}
     */
  cleanTitle(title) {
    if (!title || typeof title !== "string") return "Unknown";
    return title
      // Remove feat/ft/remix/edit/version/prod inside parentheses or brackets
      .replace(/\s*[\(\[][^\)\]]*(?:feat|ft|remix|edit|version|prod)[^\)\]]*[\)\]]/gi, "")
      // Remove feat/ft after a dash outside brackets
      .replace(/\s*-\s*(?:feat|ft)\.?.*/gi, "")
      // Remove common streaming/YouTube metadata suffixes in brackets only
      .replace(/\s*\[(?:official\s*(?:video|audio|lyric\s*video|music\s*video)|lyrics?|hd|4k|remaster(?:ed)?)\]/gi, "")
      .trim();
  }

  /**
   * @param {import("moonlink.js").Track} track
   * @returns {Video|null}
   */
  trackToVideo(track) {
    if (!track || typeof track !== "object") return null;
    const i = track.info ?? {};
    const ms = i.length ?? 0;
    const clean = this.cleanTitle(i.title ?? "Unknown");
    return {
      videoId: i.identifier ?? "",
      encoded: track.encoded ?? "",
      sourceName: i.sourceName ?? "unknown",
      title: clean,
      url: i.uri ?? `https://www.youtube.com/watch?v=${i.identifier}`,
      thumbnail: i.artworkUrl ?? null,
      spotifyUrl: null,
      duration: {
        timestamp: Utils.prettifyMS(ms, "h:!m:!s"),
        seconds: Math.floor(ms / 1000),
      },
      author: {
        name: i.author ?? "Unknown",
        url: i.uri ?? null,
      },
      artists: null,
    };
  }

  /**
   * @param {string} str
   * @returns {boolean}
   */
  isValidUrl(str) {
    return /https?:\/\/[^\s]+/.test(str);
  }

  async test(query, provider) {
    const node = await this.getNode();
    const res = await node.rest.loadTracks((PROVIDERS[provider].prefix || PROVIDERS[provider].ytm) + ":" + query);
    return res.data.map(t => this.trackToVideo(t))[0];
  }

  /**
   * Search and return up to `limit` tracks.
   * @param {string} query
   * @param {number} [limit=5]
   * @param {string} [provider="ytm"]
   * @returns {Promise<{data: Video[]}>}
   */
  async getResults(query, limit = 5, provider = "ytm") {
    const prov = PROVIDERS[provider] || PROVIDERS.ytm;
    const id = this.isValidUrl(query) ? query : prov.prefix + ":" + query;
    const node = await this.getNode();
    const data = await node.rest.loadTracks(id);

    let tracks = [];
    switch (data.loadType) {
      case "search":
        tracks = data.data ?? [];
        break;
      case "track":
        tracks = [data.data];
        break;
      case "playlist":
        tracks = data.data?.tracks ?? [];
        break;
    }

    return {
      data: tracks.slice(0, limit).map(this.trackToVideo.bind(this)).filter(Boolean),
    };
  }

  /**
   * @typedef MediaData
   * @property {("list"|"video")} type
   * @property {Video|Video[]|null} data
   */
  /**
   * Resolve a direct URL (track, playlist, or search result).
   * @param {string} url
   * @param {(msg: string) => void} [onMessage]
   * @returns {Promise<MediaData|boolean>}
   */
  async getUrlData(url, onMessage) {
    if (onMessage) onMessage("⏳ Loading...");
    const node = await this.getNode();
    let data;
    try {
      data = await node.rest.loadTracks(url);
    } catch (e) {
      throw new Error(e?.message || String(e));
    }

    switch (data.loadType) {
      case "playlist": {
        const tracks = (data.data?.tracks ?? []).map(this.trackToVideo.bind(this)).filter(Boolean);
        tracks.forEach((t) => {
          t.playlistName = data.data?.info?.name ?? null;
        });
        if (onMessage) onMessage(`✅ Added **${tracks.length}** songs to the queue.`);
        return { type: "list", data: tracks };
      }
      case "track": {
        const video = this.trackToVideo(data.data);
        if (onMessage) onMessage(`✅ Added [${video.title}](${video.url}) to the queue.`);
        return { type: "video", data: video };
      }
      case "search": {
        if (Array.isArray(data.data) && data.data.length > 0) {
          const video = this.trackToVideo(data.data[0]);
          if (onMessage) onMessage(`✅ Added [${video.title}](${video.url}) to the queue.`);
          return { type: "video", data: video };
        }
        break;
      }
    }

    if (onMessage) onMessage("❌ Could not load that URL.");
    return false;
  }

  /**
   * Resolve a general search query or URL.
   * @param {string} query
   * @param {string} [provider="ytm"]
   * @param {(msg: string) => void} [onMessage]
   * @returns {Promise<MediaData|boolean>}
   */
  async getVideoData(query, provider = "ytm", onMessage) {
    if (this.isValidUrl(query)) {
      return this.getUrlData(query, onMessage);
    }

    const prov = PROVIDERS[provider] || PROVIDERS.ytm;
    if (onMessage) onMessage(`🔍 Searching ${prov.label}...`);
    const node = await this.getNode();
    let data;
    try {
      data = await node.rest.loadTracks(prov.prefix + ":" + query);
    } catch (e) {
      throw new Error(e?.message || String(e));
    }

    if (data.loadType === "search" && Array.isArray(data.data) && data.data.length > 0) {
      const video = this.trackToVideo(data.data[0]);
      if (onMessage) onMessage(`✅ Added [${video.title}](${video.url}) to the queue.`);
      return { type: "video", data: video };
    }

    if (data.loadType === "playlist") {
      const tracks = (data.data?.tracks ?? []).map(this.trackToVideo.bind(this)).filter(Boolean);
      if (tracks.length > 0) {
        if (onMessage) onMessage(`✅ Added **${tracks.length}** songs to the queue.`);
        return { type: "list", data: tracks };
      }
    }

    if (onMessage) onMessage(`❌ No results found for '${query}'.`);
    return false;
  }
}

export default TrackResolver;
