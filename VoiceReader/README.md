# VoiceReader

A Chrome extension that reads highlighted text aloud. Highlight text on any
page, right-click, and choose **Read aloud with VoiceReader**.

## Voices

Pick a **Voice type** in the settings panel:

- **Built-in voices** (default): free and offline, using Chrome's text-to-speech.
  These can sound robotic. Voices named "Natural" or "Online" are listed first
  and sound best. Microsoft Edge ships free natural voices, and VoiceReader
  works in Edge too.
- **ElevenLabs natural voices**: human-sounding narrator voices that read with
  real cadence, like an audiobook. Paste your ElevenLabs API key (free tier
  available at elevenlabs.io). Narrator voices such as George, Brian and Lily
  are listed, plus any voices you add to your account from the ElevenLabs
  Voice Library.
- **OpenAI natural voices**: paste an OpenAI API key. Voices are prompted to
  read like a calm audiobook narrator. Billed per use by OpenAI.

With the natural voices, text is sent a paragraph at a time and the next
paragraph is fetched while the current one plays, so reading flows without
gaps. API keys are stored only on this computer (`chrome.storage.local`) and
are sent only to the service you picked. If something goes wrong (a bad key,
no credits left), the error shows at the top of the settings panel and a red
"!" appears on the toolbar icon.

## Features

- Right-click menu item on selected text: **Read aloud with VoiceReader**
- **Stop VoiceReader** in the right-click menu to cut it off
- Settings (click the toolbar icon): voice type, voice, speed, pitch, volume, with a test button
- Keyboard shortcuts: `Alt+Shift+R` reads the selection, `Alt+Shift+S` stops
  (change them at `chrome://extensions/shortcuts`)
- Long selections are split into sentences so they don't cut off partway

Settings are saved with `chrome.storage.sync`, so they follow you to other
computers where you're signed in to Chrome.

## Install (load unpacked)

1. Download this repository (Code → Download ZIP) and unzip it, or `git clone` it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `VoiceReader` folder.
5. Pin the VoiceReader icon from the puzzle-piece menu if you want quick access to settings.

After changing any files, click the reload icon on the VoiceReader card in
`chrome://extensions`.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3) |
| `background.js` | Service worker: context menu, shortcuts, speaking |
| `settings.js` | Default settings, storage helpers, voice lists |
| `providers.js` | ElevenLabs and OpenAI requests, paragraph chunking |
| `offscreen.html` / `offscreen.js` | Hidden page that plays natural-voice audio |
| `popup.html` / `popup.css` / `popup.js` | Settings popup (also the options page) |
| `icons/` | Toolbar and store icons |
