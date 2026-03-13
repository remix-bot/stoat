var { workerData, parentPort } = require("worker_threads");
const EventEmitter = require("events");
const yts = require("yt-search");
const Spotify = require("spotifydl-core").default;
const scdl = require("soundcloud-downloader").default;
const { Soundcloud } = require("soundcloud.ts");
const YoutubeMusicApi = require("youtube-music-api-fix");
const meta = require("./src/probe.js");
const { Innertube, Platform } = require("youtubei.js");

// Tell youtubei.js how to evaluate YouTube's obfuscated JS for URL deciphering.
Platform.shim.eval = async (data, env) => {
  const properties = [];
  if (env.n)   properties.push(`n: exportedVars.nFunction("${env.n}")`);
  if (env.sig) properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  const code = `${data.output}\nreturn { ${properties.join(', ')} }`;
  return new Function(code)();
};

class YTUtils extends EventEmitter {
  constructor(spotify) {
    super();

    this.spotifyClient = null;
    this.spotifyConfig = spotify;
    this.ytApi = null;
    this.scld = new Soundcloud();
    this._innertube = null;

    return this;
  }
  get api() {
    this.ytApi ||= new YoutubeMusicApi();
    return this.ytApi;
  }
  get spotify() {
    this.spotifyClient ||= new Spotify(this.spotifyConfig);
    return this.spotifyClient;
  }
  init() {
    if (Object.keys(this.api.ytcfg).length > 0) return true;
    return this.api.initalize();
  }
  async innertube() {
    if (this._innertube) return this._innertube;
    this._innertube = Innertube.create({
      retrieve_player: true,
      generate_session_locally: true,
    });
    return this._innertube
  }
  error(data) {
    this.emit("error", data);
  }
  prettifyTimestamp(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const p = (n) => String(n).padStart(2, "0");
    return hours > 0
      ? `${hours}:${p(mins)}:${p(secs)}`
      : `${mins}:${p(secs)}`;
  }

