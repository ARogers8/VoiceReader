import { loadSettings } from "./settings.js";

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
    chrome.tts.stop();
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
    chrome.tts.stop();
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
    chrome.tts.stop();
    sendResponse({ ok: true });
  }
  return false;
});

async function getSelectionFromTab(tab) {
  if (!tab?.id) return "";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => window.getSelection()?.toString() ?? "",
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
