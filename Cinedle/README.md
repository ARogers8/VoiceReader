# Cinedle

A Songless / Worldle-style movie guessing game. Dark, minimal, no build step.

## Modes

**Quotes** — one famous line. You get 5 tries; every wrong guess or skip unlocks a hint
(year → character → actor → first letter of the title).

**Stills** — 6 frames from the movie, hardest first. Each wrong guess or skip shows an
easier frame (a random shot first, the iconic shot last). On Hard and Impossible the first
frames are also cropped in.

Both modes have **Easy / Medium / Hard / Impossible** levels, a **Daily** puzzle (same for
everyone, resets at midnight, with streaks and a shareable 🟥⬜🟩 grid) and **Endless** play.
Guessing works like Songless: start typing and pick the movie from the dropdown.

## Running it

Open `index.html` in a browser, or serve the folder (`npx serve .` / `python3 -m http.server`).
Quotes work with no setup. Stills work once the images have been built (below).

### Stills setup (one time, nobody else ever needs a key)

Movie frames come from [TMDB](https://www.themoviedb.org/). Your API key lives only in GitHub's
encrypted secrets. A GitHub Action uses it to look up 6 frames per movie and saves the image
links to `data/stills-images.js`. The website only reads that file, so players never see or
need a key.

1. Repo **Settings → Secrets and variables → Actions → New repository secret**.
   Name: `TMDB_KEY`. Value: your TMDB key (the long "API Read Access Token" or the short v3 key).
2. **Actions** tab → **Build Cinedle stills** → run it (or re-run the latest failed run if it
   ran before the secret existed). It takes a few minutes and commits `stills-images.js`.
3. It runs again by itself whenever you add movies to `data/stills.js`, and only fetches the new
   ones. Tick "Redo every movie" when running it by hand to rebuild everything.

Frame order: TMDB's highest-voted textless backdrops (the iconic shots) become the easy final
frames, and random lesser-voted ones become the hard opening frames. To fix a movie's order, edit
its `images` list in `data/stills-images.js` (hardest first). Your edits are kept on later runs.
If TMDB ever deletes an image, the game skips it.

To run it on your own computer instead: `TMDB_KEY=your_key node Cinedle/scripts/build-stills.mjs`

### Hand-picking frames

For full control over the progression (e.g. *No Time to Die*: water → London → Bond's car →
Bond), add a `stills` array to the movie in `data/stills.js`, hardest first:

```js
{ t: "No Time to Die", y: 2021, stills: [
  "stills/no-time-to-die/1.jpg", "stills/no-time-to-die/2.jpg", /* … */ "stills/no-time-to-die/6.jpg",
] },
```

Hand-picked stills skip TMDB entirely.

The site must show the TMDB credit in its footer (already there) to use TMDB images.

## Editing the content

- `data/quotes.js` — quotes per level (`q`, `t`, `y`, `c` character, `a` actor)
- `data/stills.js` — movies per level for the Stills mode
- `data/movies.js` — extra titles that show up in the search dropdown as decoys
