(() => {
  /* ------------------------------------------------------------------
   * Photo album. The photos listed in .album-source are dealt into sets;
   * each set is laid out on an 8 × 6 grid by one of the templates below
   * (one letter = one photo), and every tile gets the photo whose shape is
   * closest to its own, so little is cropped. A new set fades in every few
   * seconds; the slider, the arrows and swipes move between sets.
   * The deal is reshuffled on every visit.
   * ------------------------------------------------------------------ */
  const album = document.querySelector(".album");
  if (!album) return;
  const source = album.querySelector(".album-source");
  const stage = album.querySelector(".album-stage");
  const controls = album.querySelector(".album-controls");
  const slider = controls.querySelector(".album-slider");
  const count = controls.querySelector(".album-count");
  const playButton = controls.querySelector(".album-play");
  const box = document.querySelector(".lightbox");
  const boxImg = box && box.querySelector("img");
  const interval = Number(album.dataset.interval) || 8000;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");

  const photos = [...source.querySelectorAll(".photo")].map((el) => ({
    el,
    ar: Number(el.dataset.w) / Number(el.dataset.h) || 1,
  }));
  if (!photos.length) return;

  const COLS = 8;
  const TEMPLATES = [
    ["AAABBBBB", "AAABBBBB", "AAABBBBB", "AAABBBBB", "CCCDDEEE", "CCCDDEEE"],
    ["AABBBCCC", "AABBBCCC", "DDDEEGGG", "DDDEEGGG", "DDDFFGGG", "DDDFFGGG"],
    ["AAABBBCC", "AAABBBCC", "AAABBBDD", "AAABBBDD", "EEEEFFFF", "EEEEFFFF"],
    ["AAAABBBB", "AAAABBBB", "AAAABBBB", "CCDDDDEE", "CCDDDDEE", "CCDDDDEE"],
    ["AAAAABBB", "AAAAABBB", "AAAAABBB", "CCDDEEEE", "CCDDEEEE", "CCDDEEEE"],
  ];

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // Template rows -> tiles with grid placement and shape (cells are square).
  function tilesOf(rows) {
    const boxes = new Map();
    rows.forEach((line, r) =>
      [...line].forEach((ch, c) => {
        const b = boxes.get(ch) || { r0: r, c0: c, r1: r, c1: c };
        b.r1 = Math.max(b.r1, r);
        b.c0 = Math.min(b.c0, c);
        b.c1 = Math.max(b.c1, c);
        boxes.set(ch, b);
      }),
    );
    return [...boxes.values()].map((b) => {
      const w = b.c1 - b.c0 + 1;
      const h = b.r1 - b.r0 + 1;
      return { col: `${b.c0 + 1} / span ${w}`, row: `${b.r0 + 1} / span ${h}`, w, ar: w / h };
    });
  }

  function deal() {
    const layouts = shuffle(TEMPLATES.slice()).map((rows) =>
      tilesOf(Math.random() < 0.5 ? rows : rows.map((line) => [...line].reverse().join(""))),
    );
    const sets = [];
    for (let slots = 0, i = 0; slots < photos.length; i++) {
      const set = layouts[i % layouts.length].map((tile) => ({ ...tile }));
      sets.push(set);
      slots += set.length;
    }
    // Fill the most elongated tiles first, each with the closest-shaped photo left;
    // once every photo is placed, spare tiles reuse photos not already in that set.
    const misfit = (photo, tile) => Math.abs(Math.log(photo.ar / tile.ar));
    const unused = new Set(shuffle(photos.slice()));
    const tiles = shuffle(sets.flatMap((set) => set.map((tile) => ({ tile, set }))));
    tiles.sort((a, b) => Math.abs(Math.log(b.tile.ar)) - Math.abs(Math.log(a.tile.ar)));
    tiles.forEach(({ tile, set }) => {
      let pool = [...unused];
      if (!pool.length) pool = photos.filter((p) => !set.some((t) => t.photo === p));
      if (!pool.length) pool = photos;
      tile.photo = pool.reduce((best, p) => (misfit(p, tile) < misfit(best, tile) ? p : best));
      unused.delete(tile.photo);
    });
    return sets;
  }

  function render(set) {
    const el = document.createElement("div");
    el.className = "album-set";
    set.forEach(({ photo, col, row, w }) => {
      const tile = photo.el.cloneNode(true);
      tile.style.setProperty("--col", col);
      tile.style.setProperty("--row", row);
      tile.style.setProperty("--ar", String(photo.ar));
      const img = tile.querySelector("img");
      img.loading = "eager";
      img.sizes = `(max-width: 560px) 50vw, ${Math.ceil((w / COLS) * 960)}px`;
      el.append(tile);
    });
    return el;
  }

  const sets = deal();
  const built = [];
  const setEl = (i) => built[i] || (built[i] = render(sets[i]));
  let index = -1;
  let playing = !still.matches;
  let timer = 0;

  function ready(el) {
    const imgs = [...el.querySelectorAll("img")];
    return Promise.race([
      Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : null))),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }

  function show(i, { instant = false } = {}) {
    const n = (i + sets.length) % sets.length;
    if (n === index) return schedule();
    index = n;
    slider.value = String(index + 1);
    count.textContent = `${index + 1} / ${sets.length}`;
    const next = setEl(index);
    clearTimeout(timer);
    ready(next).then(() => {
      if (setEl(index) !== next) return; // superseded by a later move
      const old = [...stage.children].filter((el) => el !== next);
      next.classList.remove("is-leaving");
      if (instant || still.matches || !old.length) {
        stage.replaceChildren(next);
      } else {
        next.classList.add("is-entering");
        stage.append(next);
        void next.offsetWidth; // start the fade from transparent
        next.classList.remove("is-entering");
        old.forEach((el) => {
          el.classList.add("is-leaving");
          setTimeout(() => el.classList.contains("is-leaving") && el.remove(), 800);
        });
      }
      if (sets.length > 1) setEl((index + 1) % sets.length); // start loading the next set
      schedule();
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (playing && sets.length > 1 && !document.hidden && !(box && box.open)) {
      timer = setTimeout(() => show(index + 1), interval);
    }
  }

  function setPlaying(on) {
    playing = on;
    playButton.textContent = on ? "Pause" : "Play";
    schedule();
  }

  // Controls
  slider.max = String(sets.length);
  controls.hidden = sets.length < 2;
  setPlaying(playing);
  controls.addEventListener("click", (ev) => {
    const step = ev.target.closest("[data-step]");
    if (step) show(index + Number(step.dataset.step));
    if (ev.target.closest(".album-play")) setPlaying(!playing);
  });
  slider.addEventListener("input", () => show(Number(slider.value) - 1));
  document.addEventListener("visibilitychange", schedule);

  // Swipe between sets on touch screens.
  let startX = null;
  let swiped = false;
  stage.addEventListener("pointerdown", (ev) => {
    swiped = false;
    startX = ev.pointerType === "mouse" ? null : ev.clientX;
  });
  stage.addEventListener("pointerup", (ev) => {
    if (startX === null) return;
    const dx = ev.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) {
      swiped = true;
      show(index + (dx < 0 ? 1 : -1));
    }
  });
  stage.addEventListener("pointercancel", () => (startX = null));

  // Open a photo large; without <dialog> support the link opens the image itself.
  stage.addEventListener("click", (ev) => {
    const link = ev.target.closest("a.photo");
    if (!link) return;
    if (swiped) {
      ev.preventDefault();
      swiped = false;
      return;
    }
    if (!box || typeof box.showModal !== "function") return;
    ev.preventDefault();
    boxImg.src = link.href;
    boxImg.alt = link.querySelector("img").alt;
    box.showModal();
    schedule();
  });
  if (box) {
    box.addEventListener("click", () => box.close());
    box.addEventListener("close", () => {
      boxImg.removeAttribute("src");
      schedule();
    });
  }

  show(0, { instant: true });
})();
