"""Simple on-disk contact book: name + iMessage handle (phone or email).

Stored as JSON at ``~/.hushline/contacts.json``. This holds no secrets (the
encryption code is never written here), just who you message.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

_CONFIG_DIR = Path(os.path.expanduser("~")) / ".hushline"
_CONTACTS_FILE = _CONFIG_DIR / "contacts.json"


@dataclass
class Contact:
    name: str
    phone: str  # phone number (E.164 preferred) or Apple ID email


class ContactBook:
    def __init__(self, path: Path = _CONTACTS_FILE):
        self.path = Path(path)
        self._contacts: list[Contact] = []
        self.load()

    def load(self) -> None:
        self._contacts = []
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        for item in data.get("contacts", []):
            name = str(item.get("name", "")).strip()
            phone = str(item.get("phone", "")).strip()
            if name and phone:
                self._contacts.append(Contact(name=name, phone=phone))

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"contacts": [asdict(c) for c in self._contacts]}
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def list(self) -> list[Contact]:
        return list(self._contacts)

    def add(self, name: str, phone: str) -> Contact:
        name, phone = name.strip(), phone.strip()
        if not name or not phone:
            raise ValueError("name and phone are both required")
        existing = self.find_by_name(name)
        if existing:
            existing.phone = phone
        else:
            existing = Contact(name=name, phone=phone)
            self._contacts.append(existing)
        self.save()
        return existing

    def remove(self, name: str) -> bool:
        before = len(self._contacts)
        self._contacts = [c for c in self._contacts if c.name != name]
        if len(self._contacts) != before:
            self.save()
            return True
        return False

    def find_by_name(self, name: str) -> Contact | None:
        for c in self._contacts:
            if c.name == name:
                return c
        return None

    def handles(self) -> list[str]:
        return [c.phone for c in self._contacts]
