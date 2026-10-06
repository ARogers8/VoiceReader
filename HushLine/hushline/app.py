"""HushLine desktop app: unlock with a code, pick a contact, send encrypted.

What it does, end to end:

1. You launch it and type your shared **encryption code** (nothing is sent or
   stored; it lives only in memory for this session).
2. You pick a contact you've added (name + iMessage phone/email).
3. You type a normal message and hit Send. HushLine encrypts it and hides it
   inside innocent cover text, then the Messages app sends it over iMessage
   automatically.
4. A background poller watches for replies; any that carry a hidden HushLine
   payload are decrypted and shown in the conversation. Everything else is
   ignored.

macOS only (that's where iMessage and its automation live). Tkinter ships with
the python.org macOS build, so there's nothing extra to install for the UI.

Run it with::

    hushline-app        # or:  python -m hushline.app
"""

from __future__ import annotations

import queue
import threading
import time
from dataclasses import dataclass, field

from . import DecryptionError, StegoError, conceal, recover
from . import imessage
from .contacts import Contact, ContactBook

POLL_INTERVAL = 2.0  # seconds between chat.db checks
DEFAULT_COVER = "hey! how's your vacation going?"


@dataclass
class ChatLog:
    """In-memory conversation history, keyed per contact name."""

    by_contact: dict[str, list[tuple[str, str]]] = field(default_factory=dict)

    def add(self, contact_name: str, who: str, text: str) -> None:
        self.by_contact.setdefault(contact_name, []).append((who, text))

    def get(self, contact_name: str) -> list[tuple[str, str]]:
        return self.by_contact.get(contact_name, [])


class _Poller(threading.Thread):
    """Background thread: reveal incoming hidden messages, push to a queue.

    Runs the chat.db reader on an interval and places
    ``(handle, revealed_text, status)`` tuples on ``out_queue`` for the GUI.
    status is 'ok', 'wrong_code', or 'error'.
    """

    def __init__(self, get_code, get_handles, out_queue: queue.Queue):
        super().__init__(daemon=True)
        self._get_code = get_code
        self._get_handles = get_handles
        self._out = out_queue
        self._stop = threading.Event()
        self._reader = imessage.MessagesReader()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        if not self._reader.available():
            self._out.put(("", "", "no_db"))
            return
        while not self._stop.is_set():
            try:
                msgs = self._reader.new_messages(self._get_handles())
            except imessage.IMessageError:
                self._out.put(("", "", "error"))
                self._stop.wait(POLL_INTERVAL)
                continue
            code = self._get_code()
            for m in msgs:
                try:
                    revealed = recover(m.text, code)
                except StegoError:
                    continue  # a normal (non-HushLine) message; ignore it
                except DecryptionError:
                    self._out.put((m.handle, "", "wrong_code"))
                    continue
                self._out.put((m.handle, revealed, "ok"))
            self._stop.wait(POLL_INTERVAL)


def _handle_matches_contact(handle: str, contact: Contact) -> bool:
    return imessage._handles_match(handle, contact.phone)


