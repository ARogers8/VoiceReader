"""macOS iMessage bridge: send via Messages automation, read via chat.db.

Sending uses AppleScript (``osascript``) to drive the Messages app. This is a
supported automation path -- the message is sent from *your own* iMessage
account, exactly as if you typed it. No private APIs.

Receiving reads the local Messages database at
``~/Library/Messages/chat.db``. macOS protects this file, so the app (or the
Terminal/Python running it) needs **Full Disk Access**
(System Settings -> Privacy & Security -> Full Disk Access). We only ever read
it, never write.

Everything here is macOS-only. :func:`is_supported` lets the GUI degrade
gracefully elsewhere.
"""

from __future__ import annotations

import os
import re
import sqlite3
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

CHAT_DB = Path(os.path.expanduser("~")) / "Library" / "Messages" / "chat.db"

# AppleScript that sends `message` to `phone` over iMessage. Arguments arrive
# via `on run argv` so we never have to escape user text into the script body.
_SEND_SCRIPT = """
on run argv
    set targetPhone to item 1 of argv
    set targetMessage to item 2 of argv
    tell application "Messages"
        set targetService to 1st account whose service type = iMessage
        set targetBuddy to participant targetPhone of targetService
        send targetMessage to targetBuddy
    end tell
end run
"""


def is_supported() -> bool:
    """True only on macOS, where iMessage and its automation exist."""
    return sys.platform == "darwin"


class IMessageError(Exception):
    """Raised when sending through Messages fails."""


def send_imessage(phone: str, text: str, timeout: float = 20.0) -> None:
    """Send ``text`` to ``phone`` via the Messages app.

    ``phone`` may be a phone number (ideally E.164, e.g. +15551234567) or an
    Apple ID email registered with iMessage.
    """
    if not is_supported():
        raise IMessageError("Sending iMessages is only supported on macOS.")
    if not phone or not text:
        raise IMessageError("phone and text are both required")

    # Write the script to a temp file so osascript parses it cleanly, then pass
    # the phone and message as positional arguments (no escaping needed).
    with tempfile.NamedTemporaryFile("w", suffix=".applescript",
                                     delete=False, encoding="utf-8") as fh:
        fh.write(_SEND_SCRIPT)
        script_path = fh.name
    try:
        proc = subprocess.run(
            ["osascript", script_path, phone, text],
            capture_output=True, timeout=timeout, check=False,
        )
    except FileNotFoundError as exc:
        raise IMessageError("osascript not found (is this macOS?)") from exc
    except subprocess.TimeoutExpired as exc:
        raise IMessageError("Messages did not respond in time") from exc
    finally:
        try:
            os.unlink(script_path)
        except OSError:
            pass

    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace").strip()
        raise IMessageError(detail or "osascript failed to send the message")


def normalize_phone(phone: str) -> str:
    """Reduce a phone/handle to digits (keeping a leading +) for matching.

    Emails are returned lowercased and untouched otherwise. This lets us match
    '+1 (555) 123-4567' against the '+15551234567' stored by Messages.
    """
    phone = phone.strip()
    if "@" in phone:
        return phone.lower()
    plus = phone.startswith("+")
    digits = re.sub(r"\D", "", phone)
    return ("+" if plus else "") + digits


def _handles_match(a: str, b: str) -> bool:
    na, nb = normalize_phone(a), normalize_phone(b)
    if na == nb:
        return True
    # Fall back to comparing the last 10 digits (handles country-code gaps).
    da, db = re.sub(r"\D", "", na), re.sub(r"\D", "", nb)
    return bool(da) and bool(db) and da[-10:] == db[-10:]


@dataclass
class IncomingMessage:
    rowid: int
    handle: str          # sender's phone/email as stored by Messages
    text: str            # best-effort recovered text (may contain hidden chars)
    date: int            # Apple epoch nanoseconds (opaque; used for ordering)


def _extract_text(text, attributed_body) -> str:
    """Recover message text, preferring the plain column.

    Newer macOS sometimes leaves ``text`` NULL and stores the body in
    ``attributedBody`` (an NSAttributedString archive). Our hidden payload is
    made of literal Unicode characters, so decoding the blob as UTF-8 and
    keeping the printable/zero-width run recovers it well enough to reveal.
    """
    if text:
        return text
    if not attributed_body:
        return ""
    raw = attributed_body if isinstance(attributed_body, bytes) else bytes(attributed_body)
    decoded = raw.decode("utf-8", errors="ignore")
    # Trim obvious archive framing around the human text when present.
    marker = decoded.find("NSString")
    if marker != -1:
        decoded = decoded[marker + len("NSString"):]
    return decoded


class MessagesReader:
    """Polls chat.db for new *incoming* messages from known handles.

    Call :meth:`new_messages` repeatedly; it returns messages newer than the
    highest ROWID seen so far. The first call primes the watermark and returns
    nothing, so you only ever act on messages that arrive after startup.
    """

    def __init__(self, db_path: Path = CHAT_DB):
        self.db_path = Path(db_path)
        self._last_rowid = 0
        self._primed = False

    def available(self) -> bool:
        return self.db_path.exists()

    def _connect(self) -> sqlite3.Connection:
        # Read-only immutable open so we never lock or modify Messages' db.
        uri = f"file:{self.db_path}?mode=ro&immutable=1"
        return sqlite3.connect(uri, uri=True, timeout=5.0)

    def new_messages(self, known_handles: list[str]) -> list[IncomingMessage]:
        if not self.available():
            raise IMessageError(
                f"Cannot read {self.db_path}. Grant Full Disk Access to this "
                "app in System Settings -> Privacy & Security."
            )
        if not self._primed:
            # Establish the watermark cheaply instead of scanning every row,
            # so we only ever surface messages that arrive after startup.
            try:
                con = self._connect()
                try:
                    row = con.execute("SELECT MAX(ROWID) FROM message").fetchone()
                    self._last_rowid = row[0] or 0
                finally:
                    con.close()
            except sqlite3.Error as exc:
                raise IMessageError(f"Error reading chat.db: {exc}") from exc
            self._primed = True
            return []
        query = (
            "SELECT m.ROWID, h.id, m.text, m.attributedBody, m.date "
            "FROM message m JOIN handle h ON m.handle_id = h.ROWID "
            "WHERE m.is_from_me = 0 AND m.ROWID > ? "
            "ORDER BY m.ROWID ASC"
        )
        out: list[IncomingMessage] = []
        try:
            con = self._connect()
            try:
                con.text_factory = lambda b: b  # keep raw bytes; decode ourselves
                cur = con.execute(query, (self._last_rowid,))
                for rowid, handle_b, text_b, body_b, date in cur.fetchall():
                    self._last_rowid = max(self._last_rowid, rowid)
                    handle = (handle_b or b"").decode("utf-8", "replace")
                    if known_handles and not any(
                        _handles_match(handle, k) for k in known_handles
                    ):
                        continue
                    text = _extract_text(
                        text_b.decode("utf-8", "replace") if text_b else None,
                        body_b,
                    )
                    out.append(IncomingMessage(rowid, handle, text, date or 0))
            finally:
                con.close()
        except sqlite3.Error as exc:
            raise IMessageError(f"Error reading chat.db: {exc}") from exc

        return out
