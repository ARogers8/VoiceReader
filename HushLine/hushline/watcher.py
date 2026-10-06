"""Background clipboard watcher -- the "runs in the background" piece.

Workflow it enables, without any private iMessage APIs:

* **Sending.** Type your secret with the trigger prefix, e.g. ``>> meet at 8``,
  then copy it (Cmd/Ctrl+C). The watcher notices the trigger, encrypts + hides
  the text, and *replaces* the clipboard with innocent-looking carrier text.
  Paste into iMessage (Cmd/Ctrl+V) -- it reads as ordinary chatter.

* **Receiving.** Copy a message you received. If it carries a hidden payload,
  the watcher decrypts it and shows you the real message (console + a desktop
  notification on macOS), leaving your clipboard untouched.

This is deliberately clipboard-based because there is no supported way to read
or inject messages inside Apple's Messages app. Clipboard is the reliable,
cross-app bridge.

Clipboard access tries, in order: the ``pyperclip`` package, then the native
``pbcopy``/``pbpaste`` (macOS) or ``xclip``/``xsel`` (Linux) utilities.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import time

from . import DecryptionError, StegoError, conceal, is_carrier, recover


class _Clipboard:
    """Minimal read/write clipboard with graceful backend fallback."""

    def __init__(self) -> None:
        self._pyperclip = None
        try:
            import pyperclip  # type: ignore
            self._pyperclip = pyperclip
        except Exception:
            self._pyperclip = None

        self._paste_cmd, self._copy_cmd = self._native_cmds()
        if self._pyperclip is None and self._paste_cmd is None:
            raise RuntimeError(
                "No clipboard backend found. Install pyperclip "
                "(`pip install pyperclip`) or ensure pbcopy/pbpaste (macOS) or "
                "xclip/xsel (Linux) are available."
            )

    @staticmethod
    def _native_cmds():
        if shutil.which("pbpaste") and shutil.which("pbcopy"):
            return (["pbpaste"], ["pbcopy"])
        if shutil.which("xclip"):
            return (["xclip", "-selection", "clipboard", "-o"],
                    ["xclip", "-selection", "clipboard", "-i"])
        if shutil.which("xsel"):
            return (["xsel", "--clipboard", "--output"],
                    ["xsel", "--clipboard", "--input"])
        return (None, None)

    def paste(self) -> str:
        if self._pyperclip is not None:
            return self._pyperclip.paste()
        out = subprocess.run(self._paste_cmd, capture_output=True, check=False)
        return out.stdout.decode("utf-8", errors="replace")

    def copy(self, text: str) -> None:
        if self._pyperclip is not None:
            self._pyperclip.copy(text)
            return
        subprocess.run(self._copy_cmd, input=text.encode("utf-8"), check=False)


def _notify(title: str, message: str) -> None:
    """Best-effort desktop notification (macOS); always prints to console too."""
    if shutil.which("osascript"):
        safe_title = title.replace('"', "'")
        safe_msg = message.replace('"', "'")
        script = f'display notification "{safe_msg}" with title "{safe_title}"'
        subprocess.run(["osascript", "-e", script], check=False)


def run_watcher(code: str, cover: str, trigger: str = ">>",
                interval: float = 0.7) -> int:
    """Poll the clipboard and transform its contents. Runs until interrupted."""
    clip = _Clipboard()
    last_seen = None

    print("HushLine watcher running. Press Ctrl+C to stop.")
    print(f"  - Copy text starting with '{trigger}' to hide + re-copy it.")
    print("  - Copy a received message to reveal a hidden one.")

    try:
        current = clip.paste()
    except Exception:
        current = None
    last_seen = current

    while True:
        time.sleep(interval)
        try:
            current = clip.paste()
        except Exception:
            continue
        if current == last_seen or not current:
            last_seen = current
            continue
        last_seen = current

        stripped = current.lstrip()
        if stripped.startswith(trigger):
            secret = stripped[len(trigger):].strip()
            if not secret:
                continue
            carrier = conceal(secret, code, cover=cover)
            clip.copy(carrier)
            last_seen = carrier
            print(f"[hidden]  secret encrypted into cover text -> clipboard "
                  f"ready to paste ({len(secret)} chars)")
            _notify("HushLine", "Secret hidden. Paste it into your chat.")
            continue

        if is_carrier(current):
            try:
                revealed = recover(current, code)
            except StegoError:
                continue
            except DecryptionError:
                print("[reveal]  hidden message found, but the code is wrong "
                      "or it was altered.")
                _notify("HushLine", "Hidden message: wrong code / altered.")
                continue
            print(f"[reveal]  {revealed}")
            _notify("HushLine - revealed message", revealed)


if __name__ == "__main__":
    # Allow `python -m hushline.watcher <code>` for quick testing.
    if len(sys.argv) < 2:
        print("usage: python -m hushline.watcher <code>", file=sys.stderr)
        raise SystemExit(1)
    raise SystemExit(run_watcher(sys.argv[1], cover="hey! how's your vacation going?"))
