#!/usr/bin/env node
// Looks up 6 frames per movie in data/stills.js on TMDB and writes the
// image paths to data/stills-images.js. The site only reads that file, so
// the API key is used here and never ships to players.
//
//   TMDB_KEY=your_key node Cinedle/scripts/build-stills.mjs            # fill in missing movies
//   TMDB_KEY=your_key node Cinedle/scripts/build-stills.mjs --refresh  # redo every movie
//
// Without --refresh, movies already in stills-images.js are kept as they are,
// so you can hand-edit their order and it won't be overwritten.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STILLS_FILE = path.join(root, "data/stills.js");
const OUT_FILE = path.join(root, "data/stills-images.js");
const LEVELS = ["easy", "medium", "hard", "impossible"];
const PER_MOVIE = 6;

const key = (process.env.TMDB_KEY || "").trim();
if (!key) {
  console.error("TMDB_KEY is not set. Add it as a repo secret (Settings → Secrets and variables → Actions) or export it locally.");
  process.exit(1);
}
const refresh = process.argv.includes("--refresh");

// Must match idOf() in app.js
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const idOf = (t, y) => norm(t) + "|" + y;

function loadWindowFile(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  return ctx.window;
}

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(arr, rand) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(p, params = {}) {
  const url = new URL("https://api.themoviedb.org/3" + p);
  const headers = { accept: "application/json" };
  if (/^[a-f0-9]{32}$/i.test(key)) url.searchParams.set("api_key", key);
  else headers.Authorization = "Bearer " + key;
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.json();
    if (res.status === 401) throw new Error("TMDB rejected the key (401). Check the TMDB_KEY secret.");
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep((Number(res.headers.get("retry-after")) || 2 ** attempt) * 1000);
      continue;
    }
    throw new Error(`TMDB ${res.status} for ${p}`);
  }
}

async function findMovie(m) {
  const query = m.s || m.t;
  const exact = await tmdb("/search/movie", { query, primary_release_year: m.y, include_adult: "false" });
  if (exact.results && exact.results.length) return exact.results[0];
  const loose = await tmdb("/search/movie", { query, include_adult: "false" });
  const results = loose.results || [];
  return results.find((r) => (r.release_date || "").startsWith(String(m.y))) || null;
}

// Hardest first, easiest last. The most-voted textless backdrops are the
// iconic shots (easy end); a seeded random pick of the rest are the hard ones.
function orderBackdrops(all, movieId) {
  let backs = all.filter((b) => b.iso_639_1 === null); // no title text baked in
  if (backs.length < PER_MOVIE) backs = backs.concat(all.filter((b) => b.iso_639_1 !== null));
  backs.sort((a, b) => (b.vote_average - a.vote_average) || (b.vote_count - a.vote_count));
  const easy = backs.slice(0, 3);
  const hard = shuffle(backs.slice(3), rng(movieId)).slice(0, PER_MOVIE - 3);
  while (hard.length < PER_MOVIE - 3 && easy.length > 1) hard.push(easy.pop());
  return [...hard, ...easy.reverse()].map((b) => b.file_path);
}

async function main() {
  const { STILLS } = loadWindowFile(STILLS_FILE);
  const existing = fs.existsSync(OUT_FILE) ? loadWindowFile(OUT_FILE).STILL_IMAGES || {} : {};
  const movies = LEVELS.flatMap((lv) => STILLS[lv] || []).filter((m) => !(m.stills && m.stills.length));

  const out = {};
  const todo = [];
  for (const m of movies) {
    const id = idOf(m.t, m.y);
    if (!refresh && existing[id]) out[id] = existing[id];
    else todo.push(m);
  }
  console.log(`${movies.length} movies, ${movies.length - todo.length} already built, ${todo.length} to fetch`);

  const failed = [];
  let done = 0;
  const worker = async () => {
    while (todo.length) {
      const m = todo.shift();
      const id = idOf(m.t, m.y);
      try {
        const movie = await findMovie(m);
        if (!movie) throw new Error("not found on TMDB");
        const imgs = await tmdb(`/movie/${movie.id}/images`, { include_image_language: "null,en" });
        const images = orderBackdrops(imgs.backdrops || [], movie.id);
        if (images.length < 3) throw new Error(`only ${images.length} images`);
        out[id] = { tmdb: movie.id, images, poster: movie.poster_path || null };
      } catch (e) {
        failed.push(`${m.t} (${m.y}): ${e.message}`);
        if (existing[id]) out[id] = existing[id]; // keep the old entry rather than lose it
        if (/401/.test(e.message)) throw e;
      }
      if (++done % 25 === 0) console.log(`  ${done} fetched…`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  const ids = movies.map((m) => idOf(m.t, m.y)).filter((id) => out[id]);
  const body = [
    "// Generated by scripts/build-stills.mjs from TMDB. Paths go after https://image.tmdb.org/t/p/<size>.",
    "// images are hardest first. Safe to hand-edit; re-running without --refresh keeps your edits.",
    "window.STILL_IMAGES = {",
    ...ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(out[id])},`),
    "};",
    "",
  ].join("\n");
  fs.writeFileSync(OUT_FILE, body);

  console.log(`Wrote ${ids.length} movies to ${path.relative(process.cwd(), OUT_FILE)}`);
  if (failed.length) {
    console.log(`\n${failed.length} movie(s) had problems (they're left out of the Stills game):`);
    failed.forEach((f) => console.log("  - " + f));
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
