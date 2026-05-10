export default class Modal extends HTMLElement {
  visible = false;

  con = null;
  constructor() {
    super();
  }

  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    this.style.backdropFilter = "blur(2px)";
    this.style.display = (this.visible) ? "flex" : "none";
    this.style.position = "fixed";
    this.style.top = "0";
    this.style.left = "0";
    this.style.zIndex = "100";
    this.style.width = "100%";
    this.style.height = "100%";
    this.style.alignItems = "center";
    this.style.justifyContent = "center";

    const clickDetector = document.createElement("div");
    clickDetector.style = "width: 100%; height: 100%; display: flex; justify-content: center; align-items: center";
    shadow.append(clickDetector);

    const con = document.createElement("div");
    con.style = "display: flex; flex-direction: column; position: relative; padding: 1.5rem; background-color: rgb(31, 41, 55); border-radius: 5px; box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.4); color: white";
    con.classList.add("remix-modal-content")
    this.con = con;
    clickDetector.append(con);

    this.shadowRoot.addEventListener("click", (e) => {
      if (e.target.matches(".remix-modal-content *, .remix-modal-content")) return;
      this.hide();
    });
  }

  hide() { // TODO: implement a nice animation
    this.style.display = "none";
    this.visible = false;
  }
  show() {
    this.style.display = "flex";
    this.visible = true;
  }

  toggle() {
    return (this.visible) ? this.hide() : this.show();
  }
}

customElements.define("remix-modal", Modal);
