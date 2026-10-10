"""Natural-sounding cover messages, rotated so the chat looks like a real one.

Every message you send is disguised as one of these ordinary texts. Instead of
repeating a single line, :func:`next_cover` serves a different one each time and
avoids reusing anything from the recent window, so to anyone glancing at the
conversation it reads like a normal, flowing chat.
"""

from __future__ import annotations

import random

# A grab-bag of short, everyday texts that fit into almost any conversation --
# greetings, reactions, logistics, small talk. Intentionally mundane.
COVERS = [
    "hey! how's your vacation going?",
    "lol that's so funny",
    "omg no way",
    "running a few mins late, be there soon",
    "did you see the game last night?",
    "wyd rn",
    "sounds good to me",
    "haha yeah for sure",
    "ok cool, see you then",
    "ugh today was so long",
    "what time are we meeting?",
    "did you eat yet?",
    "i'm so tired lol",
    "that movie was actually really good",
    "wait what happened?",
    "can't wait for the weekend",
    "just got home",
    "yeah i'll let you know",
    "aww that's sweet",
    "nooo really??",
    "let me check and get back to you",
    "sorry just saw this",
    "lmaooo stop",
    "k sounds like a plan",
    "how was your day?",
    "i might be a little late",
    "did you finish that thing?",
    "we should hang out soon",
    "it's so cold out today",
    "grabbing coffee, want anything?",
    "on my way now",
    "call me when you're free",
    "that's crazy",
    "happy birthday!! 🎉",
    "miss you!",
    "you free this weekend?",
    "just woke up lol",
    "almost there",
    "thanks so much!",
    "no worries at all",
    "same haha",
    "let's do it",
    "i'll be there in 10",
    "what are you up to later?",
    "that sounds amazing",
    "ok talk soon",
    "did you get my email?",
    "can you believe this weather",
    "good morning!",
    "goodnight, talk tomorrow",
]

_RECENT_WINDOW = 15
_recent: list[str] = []


def next_cover() -> str:
    """Return a cover message, avoiding ones used in the recent window."""
    choices = [c for c in COVERS if c not in _recent]
    if not choices:  # window larger than list (shouldn't happen) -> reset
        choices = list(COVERS)
        _recent.clear()
    pick = random.choice(choices)
    _recent.append(pick)
    if len(_recent) > _RECENT_WINDOW:
        _recent.pop(0)
    return pick
