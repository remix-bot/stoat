import Modal from "/js/Modal.js";

class TextChannel extends HTMLElement {
  css = null;

  i = null;
  li = null;

  constructor() {
    super();
  }

  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "/css/ChannelSelector.css";
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
    if (i.icon) {
      this.li.style.listStyle = "none";
      this.css.sheet.insertRule("li[itemid='" + i.id + "']::before {content:''; display: inline-block; position: relative; top: 0.4rem; background-image:url(" + i.icon + "); background-size: cover; aspect-ratio: 1/1; height: 1.5rem; margin-right: 0.2rem; margin-left: 0.2rem; padding: 0 }");
    }
    this.li.append(i.name);
    this.li.onclick = () => {
      // TODO: implement initJoin();
    }
    this.li.setAttribute("itemId", i.id);
  }

  get channel() { return this.i }
  set channel(c) {
    this.i = c;
    if (!this.isConnected) return;
    this.#updateChannel();
  }

  setSelected(bool) {
    return (bool) ?
        this.li.classList.add("selected")
      : this.li.classList.remove("selected");
  }
}

customElements.define("remix-text-channel", TextChannel);

export default class ChannelSelector extends Modal {
  list = null;
  cBtn = null;

  selected = null;

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();

    const shadow = this.shadowRoot;

    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "/css/ChannelSelector.css";
    shadow.prepend(styles);

    const con = this.con; // inherited from Modal

    const h1 = document.createElement("h1");
    h1.innerText = "Text Channel Selection";
    con.append(h1);

    const closeBtn = document.createElement("a");
    closeBtn.href = "javascript:void(0)";
    closeBtn.addEventListener("click", () => {
      this.hide();
    });
    closeBtn.innerText = "X";
    con.append(closeBtn);

    const p = document.createElement("p");
    p.innerText = "Please select a text channel. Messages about the player, like song announcements, are going to be sent in there.";
    con.append(p);
    con.append(document.createElement("br"));

    const list = document.createElement("ul");
    list.style.margin = "0";
    list.style.marginLeft = "1.3rem";

    list.style.listStyleType = "none";
    this.list = list;
    con.append(list);
    con.append(document.createElement("br"));

    const confirmBtn = document.createElement("button");
    confirmBtn.id = "confirm";
    confirmBtn.classList.add("button");
    confirmBtn.disabled = true;
    confirmBtn.addEventListener("click", () => {

    });
    confirmBtn.innerText = "Join";
    this.cBtn = confirmBtn;
    con.append(confirmBtn);
  }

  createListItem(c) {
    const i = document.createElement("remix-text-channel");
    i.channel = c;
    return i;
  }

  select(c) {
    this.selected?.setSelected(false);
    this.selected = c;
    c.setSelected(true);
    console.log(c);
  }

  selectChannel(server) {
    return new Promise(res => {
      this.showChannels(server);

    });
  }

  showChannels(server) {
    if (!this.isConnected) throw new Error("Cannot select channel before initialisation");

    this.cBtn.disabled = true;
    this.show();

    this.list.replaceChildren();

    const channelsWCat = server.categories.map(c => c.channels).flat(1);
    server.channels.filter(
      c =>
        c.type === "TextChannel"
        && !channelsWCat.includes(c.id)
      ).forEach(c => {

      const i = this.createListItem(c);
      i.addEventListener("click", () => {
        this.select(i);
      });
      this.list.append(i);
    });

    server.categories.forEach(cat => {
      if (cat.channels.length === 0) return;
      const catEl = document.createElement("li");
      const title = document.createElement("div");
      title.innerText = cat.title;
      title.display = "inline";
      title.classList.add("category");
      catEl.append(title);

      const list = document.createElement("ul");
      list.style.listStyle = "none";
      list.style.lineHeight = "1";
      list.append(...server.channels.filter(
        c =>
          c.type === "TextChannel"
          && cat.channels.includes(c.id)
        ).map(c => {
          const i = this.createListItem(c);
          i.style.paddingLeft = "0.4rem";
          i.addEventListener("click", () => {
            this.select(i);
          });
          return i;
        }));
        catEl.appendChild(list);
        this.list.append(catEl);
    });
  }
}

customElements.define("remix-channel-selector", ChannelSelector);
