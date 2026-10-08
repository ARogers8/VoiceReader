// Shared settings helpers used by the background worker, the popup and the
// offscreen audio player.

export const DEFAULTS = {
  provider: "chrome", // "chrome" (free, built in), "elevenlabs" or "openai"
  voiceName: "", // chrome.tts voice; empty = Chrome's default voice
  rate: 1.0, // speaking speed, 1 is normal; each provider clamps to its range
  pitch: 1.0, // 0 – 2, built-in voices only
  volume: 1.0, // 0 – 1
  elevenlabsVoiceId: "JBFqnCBsd6RMkjVDRZzb", // George, a warm narrator
  openaiVoice: "fable",
};

// API keys stay on this computer (storage.local) rather than syncing.
export const SECRET_DEFAULTS = {
  elevenlabsKey: "",
  openaiKey: "",
};

export async function loadSettings() {
  const [synced, secrets] = await Promise.all([
    chrome.storage.sync.get(DEFAULTS),
    chrome.storage.local.get(SECRET_DEFAULTS),
  ]);
  return { ...DEFAULTS, ...synced, ...SECRET_DEFAULTS, ...secrets };
}

export function saveSettings(partial) {
  const secrets = {};
  const rest = {};
  for (const [key, value] of Object.entries(partial)) {
    (key in SECRET_DEFAULTS ? secrets : rest)[key] = value;
  }
  return Promise.all([
    Object.keys(rest).length && chrome.storage.sync.set(rest),
    Object.keys(secrets).length && chrome.storage.local.set(secrets),
  ]);
}

// Premade ElevenLabs voices that suit reading aloud. Every ElevenLabs account
// has these; once a key is entered the popup also lists the account's own
// voices, including ones added from the ElevenLabs Voice Library.
export const ELEVENLABS_VOICES = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", note: "warm British storyteller" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", note: "deep, resonant narrator" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", note: "steady British broadcaster" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", note: "wise, mature American" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", note: "warm, friendly American" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", note: "clear British educator" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", note: "soft, velvety British" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", note: "soft, reassuring American" },
];

export const OPENAI_VOICES = [
  { id: "fable", note: "expressive British storyteller" },
  { id: "sage", note: "calm and soothing" },
  { id: "ballad", note: "gentle and melodic" },
  { id: "onyx", note: "deep and authoritative" },
  { id: "coral", note: "warm and friendly" },
  { id: "nova", note: "bright and clear" },
  { id: "shimmer", note: "soft and light" },
  { id: "ash", note: "relaxed and conversational" },
  { id: "echo", note: "even and smooth" },
  { id: "alloy", note: "neutral and balanced" },
  { id: "verse", note: "lively and versatile" },
];
