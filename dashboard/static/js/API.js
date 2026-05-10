import NotificationManager from "/js/Notifications.js";

export default class API {
  url = "/api/";

  notifications = window.remix?.notifications || new NotificationManager();
  constructor() { // TODO: websocket
    if (!io) { // socket io not included yet
      const sio = document.createElement("script");
      sio.src = "/socket.io/socket.io.js";
      sio.id = "remix-player-sio";
      document.head.append(sio);
      sio.onload = () => {
        this.connect();
      }
    }
    this.connect();
  }
  join(...paths) {
    return paths.map((part, i) => {
      if (i === 0) {
        return part.trim().replace(/[\/]*$/g, '')
      } else {
        return part.trim().replace(/(^[\/]*|[\/]*$)/g, '')
      }
    }).filter(x=>x.length).join('/');
  }

  connect() { // TODO: implement custom event emitter
    // connect to socket io
    this.socket = io();
    this.socket.emit("info"); // user id is not required anymore
  }

  async post(path, body) { // TODO: improve request handling
    return new Promise((res, rej) => {
      fetch(this.join(this.url, path), {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json"
        }
      }).then(async r => {
        if (!r.ok) return rej(JSON.parse(await r.text()))
        res(await r.json())
      }).catch(e => console.log(e));
    })
  }
  async get(path) {
    return new Promise((res, rej) => {
      fetch(this.join(this.url, path), {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      }).then(async r => {
        if (!r.ok) return rej(JSON.parse(await r.text()));
        res(await r.json());
      }).catch(e => console.log(e));
    })
  }

  pause() { // TODO: unify pause/skip/resume flow
    return new Promise(res => {
      this.post("/dashboard/control", {
        action: "pause"
      }).then(d => {
        res(d.success);
      }).catch(e => {
        // error occured
        this.notifications.addError("Error pausing", e.message)
        res(false);
      });
    });
  }
  resume() {
    return new Promise(res => {
      this.post("/dashboard/control", {
        action: "resume"
      }).then(d => {
        res(d.success);
      }).catch(e => {
        // error occured
        this.notifications.addError("Error resuming", e.message)
        res(false);
      });
    });
  }
  skip() {
    return new Promise(res => {
      this.post("/dashboard/control", {
        action: "skip"
      }).then(d => {
        res(d.success);
      }).catch(e => {
        // error occured
        this.notifications.addError("Error skipping song", e.message)
        res(false);
      });
    });
  }
  setVolume(vol) {
    if (typeof (vol || "nil") !== "number") throw new Error("Invalid volume. Number expected");
    return new Promise(res => {
      this.post("/dashboard/control", {
        action: "volume",
        data: Math.round(vol)
      }).then(d => {
        res(d.success);
      }).catch(e => {
        // error occured
        this.notifications.addError("Error setting volume", e.message);
        res(false);
      });
    });
  }
  play(query) {
    return new Promise((res) => {
      const notification = this.notifications.addInfo("Playlist", "Adding to playlist. Watch the current progress in the revolt channel (WIP)", 5000)
      this.post("/dashboard/queue", { action: "add", query: query }).then(async d => {
        notification.description = d.message;
        res(d.message);
      }).catch(e => {
        notification.removeNotif();
        this.notifications.addError("Playlist Error", e.message, 7000);
        res(e.message);
      });
    });
  }
  getServers() {
    return new Promise(res => {
      this.get("/servers").then(d => {
        return res(d);
      }).catch(e => {
        this.notifications.addError("Server List Error", e.message, 7000);
        return res(false);
      });
    });
  }
  getTextChannels(server) {
    return new Promise(res => {
      this.get("/server/" + server + "/channels").then(d => {
        res(d.data);
      }).catch(e => {
        this.notifications.addError("Server List Error", e.message, 7000);
        return res(false);
      });
    });
  }
}
