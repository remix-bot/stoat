class SongItem extends HTMLElement {
  coverElem = null;
  artistElem = null;
  titleElem = null;
  durationElem = null;

  _cover = "/assets/icon.png";
  _artist = "Artist name";
  _title = "Song name";
  _duration = 0;
  _timestamp = "00:00";
  _id = null;

  static get observedAttributes() {
    return ["cover", "artist", "title", "duration", "timestamp"];
  }

  constructor() {
    super();
  }

  #render() {
    const shadow = this.shadowRoot;

    const c = document.createElement("div");
    c.style = "width: 100%; height: 4rem; padding: 0.3rem; display: flex; flex-direction: row; gap: 0.5rem; align-items: center; border-bottom: 1px solid rgb(19, 25, 39)";
    shadow.append(c);

    const cover = document.createElement("img");
    cover.alt = "Song cover";
    cover.src = this._cover;
    cover.style = "aspect-ratio: 1 / 1; height: 100%; border-radius: 5px; object-fit: cover";
    this.coverElem = cover;
    c.append(cover);

    const iCon = document.createElement("div");
    iCon.style = "flex-grow: 3; display: flex; flex-direction: column; align-items: flex-start; gap: 0.1rem";
    c.append(iCon);

    const title = document.createElement("span");
    title.style = "font-size: 1.1rem";
    title.innerText = this._title;
    this.titleElem = title;
    iCon.append(title);

    const artist = document.createElement("span");
    artist.style = "font-size: 0.8rem";
    artist.innerText = this._artist;
    this.artistElem = artist;
    iCon.append(artist);

    const duration = document.createElement("p");
    duration.style = "align-self: center";
    duration.innerText = this._timestamp;
    this.durElem = duration;
    c.append(duration);
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });

    this.#render();
  }

  adoptedCallback() {
    console.log("moved");
  }

  disconnectedCallback() {
    this.shadowRoot.replaceChildren();
  }

  get cover() { return this._cover; }
  set cover(url) {
    this._cover = url;
    this.coverElem.src = this._cover;
  }

  get artist() { return this._artist; }
  set artist(a) {
    this._artist = a;
    this.artistElem.innerText = a;
  }

  get title() { return this._title; }
  set title(t) {
    this._title = t;
    this.titleElem.innerText = t;
  }

  #formatTime(milliseconds) {
    return new Date(milliseconds).toISOString().slice(
      // if 1 hour passed, show the hour component,
      // if 1 hour hasn't passed, don't show the hour component
      milliseconds > 3600000 ? 11 : 14,
      19
    );
  }
  #timestampToMS(t) {
    return +(t.split(':').reduce((acc,time) => (60 * acc) + +time) * 1000);
  }

  get duration() { return this._duration }
  set duration(ms) {
    if (typeof ms === "string") ms = this.#timestampToMS(ms);
    this._duration = ms;
    this._timestamp = this.#formatTime(ms);
    this.durElem.innerText = this._timestamp;
  }

  get timestamp() { return this._timestamp; }
  set timestamp(t) {
    // covnert timestamp to seconds, then cast it to an int and then convert it to milliseconds
    this.duration = (+(t.split(':').reduce((acc,time) => (60 * acc) + +time))) * 1000;
  }

  get id() { return this._id };
  set id(i) { this._id = i };
}

customElements.define("song-item", SongItem);

class Queue extends HTMLElement {
  songItems = [];
  currentSong = null;

  songTemplate = null;
  listCon = null;
  cover = null;
  artist = null;
  title = null;

  _loop = false;
  _songloop = false;

  constructor() {
    super();
  }

  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "/css/Queue.css";
    shadow.append(styles);

    const c = document.createElement("div");
    c.style = "grid-row: 2; grid-column-start: 1; grid-column-end: 4; text-align: center";
    c.classList.add("queue-container");
    shadow.appendChild(c);

    const h = document.createElement("h1");
    h.style = "font-size: 1.5rem; font-weight: normal";
    h.innerText = "Queue";
    c.append(h, document.createElement("br"));

    const listCon = document.createElement("div");
    listCon.style = "width: 100%; display: flex; flex-direction: column;";
    listCon.classList.add("queue");
    this.listCon = listCon;
    c.append(listCon);
  }

  get loop() { return this._loop; }
  set loop(bool) { this._loop = !!bool; }

  get songLoop() { return this._songloop; }
  set songLoop(bool) { this._songloop = !!bool; }

  setCurrent(song) {
    const s = document.createElement("song-item");
    s.style = "width: 100%; height: 4rem; padding: 0.3rem; display: none; flex-direction: row; gap: 0.5rem; align-items: center;";// border-bottom: 1px solid rgb(19, 25, 39)";
    this.listCon.prepend(s);

    s.id = song.videoId;
    s.title = song.title;
    s.artist = (!song.artists) ? song.author.name : song.artists.map(a => `${a.name}`).join(" & ");
    console.log(song.duration);
    (song.duration.timestamp) ? s.timestamp = song.duration.timestamp : s.duration = song.duration;
    s.cover = song.thumbnail;

    s.remove();

    this.currentSong = s;
  }

  #createSongItem(song, pre) {
    const s = document.createElement("song-item");
    s.style = "width: 100%; height: 4rem; padding: 0.3rem; display: flex; flex-direction: row; gap: 0.5rem; align-items: center;";// border-bottom: 1px solid rgb(19, 25, 39)";
    if (!pre) {this.listCon.append(s);} else {this.listCon.prepend(s)};

    s.id = song.videoId;
    s.title = song.title;
    s.artist = (!song.artists) ? song.author.name : song.artists.map(a => `${a.name}`).join(" & ");
    (song.duration.timestamp) ? s.timestamp = song.duration.timestamp : s.duration = song.duration;
    s.cover = song.thumbnail;
    return s;
  }

  push(song, pre=false) { // push a song into the queue
    const s = this.#createSongItem(song, pre);

    if (!pre) {this.songItems.push(s);} else {this.songItems.unshift(s)};
  }
  prepend(song) {
    return this.push(song, true);
  }
  next() {
    if (this.songLoop || (this._loop && this.currentSong && this.songItems.length === 0)) return;
    const next = this.songItems.shift();
    const current = this.currentSong;
    if (this._loop && current) {
      current.style.display = "flex";
      this.songItems.push(current);
    }
    if (!next) return this.#renderQueue(), current;
    next.remove();
    next.style.display = "none";
    this.currentSong = next;

    this.#renderQueue();

    return next;
  }
  remove(index) {
    if (index >= this.songItems.length) return false;
    const song = this.songItems[index];
    song.remove();
    return true;
  }
  rearrange(ids) { // Array of ids in the specified order
    ids = ids.map(e => ({ id: e }));
    this.songItems.forEach(song => {
      const idx = ids.findIndex(e => e.id === song.id && !e.consumed);
      song.queueIndex = idx;
      ids[idx].consumed = true;
    });
    this.songItems = this.songItems.sort((a, b) => a.queueIndex - b.queueIndex);
    this.#renderQueue();
  }

  get items() { return this.songItems; }
  set items(arr) {
    this.listCon.replaceChildren();
    this.songItems = arr.map(e => this.#createSongItem(e));
    this.#renderQueue();
  }

  clear() {
    while (this.songItems.length > 0) {
      const i = this.songItems.shift();
      i.remove();
    }
    this.currentSong?.remove();
    this.currentSong = null;
  }

  #renderQueue() {
    this.songItems.forEach(i => { // reorder items correctly
      this.listCon.append(i);
    });
  }

  // TODO: other queue actions
}

customElements.define("remix-queue", Queue);
