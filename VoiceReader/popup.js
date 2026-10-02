import { DEFAULTS, loadSettings, saveSettings } from "./settings.js";

const $ = (id) => document.getElementById(id);
const sliders = {
  rate: (v) => `${Number(v).toFixed(1)}×`,
  pitch: (v) => Number(v).toFixed(1),
  volume: (v) => `${Math.round(v * 100)}%`,
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

  await populateVoices(settings.voiceName);
  $("voiceName").addEventListener("change", (e) => {
    saveSettings({ voiceName: e.target.value });
  });

  $("test").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "speak", text: $("sample").value });
  });
  $("stop").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "stop" });
  });
  $("reset").addEventListener("click", async () => {
    await saveSettings(DEFAULTS);
    location.reload();
  });
}

async function populateVoices(selected) {
  const voices = await chrome.tts.getVoices();
  const select = $("voiceName");
  const lang = navigator.language.split("-")[0];

  // Show voices in the browser's language first, then everything else.
  voices
    .filter((v) => v.voiceName)
    .sort((a, b) => {
      const aLocal = a.lang?.startsWith(lang) ? 0 : 1;
      const bLocal = b.lang?.startsWith(lang) ? 0 : 1;
      return aLocal - bLocal || a.voiceName.localeCompare(b.voiceName);
    })
    .forEach((v) => {
      const option = new Option(
        v.lang ? `${v.voiceName} (${v.lang})` : v.voiceName,
        v.voiceName,
      );
      select.add(option);
    });

  // If the saved voice is no longer installed, fall back to the default.
  select.value = voices.some((v) => v.voiceName === selected) ? selected : "";
}

init();
