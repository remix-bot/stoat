import NotificationManager from "/js/Notifications.js";
import ColourUtil from "/js/ColourUtil.js";
import API from "/js/API.js";
import "/js/SearchInput.js";
import "/js/Queue.js";

class Player extends HTMLElement {
  static get observedAttributes() {
    return ["disabled"];
  }
  artist = null;
  song = null;
  img = null;
  controls = null;
  playBtn = null;
  pauseBtn = null;

  queue = null;

  _disabled = false;
  _paused = false;
  elapsedTime = 0;
  timeInterval = 0;
  timerRunning = false;
  _duration = 0;
  updateImgColour = false;

  elapsedTimeElem = null;
  durationElem = null;
  volSlider = null;
  volIcon = null;

  currVol = 100;

  api = null;
  colour = new ColourUtil(); // TODO: implement colour changes

  constructor() {
    super();

    if (!window.remix) window.remix = { notifications: new NotificationManager() };
    if (!window.remix.notifications) window.remix.notifications = new NotificationManager();

    // TODO: switch to custom event emitter
    this.api = new API(); // initiate after notification manager initiated
    window.remix.api = this.api; // for other components, like the server list
    this.#setupEvents();

    this.songInfo = {
      duration: 0,
      elapsedTime: 0,
      artist: null,
      title: null,
      thumbnail: null
    };
  }

  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "/css/Player.css";
    shadow.appendChild(styles)

    const fa = document.createElement("link");
    fa.rel = "stylesheet";
    fa.href = "/assets/fontawesome/css/fontawesome.css";

    const faAll = document.createElement("link");
    faAll.rel = "stylesheet";
    faAll.href = "/assets/fontawesome/css/all.min.css";
    shadow.append(fa, faAll);

    const c = document.createElement("div"); // container div
    c.style = `
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
    row-gap: 1rem;
    grid-rows: 2;
    align-items: center;
    padding: 1.5rem;
    border-radius: 5px;
    background-color: rgb(31, 41, 55);
    /*border: 1px solid #282828;*/
    box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.4);
    color: #fff;
    font-family: 'Helvetica Neue', sans-serif;
    font-size: 1rem;`;
    c.classList.add("remix-player");
    shadow.appendChild(c);

    const imgCon = document.createElement("div");
    imgCon.style = "aspect-ratio: 1/1; margin-right: 2rem; grid-row: 1; grid-column: 1;";
    imgCon.classList.add("thumbnail");
    c.appendChild(imgCon);

    const img = document.createElement("img");
    img.id = "thumbnail";
    img.style = "border-radius: 5px; object-fit: cover; height: 100%; width: 100%;";
    img.src = "/assets/icon.png";
    img.alt = "Thumbnail of the current song";
    this.img = img;
    this.img.onload = () => {
      if (!this.updateImgColour) return this.updateImgColour = true;
      const colour = this.colour.pickColour(this.img);
      this.dispatchEvent(new CustomEvent("imageColour", { detail: colour }));
    }
    imgCon.append(img);

    const cCon = document.createElement("div"); // control container
    cCon.style = "display: flex; flex-direction: column; justify-content: center; height: 100%; flex-grow: 2; grid-row: 1; grid-column-start: 2; grid-column-end: 4; text-align: center; gap: 0.2rem";
    cCon.class = "player-info";
    c.append(cCon);

    const h1 = document.createElement("h1");
    h1.style = "font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;";
    h1.innerText = "Currently Playing";
    cCon.append(h1);

    const songName = document.createElement("p");
    songName.style = "font-size: 1rem; margin-bottom: 1rem;";
    cCon.append(songName);

    const song = document.createElement("span");
    this.song = song;
    song.id = "song";

    const artist = document.createElement("span");
    artist.id = "artist";
    this.artist = artist;
    songName.append(song, " - ", artist);

    const time = document.createElement("span");
    cCon.append(time);

    const elapsed = document.createElement("span");
    elapsed.id = "elapsedTime";
    elapsed.innerText = "00:00";
    this.elapsedTimeElem = elapsed;

