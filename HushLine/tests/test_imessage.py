import json

import pytest

from hushline import imessage
from hushline.contacts import ContactBook
from hushline.app import ChatLog, _handle_matches_contact
from hushline.contacts import Contact


# ----------------------------------------------------------- phone matching

@pytest.mark.parametrize("raw,expected", [
    ("+1 (555) 123-4567", "+15551234567"),
    ("555-123-4567", "5551234567"),
    ("  +15551234567 ", "+15551234567"),
    ("Friend@Example.COM", "friend@example.com"),
])
def test_normalize_phone(raw, expected):
    assert imessage.normalize_phone(raw) == expected


def test_handles_match_formatting_variants():
    assert imessage._handles_match("+1 (555) 123-4567", "+15551234567")
    assert imessage._handles_match("5551234567", "+1-555-123-4567")


def test_handles_do_not_match_different_numbers():
    assert not imessage._handles_match("+15551234567", "+15559999999")


def test_email_handles_match_case_insensitive():
    assert imessage._handles_match("Friend@Example.com", "friend@example.COM")


def test_handle_matches_contact():
    c = Contact(name="Alex", phone="+1 (555) 123-4567")
    assert _handle_matches_contact("+15551234567", c)
    assert not _handle_matches_contact("+15550000000", c)


# ----------------------------------------------------------- text extraction

def test_extract_text_prefers_plain_column():
    assert imessage._extract_text("hello", b"ignored") == "hello"


def test_extract_text_from_attributed_body():
    # Simulate an NSAttributedString archive carrying the human text.
    blob = b"\x04\x0bstreamtyped...NSString\x01+hidden message here\x86"
    out = imessage._extract_text(None, blob)
    assert "hidden message here" in out


def test_extract_text_empty():
    assert imessage._extract_text(None, None) == ""


# ------------------------------------------------------------------ contacts

def test_contactbook_add_list_remove(tmp_path):
    book = ContactBook(path=tmp_path / "contacts.json")
    book.add("Alex", "+15551234567")
    book.add("Sam", "sam@example.com")
    names = [c.name for c in book.list()]
    assert names == ["Alex", "Sam"]
    assert book.handles() == ["+15551234567", "sam@example.com"]
    assert book.remove("Alex")
    assert [c.name for c in book.list()] == ["Sam"]


def test_contactbook_persists(tmp_path):
    path = tmp_path / "contacts.json"
    ContactBook(path=path).add("Alex", "+15551234567")
    reloaded = ContactBook(path=path)
    assert reloaded.find_by_name("Alex").phone == "+15551234567"


def test_contactbook_add_updates_existing(tmp_path):
    book = ContactBook(path=tmp_path / "contacts.json")
    book.add("Alex", "+15551234567")
    book.add("Alex", "+15559999999")
    assert len(book.list()) == 1
    assert book.find_by_name("Alex").phone == "+15559999999"


def test_contactbook_rejects_empty(tmp_path):
    book = ContactBook(path=tmp_path / "contacts.json")
    with pytest.raises(ValueError):
        book.add("", "+15551234567")


def test_contactbook_ignores_corrupt_file(tmp_path):
    path = tmp_path / "contacts.json"
    path.write_text("not json", encoding="utf-8")
    assert ContactBook(path=path).list() == []


# -------------------------------------------------------------------- ChatLog

def test_chatlog_per_contact():
    log = ChatLog()
    log.add("Alex", "me", "hi")
    log.add("Alex", "them", "hey")
    log.add("Sam", "me", "yo")
    assert log.get("Alex") == [("me", "hi"), ("them", "hey")]
    assert log.get("Sam") == [("me", "yo")]
    assert log.get("Nobody") == []


# -------------------------------------------------------------- send guard

def test_send_rejected_off_macos(monkeypatch):
    monkeypatch.setattr(imessage, "is_supported", lambda: False)
    with pytest.raises(imessage.IMessageError):
        imessage.send_imessage("+15551234567", "hi")
