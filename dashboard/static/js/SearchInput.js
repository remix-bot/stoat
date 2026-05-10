class SearchInput extends HTMLElement {
  completionsElem = null;
  inputElem = null;

  runningRequest = false;

  constructor() {
    super();
  }
  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });

    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "/css/SearchInput.css";
    shadow.append(styles);

    const c = document.createElement("div"); // container
    c.style = "position: relative; display: flex; flex-direction: column";
    c.classList.add("search-container");
    shadow.append(c);

    const input = document.createElement("input");
    input.type = "text";
    input.name = "search";
    input.placeholder = "Search or paste a link";
    input.autocomplete = "off";
    input.addEventListener("keyup", (e) => { this.#keyUp(e) });
    input.addEventListener("blur", (e) => {
      // TODO: register clicks outside of input --> blurring
      //this.#reset(); doesn't work because blocks accepting suggestions
    });
    this.inputElem = input;
    c.append(input);

    const completionCon = document.createElement("div");
    completionCon.style = "position: relative; align-self: center; width: 100%";
    c.append(completionCon);

    const completions = document.createElement("ul");
    this.completionsElem = completions;
    completionCon.appendChild(completions);
  }

  #isValidUrl(str) {
    var pattern = new RegExp('^(https?:\\/\\/)?'+ // protocol
      '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
      '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
      '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
      '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
      '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
    return !!pattern.test(str);
  }

  #dispatchSearch(string, isUrl) {
    const data = {
      raw: string,
      url: (isUrl === undefined) ? this.#isValidUrl(string) : isUrl
    }

    const event = new CustomEvent("result", {
      detail: data,
      composed: true
    });
    this.dispatchEvent(event);
  }
  #reset() {
    this.completionsElem.style.display = "none";
    // TODO: consider the following:
    //this.inputElem.value = "";
    //this.inputElem.blur();
  }

  #getSuggestions(query) {
    return new Promise(res => {
      const script = document.createElement("script");
      script.async = true;
      const cname = "suggestion" + (Math.random() + "").replaceAll(".", "");
      window[cname] = (data) => {
        res(data[1]);
        script.remove();
        delete window[cname];
      }
      script.src = "https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=" + encodeURIComponent(query) + "&callback=" + cname; // "hl" parameter for locale
      this.shadowRoot.appendChild(script);
    });
  }

  #createSuggestionItem(content) {
    // TODO: match width to input width
    const li = document.createElement("li");
    li.innerText = content;
    li.setAttribute("suggestion", content);
    li.classList.add("suggestion-li");
    li.addEventListener("click", () => {
      this.#dispatchSearch(content, false);
    });
    return li;
  }

  async #keyUp(e) {
    if (e.code === "Enter") {
      e.preventDefault();
      if (e.target.value === "" && e.target.value !== "0") return;
      this.#dispatchSearch(e.target.value);
      this.#reset();
      return;
    }
    const i = this.inputElem;
    if (i.value === "") this.#reset();
    if (this.runningRequest) return;
    this.runningRequest = true;

    const data = await this.#getSuggestions(i.value);
    this.completionsElem.innerHTML = "";
    if (data.length > 0) this.completionsElem.style.display = "block";
    data.forEach(suggestion => {
      this.completionsElem.append(this.#createSuggestionItem(suggestion));
    });
    this.runningRequest = false;
  }
}

customElements.define("search-input", SearchInput);
