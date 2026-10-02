import {
  DEFAULTS,
  SECRET_DEFAULTS,
  ELEVENLABS_VOICES,
  OPENAI_VOICES,
  loadSettings,
  saveSettings,
} from "./settings.js";

const $ = (id) => document.getElementById(id);
const sliders = {
  rate: (v) => `${Number(v).toFixed(2).replace(/0$/, "")}×`,
  pitch: (v) => Number(v).toFixed(1),
  volume: (v) => `${Math.round(v * 100)}%`,
};
// Each provider supports a different speed range.
const RATE_RANGE = {
  chrome: [0.5, 3],
  elevenlabs: [0.7, 1.2],
  openai: [0.5, 2],
};

async function init() {
  const settings = await loadSettings();

  for (const [key, format] of Object.entries(sliders)) {
    const input = $(key);
    input.value = settings[key];
    $(`${key}Out`).textContent = format(input.value);
    input.addEventListener("input", () => {
      $(`${key}Out`).textContent = format(input.value);
    });
    // Save on release rather than every tick; sync storage limits write rate.
    input.addEventListener("change", () => {
      saveSettings({ [key]: Number(input.value) });
    });
  }

  $("provider").value = settings.provider;
  $("provider").addEventListener("change", async (e) => {
    await saveSettings({ provider: e.target.value });
    showProvider(e.target.value);
  });
  showProvider(settings.provider);

  for (const id of ["elevenlabsKey", "openaiKey"]) {
    $(id).value = settings[id];
    $(id).addEventListener("change", async () => {
      await saveSettings({ [id]: $(id).value.trim() });
      if (id === "elevenlabsKey") populateElevenLabs($("elevenlabsVoiceId").value);
    });
  }
  for (const id of ["voiceName", "elevenlabsVoiceId", "openaiVoice"]) {
    $(id).addEventListener("change", () => saveSettings({ [id]: $(id).value }));
  }

  populateOpenAI(settings.openaiVoice);
  await Promise.all([
    populateChromeVoices(settings.voiceName),
    populateElevenLabs(settings.elevenlabsVoiceId, settings.elevenlabsKey),
  ]);

  const { lastError } = await chrome.storage.local.get({ lastError: "" });
  showError(lastError);
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastError) showError(changes.lastError.newValue);
  });

  $("test").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "speak", text: $("sample").value });
  });
  $("stop").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "stop" });
  });
  $("reset").addEventListener("click", async () => {
    // Keeps API keys; only voice and sound settings go back to defaults.
    await saveSettings(DEFAULTS);
    location.reload();
  });
}

function showProvider(provider) {
  document.querySelectorAll("[data-provider]").forEach((el) => {
    el.hidden = el.dataset.provider !== provider;
  });
  const [min, max] = RATE_RANGE[provider] || RATE_RANGE.chrome;
  const rate = $("rate");
  rate.min = min;
  rate.max = max;
  if (Number(rate.value) < min || Number(rate.value) > max) {
    rate.value = Math.min(max, Math.max(min, 1));
    saveSettings({ rate: Number(rate.value) });
  }
  $("rateOut").textContent = sliders.rate(rate.value);
}

function showError(message) {
  $("error").textContent = message || "";
  $("error").hidden = !message;
}

async function populateChromeVoices(selected) {
  const voices = (await chrome.tts.getVoices()).filter((v) => v.voiceName);
  const select = $("voiceName");
  const lang = navigator.language.split("-")[0];
  const natural = (v) => /natural|online|neural|premium|enhanced/i.test(v.voiceName);

  // Natural-sounding voices first, then the browser's language, then the rest.
  voices
    .sort((a, b) => {
      const score = (v) => (natural(v) ? 0 : 2) + (v.lang?.startsWith(lang) ? 0 : 1);
      return score(a) - score(b) || a.voiceName.localeCompare(b.voiceName);
    })
    .forEach((v) => {
      const label = v.lang ? `${v.voiceName} (${v.lang})` : v.voiceName;
      select.add(new Option(label, v.voiceName));
    });

  // If the saved voice is no longer installed, fall back to the default.
  select.value = voices.some((v) => v.voiceName === selected) ? selected : "";
}

function populateOpenAI(selected) {
  const select = $("openaiVoice");
  for (const v of OPENAI_VOICES) {
    const name = v.id[0].toUpperCase() + v.id.slice(1);
    select.add(new Option(`${name} — ${v.note}`, v.id));
  }
  select.value = selected;
}

async function populateElevenLabs(selected, key) {
  key ??= (await chrome.storage.local.get(SECRET_DEFAULTS)).elevenlabsKey;
  const select = $("elevenlabsVoiceId");
  select.replaceChildren();

  let voices = ELEVENLABS_VOICES.map((v) => ({ ...v, label: `${v.name} — ${v.note}` }));
  if (key) {
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": key },
      });
      if (res.ok) {
        const data = await res.json();
        const fromAccount = data.voices.map((v) => {
          const l = v.labels || {};
          const note = [l.description || l.descriptive, l.accent, l.use_case].filter(Boolean).join(", ");
          return { id: v.voice_id, label: note ? `${v.name} — ${note}` : v.name };
        });
        if (fromAccount.length) voices = fromAccount;
      }
    } catch {
      // Offline or key without voice access: keep the built-in list.
    }
  }

  for (const v of voices) select.add(new Option(v.label, v.id));
  select.value = voices.some((v) => v.id === selected) ? selected : voices[0].id;
  if (select.value !== selected) saveSettings({ elevenlabsVoiceId: select.value });
}

init();
