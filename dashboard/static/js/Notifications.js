class Notification extends HTMLElement {
  id = "n" + (Math.random() + 1).toString(36).substring(5);

  titleElem = null;
  descElem = null;
  closeBtn = null;

  _title = "title";
  _description = "description";
  _time = 0;

  removalTimeout = null;
  _manager = null;

  _type = null;
  constructor() {
    super();
  }

  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "/css/Notifications.css";
    shadow.appendChild(styles);

    const fa = document.createElement("link");
    fa.rel = "stylesheet";
    fa.href = "/assets/fontawesome/css/fontawesome.css";

    const faAll = document.createElement("link");
    faAll.rel = "stylesheet";
    faAll.href = "/assets/fontawesome/css/all.min.css";
    shadow.append(fa, faAll); // idk why both are added

    const t = document.createElement("h1");
    t.classList.add("notif-title");
    t.innerHTML = this._title;
    this.titleElem = t;
    shadow.appendChild(t);

    const desc = document.createElement("div");
    desc.classList.add("notif-content");
    desc.innerHTML = this._description;
    this.descElem = desc;
    shadow.append(desc);

    const closeBtn = document.createElement("div");
    closeBtn.classList.add("closebtn");
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark" onclick="this.getRootNode().host.removeNotif()"></i>'
    this.closeBtn = closeBtn;
    shadow.appendChild(closeBtn);
  }

  set type(type) {
    this.classList.add("notification", type);
    this._type = type;
  }

  get nTitle() {
    return this._title;
  }
  set nTitle(t) {
    this.resetTimer();
    this.titleElem.innerHTML = t;
    this._title = t;
  }
  get description() {
    return this._description;
  }
  set description(d) {
    this.resetTimer();
    this.descElem.innerHTML = d;
    this._description = d;
  }
  get time() {
    return this._time;
  }
  set time(t) {
    this._time = t;
    this.resetTimer();
  }
  get manager() {
    return this._manager;
  }
  set manager(m) {
    this._manager = m;
  }

  removeNotif() {
    this.manager.remove(this, true);
    setTimeout(() => {
      this.remove();
    }, 100);
    this.style.transform = "scale(0.7)";
  }

  resetTimer() {
    if (this.removalTimeout) clearTimeout(this.removalTimeout);
    this.removalTimeout = setTimeout(() => {
      this.removeNotif();
    }, this.time);
  }
}

customElements.define("remix-notification", Notification);

export default class NotificationManager {
  div = document.createElement("div");
  shadow = this.div.attachShadow({ mode: "open" });

  con = null;

  notifications = [];
  constructor(parent=null) {
    (parent || document.body).prepend(this.div);

    this.div.style = "display: block; position: fixed; z-index: 1000; top: 0; right: 0;"

    const shadow = this.shadow;

    const styles = document.createElement("link"); // TODO: remove legacy issues
    styles.rel = "stylesheet";
    styles.href = "/css/Notifications.css";
    shadow.appendChild(styles);

    const con = document.createElement("div");
    con.style = "align-items: center; padding: 1rem; max-height: 100vh; display: flex; flex-direction: column; gap: 1rem";
    this.con = con;
    shadow.append(con);
  }

  remove(el, byNotif=false) {
    const idx = this.notifications.find(e => e.id === el.id);
    this.notifications.splice(idx, 1);
    if (!byNotif) el.removeNotif();
  }

  add(title, description, time=5000, type="info") {
    const notif = document.createElement("remix-notification");
    this.con.append(notif);
    notif.manager = this;
    notif.time = time;
    notif.type = type;
    notif.nTitle = title;
    notif.description = description;
    notif.resetTimer();
    this.notifications.push(notif);
    return notif;
  }
  addInfo(title, description, time=5000) {
    return this.add(title, description, time, "info");
  }
  addError(title, description, time=5000) {
    return this.add(title, description, time, "error");
  }
}

export { NotificationManager };
