"""Command-line interface for HushLine.

Examples
--------
Generate a code and share it with the other device (in person / over a channel
you already trust)::

    $ hushline newcode
    willow-ember-quartz-otter-lantern-reef

Save the code so you don't retype it every time (stored at ~/.hushline/code,
readable only by you)::

    $ hushline setcode willow-ember-quartz-otter-lantern-reef

Hide a secret message inside an innocent cover and copy the result into your
chat app::

    $ hushline hide "meet me at 8" --cover "hey how's your vacation?"

Reveal a message you received (paste it on stdin or pass it as an argument)::

    $ hushline reveal "hey how's your vacation?"

Run the background watcher that transparently reveals incoming carriers and
re-hides anything you prefix with the trigger as you copy it::

    $ hushline watch
"""

from __future__ import annotations

import argparse
import os
import stat
import sys
from pathlib import Path

from . import DecryptionError, StegoError, codes, conceal, is_carrier, recover

_CONFIG_DIR = Path(os.path.expanduser("~")) / ".hushline"
_CODE_FILE = _CONFIG_DIR / "code"
_ENV_VAR = "HUSHLINE_CODE"


def _load_code(explicit: str | None) -> str:
    """Resolve the code from --code, the env var, or the saved file."""
    if explicit:
        return explicit
    env = os.environ.get(_ENV_VAR)
    if env:
        return env
    if _CODE_FILE.exists():
        return _CODE_FILE.read_text(encoding="utf-8").strip()
    raise SystemExit(
        "No code available. Pass --code, set $%s, or run 'hushline setcode'."
        % _ENV_VAR
    )


def _save_code(code: str) -> None:
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    _CODE_FILE.write_text(code.strip() + "\n", encoding="utf-8")
    try:
        os.chmod(_CODE_FILE, stat.S_IRUSR | stat.S_IWUSR)  # 0600
    except OSError:
        pass  # best effort on platforms without POSIX perms


def _read_text_arg(value: str | None) -> str:
    """Use the positional argument if given, otherwise read all of stdin."""
    if value is not None:
        return value
    data = sys.stdin.read()
    return data.rstrip("\n")


def cmd_newcode(args: argparse.Namespace) -> int:
    if args.kind == "words":
        print(codes.generate_word_code(words=args.words))
    else:
        print(codes.generate_base32_code(num_bytes=args.bytes))
    return 0


def cmd_setcode(args: argparse.Namespace) -> int:
    code = args.code if args.code is not None else sys.stdin.read().strip()
    if not code:
        print("refusing to save an empty code", file=sys.stderr)
        return 1
    _save_code(code)
    print(f"Saved code to {_CODE_FILE} (keep this file private).")
    return 0


def cmd_hide(args: argparse.Namespace) -> int:
    code = _load_code(args.code)
    message = _read_text_arg(args.message)
    if not message:
        print("nothing to hide (empty message)", file=sys.stderr)
        return 1
    print(conceal(message, code, cover=args.cover))
    return 0


def cmd_reveal(args: argparse.Namespace) -> int:
    code = _load_code(args.code)
    carrier = _read_text_arg(args.carrier)
    try:
        print(recover(carrier, code))
    except StegoError:
        print("No hidden message found in that text.", file=sys.stderr)
        return 2
    except DecryptionError:
        print("Wrong code, or the message was altered.", file=sys.stderr)
        return 3
    return 0


def cmd_watch(args: argparse.Namespace) -> int:
    code = _load_code(args.code)
    # Imported lazily so the rest of the CLI works without pyperclip installed.
    from .watcher import run_watcher

    return run_watcher(code, cover=args.cover, trigger=args.trigger,
                       interval=args.interval)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="hushline",
        description="Hide an encrypted message inside an ordinary-looking one.",
    )
    p.add_argument("--code", help="shared code (overrides env var and saved file)")
    sub = p.add_subparsers(dest="command", required=True)

    pc = sub.add_parser("newcode", help="generate a new shared code")
    pc.add_argument("--kind", choices=["words", "base32"], default="words")
    pc.add_argument("--words", type=int, default=6, help="word count (words kind)")
    pc.add_argument("--bytes", type=int, default=20, help="entropy bytes (base32)")
    pc.set_defaults(func=cmd_newcode)

    ps = sub.add_parser("setcode", help="save a shared code to ~/.hushline/code")
    ps.add_argument("code", nargs="?", help="code to save (or read from stdin)")
    ps.set_defaults(func=cmd_setcode)

    ph = sub.add_parser("hide", help="encrypt a message and hide it in cover text")
    ph.add_argument("message", nargs="?", help="secret message (or read from stdin)")
    ph.add_argument("--cover", default="hey! how's your vacation going?",
                    help="innocent-looking text the message will hide inside")
    ph.set_defaults(func=cmd_hide)

    pr = sub.add_parser("reveal", help="recover a hidden message from carrier text")
    pr.add_argument("carrier", nargs="?", help="received text (or read from stdin)")
    pr.set_defaults(func=cmd_reveal)

    pw = sub.add_parser("watch", help="background clipboard watcher")
    pw.add_argument("--cover", default="hey! how's your vacation going?")
    pw.add_argument("--trigger", default=">>",
                    help="prefix you type before secret text to auto-hide it")
    pw.add_argument("--interval", type=float, default=0.7,
                    help="clipboard poll interval in seconds")
    pw.set_defaults(func=cmd_watch)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
