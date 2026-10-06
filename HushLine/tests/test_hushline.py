import pytest

from hushline import conceal, recover, is_carrier
from hushline import crypto, stego, codes
from hushline.crypto import DecryptionError
from hushline.stego import StegoError


# ---------------------------------------------------------------- crypto layer

def test_encrypt_decrypt_roundtrip():
    code = "willow-ember-quartz"
    blob = crypto.encrypt("the real message", code)
    assert crypto.decrypt(blob, code) == "the real message"


def test_wrong_code_fails():
    blob = crypto.encrypt("secret", "right-code")
    with pytest.raises(DecryptionError):
        crypto.decrypt(blob, "wrong-code")


def test_tampering_is_detected():
    blob = bytearray(crypto.encrypt("secret", "code"))
    blob[-1] ^= 0x01  # flip a bit in the GCM tag
    with pytest.raises(DecryptionError):
        crypto.decrypt(bytes(blob), "code")


def test_header_tamper_is_detected():
    blob = bytearray(crypto.encrypt("secret", "code"))
    blob[5] ^= 0x01  # flip a bit inside the salt (part of authenticated header)
    with pytest.raises(DecryptionError):
        crypto.decrypt(bytes(blob), "code")


def test_each_message_uses_fresh_salt_and_nonce():
    a = crypto.encrypt("same", "code")
    b = crypto.encrypt("same", "code")
    assert a != b  # random salt + nonce -> different ciphertext


def test_empty_code_rejected():
    with pytest.raises(ValueError):
        crypto.encrypt("x", "")


def test_unicode_message():
    code = "code"
    msg = "déjà vu 🤫 — meet @ café"
    assert crypto.decrypt(crypto.encrypt(msg, code), code) == msg


# ---------------------------------------------------------------- stego layer

def test_stego_roundtrip_preserves_payload():
    payload = b"\x00\x01\x02\xff\xfe some bytes"
    carrier = stego.hide(payload, "hey how's your vacation?")
    assert stego.reveal(carrier) == payload


def test_carrier_visible_text_matches_cover():
    cover = "hey how's your vacation?"
    carrier = stego.hide(b"abc", cover)
    assert stego.strip_hidden(carrier) == cover


def test_cover_with_no_space():
    carrier = stego.hide(b"hi", "yo")
    assert stego.reveal(carrier) == b"hi"


def test_reveal_without_payload_raises():
    with pytest.raises(StegoError):
        stego.reveal("just a normal message")


def test_has_hidden_payload():
    assert not stego.has_hidden_payload("plain text")
    assert stego.has_hidden_payload(stego.hide(b"x", "plain text"))


# ------------------------------------------------------------- combined API

def test_conceal_recover_roundtrip():
    code = codes.generate_word_code(words=4)
    carrier = conceal("meet me at 8", code, cover="hey how's your vacation?")
    assert is_carrier(carrier)
    assert recover(carrier, code) == "meet me at 8"


def test_recover_with_wrong_code():
    carrier = conceal("meet me at 8", "right", cover="hi there")
    with pytest.raises(DecryptionError):
        recover(carrier, "wrong")


def test_carrier_reads_as_cover_text():
    cover = "hey! how's your vacation going?"
    carrier = conceal("exfiltration is not the point here", "code", cover=cover)
    assert stego.strip_hidden(carrier) == cover


# ------------------------------------------------------------- code generation

def test_word_code_shape():
    code = codes.generate_word_code(words=6)
    assert len(code.split("-")) == 6


def test_base32_code_is_nonempty_and_lower():
    code = codes.generate_base32_code(num_bytes=20)
    assert code and code == code.lower()


def test_codes_are_random():
    assert codes.generate_word_code() != codes.generate_word_code()
