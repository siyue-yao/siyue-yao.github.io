(() => {
  /* ------------------------------------------------------------------
   * Video previews: load and play only while on screen; never autoplay
   * for people who prefer reduced motion (they see the poster frame).
   * ------------------------------------------------------------------ */
  const previews = [...document.querySelectorAll("video.preview")];
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const visible = new Set();
  let observer = null;

  function sync() {
    previews.forEach((video) => {
      if (still.matches || document.hidden || !video.isConnected || !visible.has(video)) {
        video.pause();
      } else {
        if (!video.getAttribute("src")) video.src = video.dataset.src;
        video.play().catch(() => {});
      }
    });
  }

  function refreshPreviews() {
    if (!observer) return;
    visible.clear();
    previews.forEach((video) => {
      observer.unobserve(video);
      observer.observe(video);
    });
    sync();
  }

  if (previews.length && "IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
        sync();
      },
      { threshold: 0.2 },
    );
    previews.forEach((video) => observer.observe(video));
    still.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
  }

  /* ------------------------------------------------------------------
   * Research topics: a row of text filters, a second row for the active
   * topic's sub-topics, one overview per topic, and the paper list
   * (grouped by sub-topic when a whole topic is shown).
   * Papers declare topics with data-topics="parent/sub ...".
   * ------------------------------------------------------------------ */
  const filters = document.querySelector(".filters");
  const list = document.querySelector(".pubs");
  const section = document.getElementById("research");
  if (!filters || !list) return;

  const items = [...list.querySelectorAll(".pub")];
  const topicsOf = new Map(
    items.map((el) => [el, (el.dataset.topics || "").split(/\s+/).filter(Boolean)]),
  );
  const topButtons = [...filters.querySelectorAll("button[data-topic]")];
  const subRows = [...document.querySelectorAll(".subfilters")];
  const subButtons = subRows.flatMap((row) => [...row.querySelectorAll("button[data-topic]")]);
  const overviews = [...document.querySelectorAll(".overview[data-topic]")];
  const valid = new Set([...topButtons, ...subButtons].map((b) => b.dataset.topic));
  const fallback = valid.has(filters.dataset.default)
    ? filters.dataset.default
    : topButtons[0].dataset.topic;

  const subsOf = {};
  subRows.forEach((row) => {
    subsOf[row.dataset.parent] = [...row.querySelectorAll("button[data-topic]")];
  });

  const matches = (el, topic) =>
    topicsOf.get(el).some((t) => t === topic || t.startsWith(topic + "/"));

  function groupHeading(btn, count) {
    const h = document.createElement("h3");
    h.className = "group-heading";
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.go = btn.dataset.topic;
    b.textContent = btn.dataset.label;
    h.append(b);
    if (!count && btn.dataset.ongoing) {
      const tag = document.createElement("span");
      tag.className = "ongoing";
      tag.textContent = "ongoing";
      h.append(tag);
    }
    return h;
  }

  let current = null;

  function select(topic, { updateHash = true, animate = true, scroll = false } = {}) {
    if (!valid.has(topic)) topic = fallback;
    const parent = topic.split("/")[0];

    topButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.topic === parent)));
    subRows.forEach((row) => (row.hidden = row.dataset.parent !== parent));
    subButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.topic === topic)));
    overviews.forEach((o) => (o.hidden = o.dataset.topic !== topic));

    list.replaceChildren();
    if (topic === parent && subsOf[parent]) {
      const used = new Set();
      subsOf[parent].forEach((btn) => {
        const group = items.filter((el) => matches(el, btn.dataset.topic) && !used.has(el));
        list.append(groupHeading(btn, group.length));
        if (group.length) {
          group.forEach((el) => {
            used.add(el);
            list.append(el);
          });
        } else {
          const ov = overviews.find((o) => o.dataset.topic === btn.dataset.topic);
          const note = document.createElement("p");
          note.className = "group-note";
          note.textContent = ov ? ov.textContent : "Coming soon.";
          list.append(note);
        }
      });
    } else {
      items.filter((el) => matches(el, topic)).forEach((el) => list.append(el));
    }

    if (animate) {
      section.classList.add("is-switching");
      list.classList.remove("is-entering");
      void list.offsetWidth; // restart the fade
      list.classList.add("is-entering");
    }
    refreshPreviews();

    if (updateHash) {
      const hash = "#research-" + topic.replace("/", "-");
      try {
        if (location.hash !== hash) history.replaceState(null, "", hash);
      } catch (err) {
        /* some embedded viewers refuse history changes; the page still works */
      }
    }
    if (scroll && filters.getBoundingClientRect().top < 60) {
      filters.scrollIntoView({ block: "start" });
    }
    current = topic;
  }

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-topic], button[data-go]");
    if (!btn) return;
    if (btn.dataset.go) {
      select(btn.dataset.go, { scroll: true });
    } else if (subButtons.includes(btn)) {
      // Clicking the active sub-topic again returns to the whole topic.
      const t = btn.dataset.topic;
      select(t === current ? t.split("/")[0] : t);
    } else if (topButtons.includes(btn)) {
      select(btn.dataset.topic);
    }
  });

  // Links like #research-whiskers or #research-whiskers-underwater open that topic.
  const fromHash = () => {
    const m = location.hash.match(/^#research[-./]([a-z]+)(?:[-./]([a-z]+))?$/);
    if (!m) return null;
    const t = m[2] ? `${m[1]}/${m[2]}` : m[1];
    return valid.has(t) ? t : null;
  };

  window.addEventListener("hashchange", () => {
    const t = fromHash();
    if (t && t !== current) {
      select(t, { updateHash: false });
      section.scrollIntoView();
    }
  });

  const initial = fromHash();
  select(initial || fallback, { updateHash: false, animate: false });
  if (initial) requestAnimationFrame(() => section.scrollIntoView());
})();
