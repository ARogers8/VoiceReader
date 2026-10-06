"""Hide a binary payload inside ordinary-looking text using zero-width chars.

The visible text is a perfectly normal message ("hey, how's your vacation?").
The encrypted payload is encoded as a run of invisible Unicode "zero-width"
characters and tucked in after the first word. Most chat apps -- iMessage
included -- transmit and copy/paste these characters untouched, so the carrier
message looks and reads exactly like plain text while secretly carrying the
ciphertext.

Encoding:
    bit 0  -> U+200B  ZERO WIDTH SPACE
    bit 1  -> U+200C  ZERO WIDTH NON-JOINER
    frame  -> U+2060  WORD JOINER   (one sentinel before and after the run)

Each payload byte becomes 8 bits, most-significant first.

Caveats worth knowing: this hides *that* a message exists from a casual reader,
not from software that strips or inspects invisible characters. Some platforms
normalise or drop zero-width characters. The encryption in crypto.py is what
protects the content; the stego layer only protects its visibility.
"""

from __future__ import annotations

_ZERO = "​"   # bit 0
_ONE = "‌"    # bit 1
_FRAME = "⁠"  # start/end sentinel

_ALL_HIDDEN = (_ZERO, _ONE, _FRAME)


class StegoError(Exception):
    """Raised when no valid hidden payload can be recovered from text."""


def _bytes_to_bits(data: bytes) -> str:
    return "".join(_ONE if (byte >> (7 - i)) & 1 else _ZERO
                    for byte in data for i in range(8))


def _bits_to_bytes(bits: str) -> bytes:
    if len(bits) % 8 != 0:
        raise StegoError("hidden payload is not a whole number of bytes")
    out = bytearray()
    for i in range(0, len(bits), 8):
        byte = 0
        for ch in bits[i : i + 8]:
            byte = (byte << 1) | (1 if ch == _ONE else 0)
        out.append(byte)
    return bytes(out)


def _encoded_payload(data: bytes) -> str:
    return _FRAME + _bytes_to_bits(data) + _FRAME


def hide(payload: bytes, cover: str) -> str:
    """Embed ``payload`` inside the ``cover`` text, returning carrier text.

    The invisible run is inserted after the first whitespace-delimited word so
    it rides along naturally; if the cover has no space, it is appended.
    """
    if any(ch in cover for ch in _ALL_HIDDEN):
        raise StegoError("cover text already contains zero-width characters")
    secret = _encoded_payload(payload)

    space = cover.find(" ")
    if space == -1:
        return cover + secret
    return cover[:space] + secret + cover[space:]


def reveal(carrier: str) -> bytes:
    """Extract and return the hidden payload from ``carrier`` text."""
    start = carrier.find(_FRAME)
    if start == -1:
        raise StegoError("no hidden payload found")
    end = carrier.find(_FRAME, start + 1)
    if end == -1:
        raise StegoError("hidden payload is not properly framed")

    bits = []
    for ch in carrier[start + 1 : end]:
        if ch == _ZERO:
            bits.append(_ZERO)
        elif ch == _ONE:
            bits.append(_ONE)
        # Any other character inside the frame is ignored defensively.
    return _bits_to_bytes("".join(bits))


def has_hidden_payload(carrier: str) -> bool:
    """Cheap check: does this text look like it carries a hidden payload?"""
    first = carrier.find(_FRAME)
    return first != -1 and carrier.find(_FRAME, first + 1) != -1


def strip_hidden(carrier: str) -> str:
    """Return the carrier with all zero-width/framing characters removed."""
    return "".join(ch for ch in carrier if ch not in _ALL_HIDDEN)
