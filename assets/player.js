(() => {
  /* ------------------------------------------------------------------
   * Video player. A "video" link (data-video="<paper id>") opens a dialog
   * with that paper's videos: one option per video (SV1, SV2, ...), a player
   * of the same size for every video, a caption and a download link. The list lives in <script id="video-data">. Without
   * JavaScript (or <dialog>) the link simply opens the first video file.
   * #video-<paper id>[-<n>] opens a paper's n-th video directly.
   * ------------------------------------------------------------------ */
  const dataEl = document.getElementById("video-data");
  const dialog = document.querySelector(".player");
  if (!dataEl || !dialog || typeof dialog.showModal !== "function") return;

  const library = JSON.parse(dataEl.textContent);
  const titleEl = dialog.querySelector(".player-title");
  const tabs = dialog.querySelector(".player-tabs");
  const video = dialog.querySelector(".player-video");
  const caption = dialog.querySelector(".player-caption");
  const download = dialog.querySelector(".player-download");
  const credit = dialog.querySelector(".player-credit");
  let current = null;
  let returnHash = "";
  let openedAt = 0;

  function setHash(hash) {
    try {
      history.replaceState(null, "", hash || location.pathname + location.search);
    } catch (err) {
      /* some embedded viewers refuse history changes */
    }
  }

  function select(index, { autoplay = true, focus = false } = {}) {
    const item = library[current].videos[index];
    [...tabs.children].forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      if (i === index) {
        if (focus) tab.focus();
        tab.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });
    video.poster = item.poster || "";
    video.src = item.src;
    caption.textContent = item.title;
    download.href = item.src;
    download.setAttribute("download", item.src.split("/").pop());
    download.textContent = `Download SV${index + 1} (${item.size})`;
    if (autoplay) video.play().catch(() => {});
    setHash(`#video-${current}` + (index ? `-${index + 1}` : ""));
  }

  function open(id, index = 0, options = {}) {
    const paper = library[id];
    if (!paper) return;
    const list = paper.videos;
    if (!dialog.open) returnHash = location.hash.startsWith("#video-") ? "" : location.hash;
    current = id;
    titleEl.textContent = paper.title;
    // Source, copyright and licence for the paper's videos.
    const parts = [document.createTextNode(paper.credit || "")];
    if (paper.link) parts.push(" ", Object.assign(document.createElement("a"), { href: paper.link, textContent: paper.link.replace(/^https:\/\/(doi\.org\/)?/, "") }));
    if (paper.license) parts.push(" · ", Object.assign(document.createElement("a"), { href: paper.license, textContent: "licence" }));
    credit.replaceChildren(...parts);
    credit.hidden = !paper.credit;
    tabs.replaceChildren(
      ...list.map((item, i) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.setAttribute("role", "tab");
        tab.textContent = `SV${i + 1}`;
        tab.title = item.title;
        tab.addEventListener("click", () => select(i));
        return tab;
      }),
    );
    if (!dialog.open) {
      dialog.showModal();
      openedAt = Date.now();
    }
    select(Math.min(Math.max(index, 0), list.length - 1), options);
  }

  // Arrow keys move between tabs.
  tabs.addEventListener("keydown", (ev) => {
    const n = tabs.children.length;
    const i = [...tabs.children].indexOf(document.activeElement);
    if (i < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(ev.key)) return;
    ev.preventDefault();
    const next = ev.key === "Home" ? 0 : ev.key === "End" ? n - 1 : (i + (ev.key === "ArrowRight" ? 1 : n - 1)) % n;
    select(next, { focus: true });
  });

  document.addEventListener("click", (ev) => {
    const link = ev.target.closest("a[data-video]");
    if (!link || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    open(link.dataset.video);
  });
  dialog.querySelector(".player-close").addEventListener("click", () => dialog.close());
  // A click on the backdrop (outside the dialog's box) closes it; the second click of a
  // double-click on the "video" link is ignored so it does not close what it just opened.
  dialog.addEventListener("click", (ev) => {
    if (ev.target !== dialog || Date.now() - openedAt < 500) return;
    const r = dialog.getBoundingClientRect();
    const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
  dialog.addEventListener("close", () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    current = null;
    setHash(returnHash);
  });

  function fromHash() {
    const m = location.hash.match(/^#video-(.+)$/);
    if (!m) return;
    const key = decodeURIComponent(m[1]);
    if (library[key]) return open(key, 0, { autoplay: false });
    const n = key.match(/^(.+)-(\d+)$/);
    if (n && library[n[1]]) open(n[1], Number(n[2]) - 1, { autoplay: false });
  }
  window.addEventListener("hashchange", fromHash);
  fromHash();
})();