  youtubeParser(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    var match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : false;
  }
  liveParser(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?)|(live\/))\??v?=?([^#&?]*).*/;
    var match = url.match(regExp);
    return (match && match[8]) ? match[8] : false;
  }
  playlistParser(url) {
    var match = url.match(/[&?]list=([^&]+)/i);
    return (match || [0, false])[1];
  }
  isYoutubeMusic(str) {
    return /music\.youtube\.com/.test(str);
  }
  isYoutube(str) {
    return /(youtu\.be\/|youtube\.com\/)/.test(str);
  }
  isSpotify(str) {
    return /^(?:spotify:|(?:https?:\/\/(?:open|play)\.spotify\.com\/))(?:embed)?\/?(album|track|playlist)(?::|\/)((?:[0-9a-zA-Z]){22})/.test(str);
  }
  parseScdlInput(i) {
    const regex = /(?<url>((https:\/\/)|(http:\/\/)|(www.)|(m\.)|(\s))+(soundcloud.com\/)+(?<artist>[a-zA-Z0-9\-\.]+)(\/)+(?<id>[a-zA-Z0-9\-\.]+))/gmi;
    const res = regex.exec(i);
    if (!res) return false;
    return res.groups;
  }
  isSoundCloud(query) {
    return !!this.parseScdlInput(query);
  }
  isValidUrl(str) {
    return !!str.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
  }

  /**
   * Text-based search. Returns an array of result objects for the given provider.
   * provider: "yt" | "ytm" | "scld"
   */
  async textSearch(query, limit = 5, provider = "yt") {
    switch (provider) {
      case "ytm": {
        await this.init();
        const results = (await this.api.search(query, "song")).content;
        return results.slice(0, Math.min(limit, results.length)).map(result => {
          let r = { ...result };
          r.title = result.name;
          r.url = `https://music.youtube.com/watch?v=${result.videoId}`;
          r.thumbnail = (Array.from(result.thumbnails).sort((a, b) => b.width - a.width)[0] || {}).url;
          r.artists = ((Array.isArray(result.artist)) ? Array.from(result.artist) : [result.artist])
            .map(a => (a.url = `https://music.youtube.com/channel/${a.browseId}`, a));
          r.duration = { timestamp: this.prettifyTimestamp(result.duration || 0), seconds: Math.floor((result.duration || 0) / 1000) };
          return r;
        });
      }
      case "scld": {
        return await this.getSoundCloudTracks(query, limit);
      }
      default: { // "yt"
        const videos = (await yts(query)).videos;
        return videos.slice(0, Math.min(limit, videos.length));
      }
    }
  }

  async getResults(query, limit, provider) {
    const data = await this.textSearch(query, limit, provider);
    return { data };
  }

  async getSoundCloudTracks(query, limit = 10) {
    var tracks = await this.scld.tracks.search({ q: query });
    return tracks.collection.slice(0, limit).map(res => ({
      url: res.permalink_url,
      title: res.title,
      thumbnail: res.artwork_url,
      artists: [{
        name: res.publisher_metadata?.artist || res.user.full_name,
        url: res.user.permalink_url
      }],
      duration: { timestamp: this.prettifyTimestamp(res.duration), seconds: Math.floor(res.duration / 1000) },
      type: "soundcloud",
    }));
  }
  getSoundCloudResult(query) {
    return new Promise(async (res) => {
      const track = (await this.getSoundCloudTracks(query, 1))[0];
      return res(track);
    });
  }
  async getScdl(query) {
    const data = this.parseScdlInput(query);
    this.emit("message", "Loading SoundCloud info...");
    const info = await scdl.getInfo(data.url);
    this.emit("message", "Successfully added to queue.");
    return {
      type: "video",
      data: {
        type: "soundcloud",
        url: data.url,
        thumbnail: info.artwork_url,
        duration: {
          timestamp: this.prettifyTimestamp(info.full_duration),
        },
        title: info.title,
        author: {
          name: info.user.username,
          url: info.user.permalink_url
        }
      }
    };
  }

  async getSpotifyData(query) {
    const match = query.match(/^(?:spotify:|(?:https?:\/\/(?:open|play)\.spotify\.com\/))(?:embed)?\/?(album|track|playlist)(?::|\/)((?:[0-9a-zA-Z]){22})/);
    if (!match) return null;
    const type = match[1];
    const id = match[2];
    if (type == "album") return await this.getSpotifyAlbum(id);
    if (type == "playlist") return await this.getSpotifyPlaylist(id);
    return await this.getBySpotifyId(id);
  }
  getSpotifyAlbum(id, type = "album") {
    return new Promise(async (res) => {
      this.emit("message", "Loading " + type + " songs... (This may take a while)");
      const album = await ((type == "album") ? this.spotify.getAlbum : this.spotify.getPlaylist)("https://open.spotify.com/" + type + "/" + id);
      var load = (trackId) => {
        return new Promise(async res => {
          const spotifyTrackUrl = "https://open.spotify.com/track/" + trackId;
          const track = await this.spotify.getTrack(spotifyTrackUrl);
          res(await this.getByQuerySpotify(track.name + " " + track.artists[0], spotifyTrackUrl));
        });
      };
      Promise.allSettled(album.tracks.map(a => load(a))).then((d) => {
        d = d.map(e => e.value).filter(e => e && e.type === "video" && e.data);
        this.emit("message", "Successfully added " + d.length + " songs to the queue.");
        res({ type: "list", data: d.map(e => e.data) });
      });
    });
  }
  getSpotifyPlaylist(id) {
    return this.getSpotifyAlbum(id, "playlist");
  }
  async getBySpotifyId(id) {
    this.emit("message", "Loading Spotify track...");
    const spotifyTrackUrl = "https://open.spotify.com/track/" + id;
    let song = await this.spotify.getTrack(spotifyTrackUrl);
    this.emit("message", "Resolving Spotify track...");
    // Search on YTM for best match (better for music tracks)
    return await this.getByQuerySpotify(song.name + " " + song.artists[0], spotifyTrackUrl);
  }

  async fetchPlaylist(id) {
    return (await yts({ listId: id })).videos;
  }
  async getPlaylistData(playlist, query) {
    this.emit("message", "Loading playlist items... (This may take a while)");
    var videos;
    try {
      videos = await this.fetchPlaylist(playlist);
      videos = videos.map((v) => {
        v.url = "https://music.youtube.com/watch?v=" + v.videoId;
        return v;
      });
    } catch (e) {
      this.error(e);
      this.emit("message", "Failed to load playlist. Maybe it's private?");
      return false;
    }
    if (videos) {
      this.emit("message", "Successfully added " + videos.length + " songs to the queue.");
    } else {
      this.emit("message", "**There was an error fetching the playlist!**");
      return false;
    }
    return { type: "list", data: videos };
  }
  async getById(parsedId, live) {
    this.emit("message", "Loading video data...");
    let video;
    try {
      const innertube = await this.innertube();
      const info = await innertube.getBasicInfo(parsedId, "WEB");
      const d = info.basic_info;
      video = {
        videoId: parsedId,
        title: d.title || "Unknown",
        url: `https://www.youtube.com/watch?v=${parsedId}`,
        thumbnail: d.thumbnail?.[0]?.url || null,
        duration: {
          timestamp: this.prettifyTimestamp((d.duration || 0) * 1000),
          seconds: d.duration || 0,
        },
        author: {
          name: d.channel?.name || d.author || "Unknown",
          url: d.channel?.url || "#",
        },
      };
    } catch (err) {
      console.error("[Worker] getBasicInfo failed, falling back to yts:", err.message);
      video = await yts({ videoId: parsedId });
    }

    if (video) {
      this.emit("message", `Successfully added [${video.title}](${video.url}) to the queue.`);
    } else {
      this.emit("message", "**There was an error loading the youtube video with the id '" + parsedId + "'!**");
    }
    if (!video) return false;
    if (live) {
      video.duration.timestamp = "live";
      video.url = "https://youtube.com/live/" + parsedId;
    }
    return { type: "video", data: video };
  }

  // Search YouTube Music and return first result
  async getByQueryYTM(query, silent = false) {
    if (!silent) this.emit("message", "Searching YouTube Music...");
    await this.init();
    const results = (await this.api.search(query, "song")).content;
    const song = results[0];
    if (!song) {
      this.emit("message", "**No YouTube Music result found for '" + query + "'!**");
      return false;
    }
    const r = { ...song };
    r.title = song.name;
    r.url = `https://music.youtube.com/watch?v=${song.videoId}`;
    r.thumbnail = (Array.from(song.thumbnails).sort((a, b) => b.width - a.width)[0] || {}).url;
    r.artists = ((Array.isArray(song.artist)) ? Array.from(song.artist) : [song.artist])
      .map(a => (a.url = `https://music.youtube.com/channel/${a.browseId}`, a));
    r.duration = { timestamp: this.prettifyTimestamp(song.duration || 0), seconds: Math.floor((song.duration || 0) / 1000) };
    this.emit("message", `Successfully added [${r.title}](${r.url}) to the queue.`);
    return { type: "video", data: r };
  }

  // Search YouTube and return first result — used as text-search fallback
  async getByQueryYT(query, silent = false) {
    if (!silent) this.emit("message", "Searching YouTube...");
    const video = (await yts(query)).videos[0];
    if (!video) {
      this.emit("message", "**No YouTube result found for '" + query + "'!**");
      return false;
    }
    this.emit("message", `Successfully added [${video.title}](${video.url}) to the queue.`);
    return { type: "video", data: video };
  }

  // Search SoundCloud text and return first result
  async getByQuerySC(query) {
    this.emit("message", "Searching SoundCloud...");
    const song = await this.getSoundCloudResult(query);
    if (!song) {
      this.emit("message", "**No SoundCloud result found for '" + query + "'!**");
      return false;
    }
    this.emit("message", `Successfully added [${song.title}](${song.url}) to the queue.`);
    return { type: "video", data: song };
  }

  // Spotify-resolved search: tries YTM first, falls back to YT
  async getByQuerySpotify(query, spotifyUrl) {
    this.emit("message", "Searching Spotify...");
    const r = await this.getByQueryYTM(query, true);
    if (r) {
      if (spotifyUrl) r.data.spotifyUrl = spotifyUrl;
      return r;
    }
    const fallback = await this.getByQueryYT(query, true);
    if (fallback && spotifyUrl) fallback.data.spotifyUrl = spotifyUrl;
    return fallback;
  }

  isMedia(url) {
    return new Promise(res => {
      require("https").get(url, function (r) {
        res(["audio", "video"].includes(r.headers["content-type"].slice(0, r.headers["content-type"].indexOf("/"))));
      });
    });
  }
  unknownMedia(url) {
    return new Promise(async (res) => {
      const fileName = new URL(url).pathname.split("/").pop();
      this.emit("message", "Fetching meta data...");
      const data = await meta(url);
      data.title ||= (fileName.length > 0) ? fileName : "Unknown";
      data.album ||= "Unknown";
      data.artist ||= "Unknown Artist";
      data.thumbnail = null;
      data.url = url;
      data.type = "external";
      data.author = { name: data.artist, url: "#" };
      this.emit("message", `Added [${data.title}](${data.url}) to the queue.`);
      res({ type: "video", data: data });
    });
  }

  async getVideoData(query, provider = "yt") {
    if (this.isSpotify(query))    return await this.getSpotifyData(query);
    if (this.isSoundCloud(query)) return await this.getScdl(query);

    if (this.isYoutubeMusic(query)) {
      const playlist = this.playlistParser(query);
      if (playlist) return await this.getPlaylistData(playlist, query);
      const parsed = this.youtubeParser(query);
      if (parsed) return await this.getById(parsed);
    }

    if (this.isYoutube(query)) {
      const playlist = this.playlistParser(query);
      if (playlist) return await this.getPlaylistData(playlist, query);
      const parsed = this.youtubeParser(query);
      if (parsed) return await this.getById(parsed);
      const live = this.liveParser(query);
      if (live) return await this.getById(live, true);
    }

    // Unknown URL (direct media file, etc.)
    if (this.isValidUrl(query)) {
      if (await this.isMedia(query)) return await this.unknownMedia(query);
    }

    switch (provider) {
      case "ytm":  return await this.getByQueryYTM(query);
      case "scld": return await this.getByQuerySC(query);
      default:     return await this.getByQueryYT(query);
    }
  }

  async search(string, id) {
    if (id) {
      try {
        const innertube = await this.innertube();
        const info = await innertube.getBasicInfo(string, "WEB");
        const d = info.basic_info;
        return {
          videoId: string,
          title: d.title || "Unknown",
          url: `https://www.youtube.com/watch?v=${string}`,
          thumbnail: d.thumbnail?.[0]?.url || null,
          duration: { timestamp: this.prettifyTimestamp((d.duration || 0) * 1000), seconds: d.duration || 0 },
          author: { name: d.channel?.name || d.author || "Unknown", url: d.channel?.url || "#" },
        };
      } catch (err) {
        console.error("[Worker] Innertube getBasicInfo failed, falling back to yts:", err.message);
        return await yts({ videoId: string });
      }
    }
    return (await yts(string)).videos[0];
  }
}

const jobId = workerData.jobId;
const data = workerData.data;
const utils = new YTUtils(data.spotify);

utils.on("message", (content) => {
  if (jobId === "dev") { console.log("[Message] " + content); return; }
  post("message", content);
});
utils.on("error", (msg) => {
  if (jobId === "dev") { console.log("[Error] " + msg); return; }
  post("error", msg);
});

const post = (event, data) => {
  return parentPort.postMessage(JSON.stringify({ event: event, data: data }));
};

(async () => {
  if (jobId === "dev") {
    console.log(await utils.getVideoData("Neoni funeral", "ytm"));
    return;
  }

  var r = null;
  switch (jobId) {
    case "search":
      let result = await utils.search(data, true);
      post("finished", result);
      break;
    case "generalQuery":
      r = await utils.getVideoData(data.query, data.provider);
      post("finished", r);
      break;
    case "searchResults":
      r = await utils.getResults(data.query, data.resultCount, data.provider);
      post("finished", r);
      break;
    default:
      console.log("Invalid jobId");
      process.exit(0);
  }
  process.exit(1);
})();
