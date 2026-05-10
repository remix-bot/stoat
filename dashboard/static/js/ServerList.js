import ChannelSelector from "/js/ChannelSelector.js";

class ChannelItem extends HTMLElement {
  css = null;

  i = null;
  li = null;

  channelId = null;
  serverId = null;

  constructor() {
    super();
  }

  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "/css/ServerList.css";
    shadow.append(styles);

    const css = document.createElement("style");
    this.css = css;
    shadow.append(css);

    const li = document.createElement("li");
    li.classList.add("channelItem");
    this.li = li;
    shadow.append(li);

    if (!this.i) return;
    this.#updateChannel();
  }
  #updateChannel() {
    const i = this.i;
    this.channelId = i.id;
    this.serverId = i.serverId;
    if (i.icon) {
      this.li.style.listStyle = "none";
      this.css.sheet.insertRule("li[itemid='" + i.id + "']::before {content:''; display: inline-block; position: relative; top: 0.4rem; background-image:url(" + i.icon + "); background-size: cover; aspect-ratio: 1/1; height: 1.5rem; margin-right: 0.2rem; margin-left: 0.2rem; padding: 0 }");
    }
    this.li.append(i.name);
    this.li.onclick = () => {
      this.dispatchEvent(new CustomEvent("select", { composed: true, detail: this }));
    }
    this.li.setAttribute("itemId", i.id);
  }

  get channel() { return this.i }
  set channel(c) {
    this.i = c;
    if (!this.isConnected) return;
    this.#updateChannel();
  }
}

class ServerItem extends HTMLElement {
  i = null;
  li = null;
  css = null;
  list = null;
  caret = null;

  state = "collapsed";
  serverId = null;

  constructor() {
    super();
  }

  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "/css/ServerList.css";
    shadow.append(styles);

    const css = document.createElement("style");
    this.css = css;
    shadow.append(css);

    const li = document.createElement("li");
    this.li = li;
    shadow.append(li);

    const caret = document.createElement("span");
    caret.classList.add("caret");
    this.caret = caret;
    li.append(caret);

    const list = document.createElement("ul");
    list.classList.add("nested");
    list.style.listStyle = "inside";
    this.list = list;
    li.append(list);

    if (!this.i) return;
    this.#updateServer();
  }
  #updateServer() {
    this.serverId = this.i.id;
    if (this.i.icon) {
      this.li.style.listStyle = "none";
      this.css.sheet.insertRule("li[itemid='" + this.i.id + "']::before {content:''; display: inline-block; position: relative; top: 0.4rem; background-image:url(" + this.i.icon + "); background-size: cover; aspect-ratio: 1/1; height: 1.5rem; margin-right: 0.2rem; margin-left: 0.2rem; padding: 0;}");
    }
    this.li.insertBefore(document.createTextNode(this.i.name), this.list);
    this.li.setAttribute("itemId", this.i.id);

    this.caret.onclick = () => {
      this.toggleChannels();
    }

    if (this.i.voiceChannels.length === 0) return;
    this.#createChannelList();
  }
  #createChannelList() {
    const list = this.list;
    this.i.voiceChannels.forEach(c => {
      const channel = document.createElement("remix-channel-item");
      channel.channel = {...c, serverId: this.serverId};
      list.append(channel);
    });
  }

  toggleChannels() {
    const state = this.state;
    this.list.classList.toggle("active");
    this.caret.classList.toggle("caret-down");
    if (state === "collapsed") this.fetchVoice();
    this.state = (state === "collapsed") ? "expanded" : "collapsed";
  }

  fetchVoice() {
    // TODO: fetch users
  }

  set server(s) {
    this.i = s;
    if (!this.isConnected) return;
    this.#updateServer();
  }
  get server() {
    return this.i;
  }
}

class ServerList extends HTMLElement {
  ul = null;
  cSelect = null;

  api = window.remix?.api || null;

  constructor() {
    super();

    this.addEventListener("select", async ({ detail: i }) => {
      const s = await this.api.getTextChannels(i.serverId);
      const channel = i.channelId;
      console.log(s);

      if (!s) return;

      const c = await this.cSelect.selectChannel(s);
    });
  }

  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "/css/ServerList.css";
    shadow.append(styles);

    const con = document.createElement("div");
    con.classList.add("con");
    shadow.append(con);

    const h1 = document.createElement("h1");
    h1.innerText = "Your Servers";
    const br = document.createElement("br");
    const ul = document.createElement("ul");
    ul.innerText = "Loading...";
    this.ul = ul;
    con.append(h1, br, ul);

    const channelSelection = document.createElement("remix-channel-selector");
    this.cSelect = channelSelection;
    con.append(channelSelection);
  }

  async load() {
    this.api ||= window.remix?.api || null;
    if (!this.api) throw "No API wrapper passed";

    const servers = await this.api.getServers();
    this.ul.replaceChildren();
    if (!servers) return;
    servers.forEach(s => {
      const server = document.createElement("remix-server-item");
      server.server = s;
      this.ul.appendChild(server);
    });
  }
}

customElements.define("remix-server-list", ServerList);
customElements.define("remix-server-item", ServerItem);
customElements.define("remix-channel-item", ChannelItem);
