# HushLine

Send a message that **looks** like ordinary chatter — *"hey! how's your
vacation going?"* — but secretly carries a real, encrypted message that only
someone with the same **code** can read. Works over iMessage, SMS, or any chat
app that passes text through unchanged.

```
you type:     meet me at the pier at 8
you paste:    hey! how's your vacation going?      ← this is what you send
they read:    meet me at the pier at 8             ← only with the shared code
```

## How it actually works (and an honest limitation)

iMessage is Apple's closed, end-to-end-encrypted system. **There is no
supported way to hook into the Messages app and silently intercept or decrypt
messages in place** — anything claiming to do that relies on brittle private
APIs that break on every macOS update. So HushLine is a **companion tool**, not
an iMessage plugin:

1. **Encryption** (`hushline/crypto.py`) — your real message is encrypted with
   **AES-256-GCM**. The key is derived from your shared code with **scrypt**
   (fresh random salt + nonce per message). This is what keeps the content
   secret and tamper-evident.
2. **Steganography** (`hushline/stego.py`) — the encrypted bytes are encoded as
   **invisible zero-width Unicode characters** and tucked inside a normal-looking
   cover sentence. This is what hides the *existence* of the message from a
   casual reader.
3. **Clipboard bridge** (`hushline/watcher.py`) — a background watcher turns
   this into a smooth flow: copy your secret and it swaps your clipboard for the
   innocent carrier text; copy a received message and it reveals the hidden one.

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
    cli.py       # `hushline` command
    watcher.py   # background clipboard watcher
  tests/
    test_hushline.py
```
