"""HushLine -- hide an encrypted message inside an ordinary-looking one.

High-level flow:

    carrier = conceal("meet me at 8", code, cover="hey how's your vacation?")
    # paste `carrier` into iMessage; it looks like the cover text.

    secret = recover(received_text, code)  # -> "meet me at 8"

The content is protected by AES-256-GCM (see :mod:`hushline.crypto`); the fact
that there *is* a hidden message is disguised by zero-width steganography (see
:mod:`hushline.stego`).
"""

from __future__ import annotations

from . import codes, crypto, stego
from .crypto import DecryptionError
from .stego import StegoError

__all__ = [
    "conceal",
    "recover",
    "is_carrier",
    "DecryptionError",
    "StegoError",
    "codes",
    "crypto",
    "stego",
]

__version__ = "0.1.0"

DEFAULT_COVER = "hey! how's your vacation going?"


def conceal(secret_message: str, code: str, cover: str = DEFAULT_COVER) -> str:
    """Encrypt ``secret_message`` under ``code`` and hide it inside ``cover``.

    Returns carrier text that displays as ``cover`` but contains the encrypted
    payload. Paste it into any chat app that preserves text verbatim.
    """
    blob = crypto.encrypt(secret_message, code)
    return stego.hide(blob, cover)


def recover(carrier: str, code: str) -> str:
    """Extract and decrypt the hidden message from ``carrier``.

    Raises :class:`StegoError` if there is no hidden payload, or
    :class:`DecryptionError` if the code is wrong / the message was altered.
    """
    blob = stego.reveal(carrier)
    return crypto.decrypt(blob, code)


def is_carrier(text: str) -> bool:
    """True if ``text`` appears to carry a hidden HushLine payload."""
    return stego.has_hidden_payload(text)
