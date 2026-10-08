import { loadSettings } from "./settings.js";
import { splitForNarration } from "./providers.js";
import { readCleanSelection } from "./selection.js";

const MENU_READ = "voicereader-read";
const MENU_STOP = "voicereader-stop";

// Some voices (notably Google's network voices) stop after ~15 seconds of
// continuous speech, so long selections are split into sentence-sized chunks
// and queued one after another.
const MAX_CHUNK = 200;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_READ,
      title: "Read aloud with VoiceReader",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: MENU_STOP,
      title: "Stop VoiceReader",
      contexts: ["all"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_STOP) {
    stopAll();
    return;
  }
  if (info.menuItemId === MENU_READ) {
    // selectionText collapses line breaks, so prefer the live selection from
    // the page when we can read it; fall back to what the menu gave us.
    const text = (await getSelectionFromTab(tab)) || info.selectionText;
    speak(text);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "stop-reading") {
    stopAll();
  } else if (command === "read-selection") {
    speak(await getSelectionFromTab(tab));
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "speak") {
    speak(msg.text, msg.settings).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "stop") {
    stopAll();
    sendResponse({ ok: true });
  }
  if (msg?.type === "offscreen-error") {
    reportError(msg.message);
  }
  return false;
});

async function getSelectionFromTab(tab) {
  if (!tab?.id) return "";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: readCleanSelection, // skips ads and other page clutter in the selection
    });
    return results.map((r) => r.result).find((t) => t && t.trim()) || "";
  } catch {
    // Pages like chrome:// or the Web Store can't be scripted.
    return "";
  }
}

export async function speak(text, overrides) {
  text = (text || "").trim();
  if (!text) return;

  const settings = { ...(await loadSettings()), ...overrides };
  await chrome.storage.local.set({ lastError: "" });
  chrome.action.setBadgeText({ text: "" });

  if (settings.provider === "chrome") {
    chrome.runtime.sendMessage({ target: "offscreen", type: "stop" }).catch(() => {});
    speakWithChrome(text, settings);
  } else {
    chrome.tts.stop();
    await ensureOffscreen();
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "play",
      chunks: splitForNarration(text),
      settings,
    });
  }
}

function speakWithChrome(text, settings) {
  const options = {
    rate: Number(settings.rate),
    pitch: Number(settings.pitch),
    volume: Number(settings.volume),
  };
  if (settings.voiceName) options.voiceName = settings.voiceName;

  // The first chunk interrupts anything already playing; the rest queue up.
  splitIntoChunks(text).forEach((chunk, i) => {
    chrome.tts.speak(chunk, { ...options, enqueue: i > 0 });
  });
}

function stopAll() {
  chrome.tts.stop();
  chrome.runtime.sendMessage({ target: "offscreen", type: "stop" }).catch(() => {});
}

// Shown in the popup and as a "!" on the toolbar icon so a bad key or an
// empty account doesn't just fail silently.
function reportError(message) {
  chrome.storage.local.set({ lastError: message });
  chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  chrome.action.setBadgeText({ text: "!" });
}

let creatingOffscreen;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creatingOffscreen ||= chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play the natural-sounding voice audio for text being read aloud.",
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

export function splitIntoChunks(text, max = MAX_CHUNK) {
  const sentences = text
    .replace(/\s+/g, " ")
    .match(/[^.!?。！？]+[.!?。！？]*["')\]]*\s*/g) || [text];

  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length <= max) {
      current += sentence;
      continue;
    }
    if (current) chunks.push(current.trim());
    current = "";
    // A single sentence longer than max is split on word boundaries.
    if (sentence.length > max) {
      for (const word of sentence.split(" ")) {
        if ((current + " " + word).length > max && current) {
          chunks.push(current.trim());
          current = "";
        }
        current += (current ? " " : "") + word;
      }
    } else {
      current = sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
