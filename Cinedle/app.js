(() => {
  "use strict";

  const LEVELS = ["easy", "medium", "hard", "impossible"];
  const MAX_TRIES = { quotes: 5, stills: 6 };
  const STORE = "cinedle:";
  const $ = (s) => document.querySelector(s);

  // ---------- storage helpers (never throw) ----------
  const load = (k, d) => { try { const v = localStorage.getItem(STORE + k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch {} };

  // ---------- text + ids ----------
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const idOf = (t, y) => norm(t) + "|" + y;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- movie list for the search box ----------
  const MOVIES = (() => {
    const map = new Map();
    const add = (t, y) => { const id = idOf(t, y); if (!map.has(id)) map.set(id, { t, y, id, n: norm(t), nt: norm(t).replace(/^(the|a|an) /, "") }); };
    for (const lv of LEVELS) {
      (window.QUOTES[lv] || []).forEach((m) => add(m.t, m.y));
      (window.STILLS[lv] || []).forEach((m) => add(m.t, m.y));
    }
    (window.EXTRA_MOVIES || []).forEach(([t, y]) => add(t, y));
    return [...map.values()].sort((a, b) => a.t.localeCompare(b.t));
  })();

  function searchMovies(q) {
    const nq = norm(q);
    if (!nq) return [];
    const out = [];
    for (const m of MOVIES) {
      let score = -1;
      if (m.n.startsWith(nq) || m.nt.startsWith(nq)) score = 3;
      else if ((" " + m.n).includes(" " + nq)) score = 2;
      else if (m.n.includes(nq)) score = 1;
      else if (String(m.y) === nq) score = 0;
      if (score >= 0) out.push([score, m]);
    }
    out.sort((a, b) => b[0] - a[0] || a[1].t.length - b[1].t.length);
    return out.slice(0, 8).map((x) => x[1]);
  }

  // ---------- deterministic randomness for the daily puzzle ----------
  function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, rand) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dayNumber = () => { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };

  // Stills only uses movies that have images (hand-picked or in stills-images.js).
  const IMAGE_BASE = "https://image.tmdb.org/t/p/";
  const builtImages = window.STILL_IMAGES || {};
  function puzzlesFor(mode, level) {
    if (mode === "quotes") return window.QUOTES[level];
    return window.STILLS[level].filter((m) => (m.stills && m.stills.length) || builtImages[idOf(m.t, m.y)]);
  }

  function pickPuzzle(list, mode, level, type) {
    if (type === "daily") {
      const order = shuffle(list.map((_, i) => i), rng(hash(`cinedle-${mode}-${level}`)));
      return order[dayNumber() % order.length];
    }
    const recentKey = `recent:${mode}:${level}`;
    const recent = load(recentKey, []);
    const pool = list.map((_, i) => i).filter((i) => !recent.includes(i));
    const idx = (pool.length ? pool : list.map((_, i) => i))[Math.floor(Math.random() * (pool.length || list.length))];
    save(recentKey, [idx, ...recent].slice(0, Math.floor(list.length * 0.7)));
    return idx;
  }

  // Returns { images: [hardest ... easiest], poster }
  function stillsFor(p) {
    if (p.stills && p.stills.length) return { images: p.stills.slice(), poster: p.poster || null };
    const b = builtImages[idOf(p.t, p.y)];
    return { images: b.images.map((f) => IMAGE_BASE + "w1280" + f), poster: b.poster ? IMAGE_BASE + "w342" + b.poster : null };
  }

  // ---------- app state ----------
  const prefs = load("prefs", { mode: "quotes", level: "easy", type: "daily" });
  let game = null; // { mode, level, type, idx, puzzle, guesses, done, won, stills, view }

  const els = {
    stage: $("#stage"), attempts: $("#attempts"), guesses: $("#guesses"), bar: $("#guessBar"),
    input: $("#guessInput"), sugg: $("#suggestions"), skip: $("#skipBtn"), submit: $("#submitBtn"),
    result: $("#result"), toast: $("#toast"),
  };

  const dailyKey = () => `daily:${prefs.mode}:${prefs.level}:${today()}`;

  function start(forceNew = false) {
    const { mode, level, type } = prefs;
    const list = puzzlesFor(mode, level);
    syncChrome();
    if (!list.length) { game = null; renderEmpty(); return; }
    const saved = type === "daily" ? load(dailyKey(), null) : null;
    const keep = type === "endless" && !forceNew && game && game.mode === mode && game.level === level && game.type === type && !game.done;
    const idx = saved && list[saved.idx] ? saved.idx : keep ? game.idx : pickPuzzle(list, mode, level, type);
    const puzzle = list[idx];
    const useSaved = saved && list[saved.idx];
    game = { mode, level, type, idx, puzzle, guesses: useSaved ? saved.guesses : [], done: useSaved ? saved.done : false, won: useSaved ? saved.won : false, stills: null, view: 0 };
    if (mode === "stills") {
      game.stills = stillsFor(puzzle);
      game.stills.images.forEach((src) => { const i = new Image(); i.src = src; });
    }
    render();
  }

  function renderEmpty() {
    els.stage.innerHTML = `<div class="setup"><h3>Stills are on the way</h3><p>No movie frames have been generated yet. Run the <b>Build Cinedle stills</b> GitHub Action (see the README) and they'll show up here.</p></div>`;
    els.attempts.innerHTML = ""; els.guesses.innerHTML = ""; els.bar.hidden = true; els.result.hidden = true;
  }

  function persist() {
    if (game.type === "daily") save(dailyKey(), { idx: game.idx, guesses: game.guesses, done: game.done, won: game.won });
  }

  // ---------- rendering ----------
  function syncChrome() {
    document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === prefs.mode));
    document.querySelectorAll(".level").forEach((b) => b.classList.toggle("active", b.dataset.level === prefs.level));
    document.querySelectorAll(".pt").forEach((b) => b.classList.toggle("active", b.dataset.type === prefs.type));
  }

  function render() {
    const g = game;
    const max = MAX_TRIES[g.mode];
    const used = g.guesses.length;

    // stage
    if (g.mode === "quotes") renderQuote(g);
    else renderStills(g);

    // attempt segments
    els.attempts.innerHTML = Array.from({ length: max }, (_, i) => {
      const r = g.guesses[i];
      const cls = r ? r.type : (i === used && !g.done ? "current" : "");
      return `<div class="seg ${cls}"></div>`;
    }).join("");

    // guess list
    els.guesses.innerHTML = g.guesses.map((r) => {
      if (r.type === "skip") return `<li class="skip"><span class="ico">–</span>Skipped</li>`;
      return `<li class="${r.type}"><span class="ico">${r.type === "right" ? "✓" : "✕"}</span>${esc(r.t)}<span class="yr">${r.y}</span></li>`;
    }).join("");

    els.bar.hidden = g.done;
    els.skip.textContent = used === max - 1 ? "Give up" : (g.mode === "stills" ? "Skip (next still)" : "Skip (+hint)");
    if (!g.done && document.activeElement !== els.input && window.matchMedia("(pointer: fine)").matches) els.input.focus();

    renderResult(g);
  }

  function renderQuote(g) {
    const p = g.puzzle;
    const revealed = g.done ? 4 : g.guesses.length;
    const hints = [
      ["Year", p.y],
      ["Said by", p.c],
      ["Played by", p.a],
      ["Title starts with", `"${p.t.replace(/^(The|A|An) /, "").charAt(0)}"`],
    ];
    els.stage.innerHTML = `
      <div class="quote-card">
        <p class="quote-text">${esc(p.q)}</p>
        <div class="hints">${hints.map(([k, v], i) => i < revealed
          ? `<span class="hint"><b>${k}</b>${esc(v)}</span>`
          : `<span class="hint locked">Hint ${i + 1}</span>`).join("")}</div>
      </div>`;
  }

  function renderStills(g) {
    const s = g.stills;
    const n = s.images.length;
    const unlocked = g.done ? n : Math.min(g.guesses.length + 1, n);
    if (g.view >= unlocked || g._lastUnlocked !== unlocked) g.view = unlocked - 1;
    g._lastUnlocked = unlocked;
    const zoom = g.done ? 1 : zoomFor(g.level, g.view);
    const r = rng(hash(g.puzzle.t + g.view));
    const origin = `${20 + Math.floor(r() * 60)}% ${20 + Math.floor(r() * 60)}%`;
    els.stage.innerHTML = `
      <div class="frame">
        <img src="${esc(s.images[g.view])}" alt="Movie still ${g.view + 1}" class="loading" style="transform:scale(${zoom});transform-origin:${origin}" />
        <span class="badge">${g.view + 1} / ${n}</span>
      </div>
      <div class="thumbs">${s.images.map((_, i) => `<button class="thumb ${i === g.view ? "on" : ""}" data-i="${i}" ${i < unlocked ? "" : "disabled"}>${i + 1}</button>`).join("")}</div>`;
    const img = els.stage.querySelector("img");
    const ready = () => img.classList.remove("loading");
    if (img.complete) ready(); else img.onload = ready;
    img.onerror = () => {
      // TMDB occasionally removes an image; drop it and show the next one.
      if (s.images.length > 1) { s.images.splice(g.view, 1); g._lastUnlocked = -1; renderStills(g); }
      else img.closest(".frame").insertAdjacentHTML("beforeend", `<div class="frame-msg">Image failed to load</div>`);
    };
    els.stage.querySelectorAll(".thumb").forEach((b) => b.onclick = () => { g.view = +b.dataset.i; g._lastUnlocked = unlocked; renderStills(g); });
  }

  // Harder levels crop in on the first frames so they give away less.
  function zoomFor(level, stage) {
    const table = { easy: [], medium: [], hard: [1.6, 1.3], impossible: [2.4, 1.9, 1.5, 1.2] };
    return table[level][stage] || 1;
  }

  function renderResult(g) {
    if (!g.done) { els.result.hidden = true; return; }
    const p = g.puzzle;
    const stats = load(`stats:${g.mode}:${g.level}`, { played: 0, won: 0, streak: 0, best: 0 });
    const poster = g.mode === "stills" && g.stills && g.stills.poster ? `<img class="poster" src="${esc(g.stills.poster)}" alt="${esc(p.t)} poster" />` : "";
    const sub = g.mode === "quotes" ? `${esc(p.c)} · ${esc(p.a)}` : (g.won ? `Solved on still ${g.guesses.length} of ${MAX_TRIES.stills}` : "Better luck next time");
    els.result.innerHTML = `
      <div class="verdict ${g.won ? "win" : "lose"}">${g.won ? (g.guesses.length === 1 ? "First try!" : "You got it") : "Out of tries"}</div>
      ${poster}
      <h2>${esc(p.t)} <span style="color:var(--muted);font-weight:400">(${p.y})</span></h2>
      <p class="sub">${sub}</p>
      <div class="stats">
        <div><b>${stats.played}</b><span>Played</span></div>
        <div><b>${stats.played ? Math.round((stats.won / stats.played) * 100) : 0}%</b><span>Win</span></div>
        <div><b>${stats.streak}</b><span>Streak</span></div>
        <div><b>${stats.best}</b><span>Best</span></div>
      </div>
      <div class="row">
        <button class="btn ghost" id="shareBtn">Share</button>
        <button class="btn primary" id="nextBtn">${g.type === "daily" ? "Play endless" : "Next movie"}</button>
      </div>
      ${g.type === "daily" ? `<div class="countdown" id="countdown"></div>` : ""}`;
    els.result.hidden = false;
    $("#shareBtn").onclick = share;
    $("#nextBtn").onclick = () => { prefs.type = "endless"; save("prefs", prefs); start(true); };
    tickCountdown();
  }

  function tickCountdown() {
    const el = $("#countdown");
    if (!el) return;
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const s = Math.floor((next - now) / 1000);
    el.textContent = `Next daily in ${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  setInterval(tickCountdown, 1000);

  // ---------- guessing ----------
  let selected = null;
  let hl = -1;
  let results = [];

  function guess(movie) {
    const g = game;
    if (g.done) return;
    if (movie && g.guesses.some((r) => r.id === movie.id)) { toast("Already guessed that one"); return; }
    const answer = idOf(g.puzzle.t, g.puzzle.y);
    if (!movie) g.guesses.push({ type: "skip" });
    else g.guesses.push({ type: movie.id === answer ? "right" : "wrong", t: movie.t, y: movie.y, id: movie.id });
    const last = g.guesses[g.guesses.length - 1];
    if (last.type === "right") finish(true);
    else if (g.guesses.length >= MAX_TRIES[g.mode]) finish(false);
    else if (last.type === "wrong") toast("Not quite");
    persist();
    clearInput();
    render();
  }

  function finish(won) {
    const g = game;
    g.done = true; g.won = won;
    const key = `stats:${g.mode}:${g.level}`;
    const st = load(key, { played: 0, won: 0, streak: 0, best: 0 });
    st.played++;
    if (won) { st.won++; st.streak++; st.best = Math.max(st.best, st.streak); } else st.streak = 0;
    save(key, st);
  }

  function share() {
    const g = game;
    const sq = g.guesses.map((r) => (r.type === "right" ? "🟩" : r.type === "skip" ? "⬜" : "🟥"));
    while (sq.length < MAX_TRIES[g.mode]) sq.push("⬛");
    const label = g.mode === "quotes" ? "Quotes" : "Stills";
    const lvl = g.level[0].toUpperCase() + g.level.slice(1);
    const text = `🎬 Cinedle ${label} · ${lvl}${g.type === "daily" ? " · " + today() : ""}\n${sq.join("")}\n${location.href.split("#")[0]}`;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast("Copied to clipboard"), () => prompt("Copy your result:", text));
  }

  // ---------- autocomplete ----------
  function clearInput() { els.input.value = ""; selected = null; results = []; hl = -1; els.sugg.innerHTML = ""; els.submit.disabled = true; }

  function showSuggestions() {
    const q = els.input.value;
    results = searchMovies(q);
    const exact = MOVIES.filter((m) => m.n === norm(q));
    selected = exact.length === 1 ? exact[0] : (selected && selected.t === q ? selected : null);
    hl = results.length ? 0 : -1;
    paintSuggestions(q);
    els.submit.disabled = !selected;
  }

  function paintSuggestions(q) {
    const nq = norm(q || els.input.value);
    els.sugg.innerHTML = results.map((m, i) => {
      let title = esc(m.t);
      const at = m.t.toLowerCase().indexOf((q || els.input.value).toLowerCase().trim());
      if (at >= 0 && nq) { const len = (q || els.input.value).trim().length; title = esc(m.t.slice(0, at)) + "<mark>" + esc(m.t.slice(at, at + len)) + "</mark>" + esc(m.t.slice(at + len)); }
      return `<li role="option" data-i="${i}" class="${i === hl ? "hl" : ""}"><span>${title}</span><span class="yr">${m.y}</span></li>`;
    }).join("");
  }

  function choose(m) {
    selected = m;
    els.input.value = m.t;
    results = []; hl = -1; els.sugg.innerHTML = "";
    els.submit.disabled = false;
  }

  els.input.addEventListener("input", showSuggestions);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && results.length) { e.preventDefault(); hl = (hl + 1) % results.length; paintSuggestions(); }
    else if (e.key === "ArrowUp" && results.length) { e.preventDefault(); hl = (hl - 1 + results.length) % results.length; paintSuggestions(); }
    else if (e.key === "Escape") { results = []; els.sugg.innerHTML = ""; }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (results.length && hl >= 0) choose(results[hl]);
      else if (selected) guess(selected);
    }
  });
  els.sugg.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    e.preventDefault();
    choose(results[+li.dataset.i]);
  });
  els.input.addEventListener("blur", () => setTimeout(() => { els.sugg.innerHTML = ""; }, 100));
  els.submit.addEventListener("click", () => selected && guess(selected));
  els.skip.addEventListener("click", () => guess(null));

  // ---------- top-level controls ----------
  document.querySelectorAll(".mode").forEach((b) => b.onclick = () => { prefs.mode = b.dataset.mode; save("prefs", prefs); clearInput(); start(true); });
  document.querySelectorAll(".level").forEach((b) => b.onclick = () => { prefs.level = b.dataset.level; save("prefs", prefs); clearInput(); start(true); });
  document.querySelectorAll(".pt").forEach((b) => b.onclick = () => { prefs.type = b.dataset.type; save("prefs", prefs); clearInput(); start(true); });

  let toastTimer;
  function toast(msg) { els.toast.textContent = msg; els.toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1600); }

  start();
})();