class HushLineApp:
    def __init__(self, tk, ttk, messagebox, simpledialog):
        self.tk = tk
        self.ttk = ttk
        self.messagebox = messagebox
        self.simpledialog = simpledialog

        self.code: str | None = None
        self.cover = DEFAULT_COVER
        self.contacts = ContactBook()
        self.log = ChatLog()
        self.current: Contact | None = None
        self.incoming: queue.Queue = queue.Queue()
        self.poller: _Poller | None = None

        self.root = tk.Tk()
        self.root.title("HushLine")
        self.root.geometry("760x520")
        self._build_lock_screen()

    # ---------------------------------------------------------------- lock

    def _build_lock_screen(self) -> None:
        self.lock = self.ttk.Frame(self.root, padding=40)
        self.lock.pack(fill="both", expand=True)

        self.ttk.Label(self.lock, text="HushLine",
                       font=("Helvetica", 24, "bold")).pack(pady=(10, 4))
        self.ttk.Label(
            self.lock,
            text="Enter the shared encryption code.\n"
                 "Both devices must use the exact same code.",
            justify="center",
        ).pack(pady=(0, 16))

        self.code_var = self.tk.StringVar()
        entry = self.ttk.Entry(self.lock, textvariable=self.code_var,
                               show="•", width=40)
        entry.pack()
        entry.focus_set()
        entry.bind("<Return>", lambda _e: self._unlock())

        self.ttk.Button(self.lock, text="Unlock", command=self._unlock).pack(
            pady=14)

        if not imessage.is_supported():
            self.ttk.Label(
                self.lock,
                text="Note: iMessage send/receive only works on macOS. "
                     "You can explore the interface here, but messages won't "
                     "actually be sent.",
                foreground="#b00", wraplength=420, justify="center",
            ).pack(pady=(8, 0))

    def _unlock(self) -> None:
        code = self.code_var.get().strip()
        if not code:
            self.messagebox.showwarning("HushLine", "Please enter a code.")
            return
        self.code = code
        self.lock.destroy()
        self._build_main()
        self._start_poller()

    # ---------------------------------------------------------------- main

    def _build_main(self) -> None:
        bar = self.ttk.Frame(self.root, padding=(8, 6))
        bar.pack(fill="x")
        self.ttk.Button(bar, text="+ Add contact",
                        command=self._add_contact).pack(side="left")
        self.ttk.Button(bar, text="Cover text…",
                        command=self._edit_cover).pack(side="left", padx=6)
        self.status = self.ttk.Label(bar, text="", foreground="#555")
        self.status.pack(side="right")

        body = self.ttk.Frame(self.root)
        body.pack(fill="both", expand=True)

        # Left: contact list.
        left = self.ttk.Frame(body, width=200)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)
        self.contact_list = self.tk.Listbox(left, activestyle="none")
        self.contact_list.pack(fill="both", expand=True, padx=6, pady=6)
        self.contact_list.bind("<<ListboxSelect>>", self._on_select_contact)

        # Right: conversation + composer.
        right = self.ttk.Frame(body)
        right.pack(side="left", fill="both", expand=True)

        self.convo = self.tk.Text(right, state="disabled", wrap="word",
                                  padx=10, pady=10)
        self.convo.pack(fill="both", expand=True)
        self.convo.tag_configure("me", foreground="#0a60c2",
                                 font=("Helvetica", 11, "bold"))
        self.convo.tag_configure("them", foreground="#1a7f37",
                                 font=("Helvetica", 11, "bold"))
        self.convo.tag_configure("sys", foreground="#888",
                                 font=("Helvetica", 10, "italic"))

        composer = self.ttk.Frame(right, padding=(6, 6))
        composer.pack(fill="x")
        self.msg_var = self.tk.StringVar()
        entry = self.ttk.Entry(composer, textvariable=self.msg_var)
        entry.pack(side="left", fill="x", expand=True)
        entry.bind("<Return>", lambda _e: self._send())
        self.ttk.Button(composer, text="Send", command=self._send).pack(
            side="left", padx=(6, 0))

        self._refresh_contacts()
        self.root.after(200, self._drain_incoming)

    def _refresh_contacts(self) -> None:
        self.contact_list.delete(0, "end")
        for c in self.contacts.list():
            self.contact_list.insert("end", c.name)

    def _add_contact(self) -> None:
        name = self.simpledialog.askstring("Add contact", "Name:",
                                           parent=self.root)
        if not name:
            return
        phone = self.simpledialog.askstring(
            "Add contact", "iMessage phone (e.g. +15551234567) or Apple ID:",
            parent=self.root)
        if not phone:
            return
        try:
            self.contacts.add(name, phone)
        except ValueError as exc:
            self.messagebox.showerror("HushLine", str(exc))
            return
        self._refresh_contacts()

    def _edit_cover(self) -> None:
        new = self.simpledialog.askstring(
            "Cover text",
            "Innocent text your messages will appear as:",
            initialvalue=self.cover, parent=self.root)
        if new:
            self.cover = new

    def _on_select_contact(self, _event) -> None:
        sel = self.contact_list.curselection()
        if not sel:
            return
        name = self.contact_list.get(sel[0])
        self.current = self.contacts.find_by_name(name)
        self._render_convo()

    def _render_convo(self) -> None:
        self.convo.configure(state="normal")
        self.convo.delete("1.0", "end")
        if self.current:
            for who, text in self.log.get(self.current.name):
                if who == "me":
                    self.convo.insert("end", "You: ", "me")
                elif who == "them":
                    self.convo.insert("end", f"{self.current.name}: ", "them")
                else:
                    self.convo.insert("end", "", "sys")
                tag = "sys" if who == "sys" else ()
                self.convo.insert("end", text + "\n", tag)
        self.convo.configure(state="disabled")
        self.convo.see("end")

    def _append(self, contact_name: str, who: str, text: str) -> None:
        self.log.add(contact_name, who, text)
        if self.current and self.current.name == contact_name:
            self._render_convo()

    # ---------------------------------------------------------------- send

    def _send(self) -> None:
        if not self.current:
            self.messagebox.showinfo("HushLine", "Pick a contact first.")
            return
        message = self.msg_var.get().strip()
        if not message:
            return
        try:
            carrier = conceal(message, self.code, cover=self.cover)
        except Exception as exc:  # pragma: no cover - defensive
            self.messagebox.showerror("HushLine", f"Encryption failed: {exc}")
            return

        if imessage.is_supported():
            try:
                imessage.send_imessage(self.current.phone, carrier)
            except imessage.IMessageError as exc:
                self.messagebox.showerror("Could not send", str(exc))
                return
        else:
            self._append(self.current.name, "sys",
                         "(demo: not on macOS, message not actually sent)")

        self._append(self.current.name, "me", message)
        self.msg_var.set("")

    # ------------------------------------------------------------- receive

    def _start_poller(self) -> None:
        self.poller = _Poller(
            get_code=lambda: self.code,
            get_handles=lambda: self.contacts.handles(),
            out_queue=self.incoming,
        )
        self.poller.start()

    def _drain_incoming(self) -> None:
        try:
            while True:
                handle, text, status = self.incoming.get_nowait()
                self._handle_incoming(handle, text, status)
        except queue.Empty:
            pass
        self.root.after(300, self._drain_incoming)

    def _handle_incoming(self, handle: str, text: str, status: str) -> None:
        if status == "no_db":
            self.status.configure(
                text="Reading received messages needs Full Disk Access.")
            return
        if status == "error":
            self.status.configure(text="Waiting for Messages database…")
            return

        contact = next(
            (c for c in self.contacts.list()
             if _handle_matches_contact(handle, c)), None)
        name = contact.name if contact else handle

        if status == "wrong_code":
            self._append(name, "sys",
                         "(a hidden message arrived but the code didn't match)")
            return
        self.status.configure(text="")
        self._append(name, "them", text)

    # ---------------------------------------------------------------- run

    def run(self) -> None:
        self.root.mainloop()
        if self.poller:
            self.poller.stop()


def main() -> int:
    try:
        import tkinter as tk
        from tkinter import ttk, messagebox, simpledialog
    except Exception:
        print("Tkinter is not available. On macOS, use the python.org build "
              "of Python, which bundles Tk.")
        return 1
    HushLineApp(tk, ttk, messagebox, simpledialog).run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
