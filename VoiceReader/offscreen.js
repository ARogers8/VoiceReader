// Plays neural-voice audio. Extension service workers can't play sound, so
// background.js opens this hidden page and sends it text to read.
import { synthesize } from "./providers.js";

const audio = new Audio();
let session = 0; // bumps on every new read or stop so stale work is dropped

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== "offscreen") return;
  if (msg.type === "play") play(msg.chunks, msg.settings);
  if (msg.type === "stop") stop();
});

function stop() {
  session++;
  audio.pause();
  audio.removeAttribute("src");
}

async function play(chunks, settings) {
  stop();
  const mine = session;
  const fetchChunk = (i) =>
    synthesize(settings, chunks[i], {
      previousText: chunks[i - 1],
      nextText: chunks[i + 1],
    });

  // Keep up to two chunks generating ahead of the one playing, so later
  // (bigger) chunks are ready before they're needed.
  const LOOKAHEAD = 2;
  const pending = new Map();
  const request = (i) => {
    if (i >= chunks.length || pending.has(i)) return;
    const p = fetchChunk(i);
    p.catch(() => {}); // surfaced when awaited
    pending.set(i, p);
  };

  try {
    for (let i = 0; i < LOOKAHEAD && i < chunks.length; i++) request(i);
    for (let i = 0; i < chunks.length; i++) {
      const blob = await pending.get(i);
      pending.delete(i);
      if (mine !== session) return;
      request(i + LOOKAHEAD);
      await playBlob(blob, settings.volume);
      if (mine !== session) return;
    }
  } catch (err) {
    if (mine !== session) return;
    chrome.runtime.sendMessage({ type: "offscreen-error", message: err.message });
  }
}

function playBlob(blob, volume) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const done = () => {
      URL.revokeObjectURL(url);
      audio.onended = audio.onerror = audio.onpause = null;
      resolve();
    };
    audio.onended = done;
    audio.onpause = done; // stop() pauses
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't play the audio that came back."));
    };
    audio.src = url;
    audio.volume = Math.min(1, Math.max(0, Number(volume)));
    audio.play().catch(reject);
  });
}
