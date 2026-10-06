# HushLine

Send a message that **looks** like ordinary chatter — *"hey! how's your
vacation going?"* — but secretly carries a real, encrypted message that only
someone with the same **code** can read.

There's a **desktop app** (macOS): unlock with your code, pick a contact, type,
and hit Send — it's encrypted and sent through iMessage for you automatically,
and replies that carry a hidden message are decrypted in the conversation. See
**[The desktop app](#the-desktop-app-macos)** below. There's also a CLI and a
Python library for the same engine.

```
you type:     meet me at the pier at 8
you paste:    hey! how's your vacation going?      ← this is what you send
they read:    meet me at the pier at 8             ← only with the shared code
```

## The desktop app (macOS)

The app does the whole flow for you — no copy/paste.

```
┌──────────── HushLine ────────────┐
│  Enter the shared encryption code │
│  [ •••••••••••••••••••••• ]        │
│            [ Unlock ]             │
└───────────────────────────────────┘
        │  unlock
        ▼
┌───────────┬───────────────────────┐
│ + Add     │  You: meet me at 8     │
│ contact   │  Alex: on my way       │   ← decrypted in place
│───────────│                        │
│ ▸ Alex    │                        │
│   Sam     │ [ type a message ] Send│   ← sent via iMessage, encrypted
└───────────┴───────────────────────┘
```

1. **Unlock** — type your shared encryption code. It stays in memory for the
   session only; it is never written to disk or sent anywhere.
2. **Add a contact** — name + iMessage phone (E.164 like `+15551234567`) or
   Apple ID email. Saved to `~/.hushline/contacts.json` (no secrets in there).
3. **Send** — type a normal message, hit Send. HushLine encrypts it, hides it
   in cover text, and the Messages app sends it over iMessage automatically.
4. **Receive** — a background poller reads new iMessages; any that carry a
   hidden HushLine payload are decrypted and shown in the conversation. Normal
   messages are ignored.

### Run it

```bash
cd HushLine
pip install -e .          # Tkinter ships with the python.org macOS build
hushline-app              # or:  python -m hushline.app
```

### One-time macOS permissions

- **Sending** uses the Messages app via AppleScript. The first send triggers a
  prompt to let your terminal / Python **control Messages** — click OK (or
  System Settings → Privacy & Security → **Automation**).
- **Receiving** reads `~/Library/Messages/chat.db`, which macOS protects. Grant
  **Full Disk Access** to the app running HushLine (System Settings → Privacy &
  Security → **Full Disk Access**). HushLine only ever reads this file. Until
  you do, sending still works; the app just shows a note that it can't read
  replies yet.

The other device needs HushLine too (or the CLI) and the **same code** — it
receives a normal-looking iMessage and decrypts the hidden message.

## How it actually works

iMessage is Apple's closed, end-to-end-encrypted system. There is no supported
way to hook *inside* the Messages app, so HushLine drives it from the outside
the way macOS supports: **AppleScript automation to send**, and a **read-only
poll of the local Messages database to receive**. On top of that:

1. **Encryption** (`hushline/crypto.py`) — your real message is encrypted with
   **AES-256-GCM**. The key is derived from your shared code with **scrypt**
   (fresh random salt + nonce per message). This is what keeps the content
   secret and tamper-evident.
2. **Steganography** (`hushline/stego.py`) — the encrypted bytes are encoded as
   **invisible zero-width Unicode characters** and tucked inside a normal-looking
   cover sentence. This is what hides the *existence* of the message from a
   casual reader.
3. **iMessage bridge** (`hushline/imessage.py`) — sends carrier text through
   the Messages app and polls the Messages database to reveal incoming hidden
   messages. The desktop app (`hushline/app.py`) wires these together.

A clipboard-based CLI watcher (`hushline/watcher.py`) is also included for
quick use or other chat apps: copy your secret and it swaps your clipboard for
the carrier; copy a received message and it reveals the hidden one.

The two devices never exchange keys over the wire — they just need the same
code, shared once, in person or over a channel you already trust.

## Install

```bash
cd HushLine
pip install -e .            # core tool (CLI: `hushline`)
pip install -e '.[clipboard]'   # add clipboard support for `hushline watch`
```

## Use it

```bash
# 1. Generate a code and share it with the other device (once).
hushline newcode
#   willow-ember-quartz-otter-lantern-reef

# 2. Save it on each device so you don't retype it.
hushline setcode willow-ember-quartz-otter-lantern-reef   # -> ~/.hushline/code (0600)

# 3. Hide a message. Copy the output into iMessage.
hushline hide "meet me at the pier at 8" --cover "hey! how's your vacation going?"

# 4. Reveal a message you received (paste it as the argument or on stdin).
hushline reveal "hey! how's your vacation going?"
#   meet me at the pier at 8
```

### Background mode

```bash
hushline watch
```

- **Sending:** type your secret with the trigger prefix — `>> meet at 8` —
  then copy it. The watcher replaces your clipboard with innocent carrier text,
  ready to paste into Messages.
- **Receiving:** copy a message you got. If it hides a payload, the watcher
  decrypts it and shows the real message (console + a macOS notification).

The code can come from `--code`, the `HUSHLINE_CODE` environment variable, or
the saved `~/.hushline/code` file (checked in that order).

## As a library

```python
from hushline import conceal, recover

carrier = conceal("meet me at 8", "willow-ember-quartz", cover="hey how's your trip?")
# carrier displays as "hey how's your trip?" but carries the encrypted message
recover(carrier, "willow-ember-quartz")   # -> "meet me at 8"
```

## Security notes — please read

- **The encryption protects the content; the steganography only hides that a
  message exists.** They are independent. Even if someone strips the invisible
  characters or knows HushLine was used, they still cannot read the message
  without the code.
- **Your security rests entirely on the code.** A short or guessable code can be
  brute-forced offline. Use the generated 6-word (or longer) codes, share them
  over a trusted channel, and don't reuse one code for unrelated contacts.
- **Zero-width characters are not indestructible.** Some platforms normalise or
  strip them, which would quietly break the hidden payload (the visible text
  still arrives fine). AES-GCM authentication means a corrupted payload fails
  loudly rather than decrypting to garbage.
- **This is not a substitute for a vetted secure messenger** (Signal and
  friends). It's a lightweight layer for text channels you're already using.
- Tampering is detected: any altered byte makes `reveal`/`decrypt` fail instead
  of returning a wrong-but-plausible message.

## Develop

```bash
pip install -e '.[dev]'
pytest -q
```

Layout:

```
HushLine/
  hushline/
    crypto.py    # AES-256-GCM + scrypt key derivation
    stego.py     # zero-width-character steganography
    codes.py     # shared-code generation
    contacts.py  # on-disk contact book (name + iMessage handle)
    imessage.py  # macOS: send via Messages automation, read chat.db
    app.py       # Tkinter desktop app (`hushline-app`)
    cli.py       # `hushline` command
    watcher.py   # background clipboard watcher
  tests/
    test_hushline.py
    test_imessage.py
```
