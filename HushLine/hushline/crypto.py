"""Authenticated symmetric encryption for HushLine.

The real (secret) message is encrypted with AES-256-GCM. The 256-bit key is
derived from a human-sharable *code* with scrypt, using a fresh random salt for
every message, so two devices that hold the same code can read each other's
messages and nobody else can.

Wire format of an encrypted blob (all concatenated, then handed to the stego
layer as raw bytes):

    magic   "HL"      2 bytes   format marker
    version 0x01      1 byte
    salt              16 bytes  random, per message (scrypt salt)
    nonce             12 bytes  random, per message (GCM nonce)
    ciphertext+tag    N bytes   AES-256-GCM output (tag is the trailing 16 bytes)

Nothing here is secret except the code. The salt and nonce are meant to travel
in the clear alongside the ciphertext.
"""

from __future__ import annotations

import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"HL"
VERSION = 1

_SALT_LEN = 16
_NONCE_LEN = 12
_KEY_LEN = 32  # AES-256

# scrypt cost parameters. N must be a power of two. These give a derivation that
# takes a few tens of milliseconds on a laptop -- cheap enough to be invisible
# per message, expensive enough to slow brute-forcing of a weak code.
_SCRYPT_N = 2 ** 15
_SCRYPT_R = 8
_SCRYPT_P = 1
# scrypt needs ~128 * N * r bytes (32 MiB here). OpenSSL's default cap is 32 MiB
# and rejects anything at or above it, so give the derivation explicit headroom.
_SCRYPT_MAXMEM = 128 * _SCRYPT_N * _SCRYPT_R * 2


class DecryptionError(Exception):
    """Raised when a blob cannot be authenticated or decrypted.

    This covers a wrong code, a corrupted/truncated blob, or a message that was
    tampered with in transit. We deliberately do not distinguish between these
    cases in the message, to avoid leaking which code-guess was "closer".
    """


def _derive_key(code: str, salt: bytes) -> bytes:
    if not code:
        raise ValueError("code must not be empty")
    return hashlib.scrypt(
        code.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_KEY_LEN,
        maxmem=_SCRYPT_MAXMEM,
    )


def encrypt(plaintext: str, code: str) -> bytes:
    """Encrypt ``plaintext`` under ``code`` and return the raw blob."""
    salt = os.urandom(_SALT_LEN)
    nonce = os.urandom(_NONCE_LEN)
    key = _derive_key(code, salt)
    header = MAGIC + bytes([VERSION]) + salt + nonce
    # Bind the header into the authentication tag so salt/nonce/version can't be
    # swapped without the tag check failing.
    ct = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), header)
    return header + ct


def decrypt(blob: bytes, code: str) -> str:
    """Decrypt a blob produced by :func:`encrypt`. Raises DecryptionError."""
    min_len = len(MAGIC) + 1 + _SALT_LEN + _NONCE_LEN + 16
    if len(blob) < min_len:
        raise DecryptionError("blob too short")
    if blob[: len(MAGIC)] != MAGIC:
        raise DecryptionError("not a HushLine blob")

    offset = len(MAGIC)
    version = blob[offset]
    offset += 1
    if version != VERSION:
        raise DecryptionError(f"unsupported version {version}")

    salt = blob[offset : offset + _SALT_LEN]
    offset += _SALT_LEN
    nonce = blob[offset : offset + _NONCE_LEN]
    offset += _NONCE_LEN
    header = blob[:offset]
    ct = blob[offset:]

    key = _derive_key(code, salt)
    try:
        pt = AESGCM(key).decrypt(nonce, ct, header)
    except InvalidTag as exc:
        raise DecryptionError("wrong code or corrupted message") from exc
    return pt.decode("utf-8")
