// Shared settings helpers used by the background worker and the popup.

export const DEFAULTS = {
  voiceName: "", // empty = Chrome's default voice
  rate: 1.0, // 0.1 – 10, 1 is normal speed
  pitch: 1.0, // 0 – 2
  volume: 1.0, // 0 – 1
};

export async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export function saveSettings(partial) {
  return chrome.storage.sync.set(partial);
}