    const duration = document.createElement("span");
    duration.id = "duration";
    duration.innerText = "00:00";
    this.durationElem = duration;
    time.append(elapsed, "/", duration);

    const controls = document.createElement("div");
    controls.style = "display: flex; flex-direction: row; justify-content: center; opacity: 0.5";
    this.controls = controls;
    cCon.append(controls);

    const playBtn = document.createElement("button");
    playBtn.cursor = "pointer";
    playBtn.classList.add("btn", "btn-play", "btn-pbt", "hidden"); // TODO: remove unnecessary classes
    playBtn.style = "margin-right: 0.5rem";
    playBtn.addEventListener("click", async () => {
      // TODO: click events
      const success = await this.api.resume();
      if (!success) return;

      this.paused = false;
      pauseBtn.classList.remove("hidden");
      playBtn.classList.add("hidden");
    });
    playBtn.disabled = true;
    playBtn.append(this.#createFaI("fa-solid fa-play", "color: #e9196c;"));
    this.playBtn = playBtn;
    controls.append(playBtn);

    const pauseBtn = document.createElement("button");
    pauseBtn.style.cursor = "pointer";
    pauseBtn.classList.add("btn", "btn-pause", "btn-pbt");
    pauseBtn.addEventListener("click", async () => {
      // TODO: click events
      const success = await this.api.pause();
      if (!success) return;

      this.paused = true;
    });
    pauseBtn.disabled = true;
    pauseBtn.append(this.#createFaI("fa-solid fa-pause", "color: #e9196c; margin-right: 0.5rem;"));
    this.pauseBtn = pauseBtn;
    controls.append(pauseBtn);

    const skipBtn = document.createElement("button");
    skipBtn.style.cursor = "pointer";
    skipBtn.classList.add("btn", "btn-skip", "btn-pbt");
    skipBtn.addEventListener("click", async () => {
      // TODO: pushAction(this);
      const success = await this.api.skip();
      if (!success) return;
    });
    skipBtn.disabled = true;
    skipBtn.append(this.#createFaI("fa-solid fa-forward", "color: #e9196c"));
    controls.append(skipBtn);

    const slContainer = document.createElement("div");
    slContainer.classList.add("slidecontainer");
    slContainer.style = "margin-left: 0.5rem; display: flex; flex-direction: row; align-items: center; gap: 0.2rem";
    slContainer.title = "100%";
    controls.append(slContainer);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.style = "accent-color: #e9196c; background: #e9196c";
    slider.classList.add("slider");
    slider.id = "volumeSlider";
    slider.value = 100;
    slider.min = 0;
    slider.max = 100;
    this.volSlider = slider;
    this.currVol = +slider.value;
    slider.addEventListener("mouseup", async (e) => { // post volume to server
      this.updateSlider();
      this.updateVolIcon();
      const d = await this.api.setVolume(+e.target.value);
      const volume = this.currVol;
      if (d) return this.currVol = +e.target.value;

      // reset volume slider on error
      this.setVolD(volume);
    });
    // for reference check player.ejs
    slider.addEventListener("oninput", (e) => { // update slider range according to changes
      this.updateSlider(e);
      this.updateVolIcon(value);
    });
    slContainer.append(slider);
    const vI = this.#createFaI("fa-solid fa-volume-high", "float:left;color: #e9196c");
    vI.id = "volumeIcon";
    this.volIcon = vI;
    slContainer.append(vI);
    // TODO: implement loop control

    const search = document.createElement("search-input");
    search.addEventListener("result", ({ detail: data }) => {
      console.log(data);
      //if (!data.url) return;
      this.api.play(data.raw);
    });
    // TODO: implement full window search
    cCon.append(search);

    const queue = document.createElement("remix-queue");
    queue.style = "grid-row: 2; grid-column-start: 1; grid-column-end: 4";
    this.queue = queue;
    c.append(queue);

    // TODO: maximising/minimising player (together with lazy loading)
  }
  attributeChangedCallback(name, oldVal, newVal) {
    if (name !== "disabled") return;
    if (oldVal == newVal) return;
    if (newVal == "true") return this.disabled = true; // run setter
    if (newVal == "false") return this.disabled = false;
  }

  #setupEvents() { // TODO: implement events
    const socket = this.api.socket;

    // TODO: implement implement proper loop feature (not just rearrangement like it is right now)
    socket.on("info", (info) => {
      console.log(info);
      if (info.currData) {
        this.setVolD(info.currData.volume * 100);
        this.paused = info.currData.paused;
        this.queue.items = info.currData.queue;
      }
      if (info.channel) this.dispatchEvent(new CustomEvent("join", { detail: info }))
      //if (info.channel) updateCDisplay(info);
      if (Object.keys(info.currSong || {}).length > 1) {
        this.updateActiveVid(info.currSong);
        this.queue.setCurrent(info.currSong);
        if (info.currSong.elapsedTime > 0) this.startTimer(info.currSong.elapsedTime);
      }
      if (info.channel) this.disabled = false;
    });
    socket.on("joined", (data) => {
      console.log(data);
      this.disabled = false;
      this.queue.items = data.currData.queue;
      this.setVolD(data.currData.volume * 100);
      this.dispatchEvent(new CustomEvent("join", { detail: data }))
      //updateCDisplay(data)
      if (data.currSong) this.updateActiveVid(data.currSong);
      this.paused = data.currData.paused;
    });
    socket.on("resume", (d) => {
      this.startTimer(d.elapsedTime);
      this.paused = false;
    });
    socket.on("pause", (d) => {
      this.stopTimer(d.elapsedTime);
      this.paused = true;
    });
    socket.on("userjoin", (user) => {
      console.log("join", user);
    })
    socket.on("userleave", (user) => {
      console.log("leave", user);
    });
    socket.on("left", () => {
      this.stopTimer(0);
      this.resetTimeDisplay();
      this.reset();
      this.dispatchEvent(new CustomEvent("leave"))
      // above line replaces following legacy code:
      //updateCDisplay({ channel: { name: "-" }, server: { name: "-" } })
    });
    socket.on("startplay", (vid) => {
      this.stopTimer(0);
      this.resetTimeDisplay();
      this.updateActiveVid(vid)
    });
    socket.on("streamStartPlay", () => this.startTimer(0))
    socket.on("stopplay", () => {
      this.stopTimer(0);
      this.resetTimeDisplay();
      this.reset();
    });
    socket.on("volume", (v) => this.setVolD(v * 100));
    socket.on("queue", (data) => {
      switch (data.type) {
        case "add": // something is added to the queue
          const video = data.data.data;
          this.queue.push(video, !data.data.append);
        break;
        case "remove": // something is removed from the queue
          const index = data.data.index;
          this.queue.remove(index);
        break;
        case "update": // queue has changed due to a new song playing
          this.queue.next();
        break;
        case "shuffle":
          const newArr = data.data;
          this.queue.rearrange(newArr.map(s => s.videoId));
        break;
        case "clear":
          this.queue.clear();
        break;
      }
    });
  }

  formatTime(milliseconds) {
    return new Date(milliseconds).toISOString().slice(
      // if 1 hour passed, show the hour component,
      // if 1 hour hasn't passed, don't show the hour component
      milliseconds > 3600000 ? 11 : 14,
      19
    );
  }

  isInteger = Number.isInteger || function(value) {
    return typeof value === 'number' &&
      isFinite(value) &&
      Math.floor(value) === value;
  };

  updateActiveVid(v) {
    console.log(v);
    this.img.src = "/api/imageProxy?url=" + encodeURIComponent(v.thumbnail);
    this.artist.innerText = (!v.artists) ? v.author.name : v.artists.map(a => `${a.name}`).join(" & ");
    this.song.innerText = v.title;

    const t = +(v.duration.split(':').reduce((acc,time) => (60 * acc) + +time)); // convert to seconds
    this.duration = t * 1000;
  }

  updateSlider() {
    this.volSlider.style.background = `linear-gradient(to right, #e9196c ${this.volSlider.value}%, rgb(19, 25, 39) ${this.volSlider.value}%)`;
    const value = Math.round(this.volSlider.value);
    this.volSlider.parentElement.title = value + "%";
  }
  setVolD(vol) {
    this.currVol = vol;
    this.volSlider.value = vol;
    this.updateSlider();
    this.updateVolIcon(vol);
  }
  updateVolIcon(value) {
    const volumeIcon = this.volIcon;
    if (value < 50) {
      if (volumeIcon.classList.contains("fa-volume-low")) return;
      volumeIcon.classList.remove("fa-volume-high");
      volumeIcon.classList.add("fa-volume-low");
    } else {
      if (volumeIcon.classList.contains("fa-volume-high")) return;
      volumeIcon.classList.add("fa-volume-high");
      volumeIcon.classList.remove("fa-volume-low");
    }
  }

  async startTimer(startVal) { // fix problems with intervals freezing on blur of the tab
    if (startVal || startVal === 0) this.elapsedTime = startVal;
    this.elapsedTimeElem.innerText = this.formatTime(this.elapsedTime);
    this.timerRunning = true;

    const countUp = () => {
      this.elapsedTime += 1000;
      this.elapsedTimeElem.innerText = this.formatTime(this.elapsedTime);
    }

    if (!this.isInteger(this.elapsedTime / 1000)) {
      const diff = ((Math.floor(this.elapsedTime / 1000) + 1) - (this.elapsedTime / 1000)) * 1000;
      this.elapsedTime = this.elapsedTime + diff;
      await (new Promise(res => setTimeout(res, diff)));
      countUp();
    }
    this.timeInterval = setInterval(countUp, 1000);
  }
  stopTimer(time) {
    if (this.timeInterval) clearInterval(this.timeInterval);
    if (time && time !== 0) this.elapsedTime = time;
    this.timerRunning = false;
    this.elapsedTimeElem.innerText = this.formatTime(this.elapsedTime);
  }
  resetTimeDisplay() {
    this.time = 0;
    this.duration = 0;
  }

  get time() { return this.elapsedTime; };
  set time(num) {
    if (this.timerRunning) {
      this.stopTimer();
      return this.startTimer(num);
    }
    this.elapsedTime = num;
    this.elapsedTimeElem.innerText = this.formatTime(num);
  }
  get duration() { return this._duration; };
  set duration(num) {
    this._duration = num;
    this.durationElem.innerText = this.formatTime(num);
  }
  get paused() { return this._paused; }
  set paused(bool) {
    if (!bool) {
      this.pauseBtn.classList.remove("hidden");
      this.playBtn.classList.add("hidden");
    } else {
      this.pauseBtn.classList.add("hidden");
      this.playBtn.classList.remove("hidden");
    }
    this._paused = bool;
  }

  reset() {
    this.disabled = true;
    this.dispatchEvent(new CustomEvent("imageColour"), { detail: null });
    this.updateImgColour = false;
    this.img.src = "/assets/icon.png";
    this.artist.innerText = "";
    this.song.innerText = "";
    this.queue.clear();
  }

  get disabled() {
    return this._disabled;
  }
  set disabled(bool) {
    bool = !!bool;
    this._disabled = bool;
    if (bool) return this.#disable();
    return this.#enable();
  }

  #disable() {
    this.updateImgColour = false;
    this.img.src = "/assets/icon.png";
    this.artist.innerText = "";
    this.song.innerText = "";

    // TODO: reset queue
    const btns = this.controls.children;
    this.controls.style.opacity = 0.5;
    for (let i = 0; i < btns.length; i++) {
      btns[i].disabled = true;
      btns[i].style.cursor = "default";
    }
  }
  #enable() {
    const btns = this.controls.children;
    this.controls.style.opacity = 1;
    for (let i = 0; i < btns.length; i++) {
      btns[i].disabled = false;
      btns[i].style.cursor = "pointer";
    }
  }

  #createFaI(classNames, style) {
    const i = document.createElement("i");
    i.classList.add(...classNames.split(" "));
    i.style = style;
    return i;
  }
}

customElements.define("remix-player", Player);
