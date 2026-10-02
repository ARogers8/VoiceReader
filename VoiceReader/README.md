# VoiceReader

A Chrome extension that reads highlighted text aloud. Highlight text on any
page, right-click, and choose **Read aloud with VoiceReader**.

It uses Chrome's built-in text-to-speech (`chrome.tts`), so there is no
account, API key, or outside service, and the voices available are the ones
installed on your computer plus Chrome's own.

## Features

- Right-click menu item on selected text: **Read aloud with VoiceReader**
- **Stop VoiceReader** in the right-click menu to cut it off
- Settings (click the toolbar icon): voice, speed, pitch, volume, with a test button
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
| `settings.js` | Default settings and storage helpers |
| `popup.html` / `popup.css` / `popup.js` | Settings popup (also the options page) |
| `icons/` | Toolbar and store icons |
