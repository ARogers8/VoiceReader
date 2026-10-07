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
Quotes work with no setup.

### Stills setup

Movie frames come from [TMDB](https://www.themoviedb.org/). Get a free API key
(themoviedb.org → Settings → API) and either paste it into the in-game Settings (saved only in
that browser) or put it in `config.js` so every visitor gets the Stills game.

Frame order is picked automatically: TMDB's highest-voted textless backdrops (the iconic shots)
become the easy final frames, and random lesser-voted ones become the hard opening frames.

### Hand-picking frames

For full control over the progression (e.g. *No Time to Die*: water → London → Bond's car →
Bond), add a `stills` array to the movie in `data/stills.js`, hardest first:

```js
{ t: "No Time to Die", y: 2021, stills: [
  "stills/no-time-to-die/1.jpg", "stills/no-time-to-die/2.jpg", /* … */ "stills/no-time-to-die/6.jpg",
] },
```

Hand-picked stills skip TMDB entirely.

## Editing the content

- `data/quotes.js` — quotes per level (`q`, `t`, `y`, `c` character, `a` actor)
- `data/stills.js` — movies per level for the Stills mode
- `data/movies.js` — extra titles that show up in the search dropdown as decoys
