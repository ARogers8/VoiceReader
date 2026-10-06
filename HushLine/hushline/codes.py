"""Generate shared codes that both devices enter once to pair.

A "code" is just a strong shared secret. Two formats are offered:

* ``words``  -- a passphrase of random words (easy to read aloud / type once).
* ``base32`` -- a compact random string (higher entropy per character).

Both draw from :func:`os.urandom` via :mod:`secrets`, so they are suitable as
cryptographic secrets. The words list below is a small, dependency-free set of
short, unambiguous English words; it is intentionally plain.
"""

from __future__ import annotations

import base64
import secrets

# A compact, readable word list. Not the full EFF list, but each word is short,
# lowercase, and unambiguous. With ~240 words, each word adds ~7.9 bits; the
# default 6-word code carries ~47 bits, and you can ask for more.
_WORDS = [
    "amber", "anchor", "apple", "arrow", "atlas", "aurora", "autumn", "badge",
    "bamboo", "banjo", "basil", "beacon", "bishop", "bison", "blossom", "bolt",
    "bonsai", "breeze", "bronze", "bubble", "cabin", "cactus", "camel", "candle",
    "canyon", "cedar", "cello", "cherry", "chess", "cider", "cinder", "clay",
    "clever", "clover", "cobalt", "comet", "copper", "coral", "cosmos", "cotton",
    "crayon", "creek", "crisp", "crown", "crystal", "cue", "dawn", "daisy",
    "delta", "denim", "diamond", "dolphin", "domino", "dove", "dragon", "dune",
    "eagle", "echo", "ember", "emerald", "falcon", "fawn", "feather", "fern",
    "fiddle", "finch", "flame", "flint", "flora", "forest", "fox", "frost",
    "galaxy", "garden", "gecko", "ginger", "glacier", "glider", "gold", "granite",
    "grape", "grove", "hallow", "harbor", "harvest", "hazel", "heron", "hickory",
    "honey", "hornet", "ivory", "jade", "jasmine", "jester", "jewel", "jungle",
    "juniper", "kayak", "kelp", "kernel", "kestrel", "kite", "koala", "lagoon",
    "lantern", "lark", "laurel", "lemon", "lily", "linen", "lotus", "lunar",
    "lynx", "magnet", "mango", "maple", "marble", "meadow", "melody", "mesa",
    "meteor", "mint", "misty", "monarch", "moss", "nebula", "nectar", "needle",
    "nickel", "nimbus", "noble", "north", "nova", "oak", "oasis", "ocean",
    "olive", "onyx", "opal", "orbit", "orchid", "osprey", "otter", "oyster",
    "panda", "pearl", "pebble", "pepper", "petal", "pigeon", "pine", "pixel",
    "plum", "pond", "poppy", "prairie", "prism", "pumpkin", "quartz", "quill",
    "quilt", "quiver", "radiant", "raven", "reef", "ribbon", "ridge", "river",
    "robin", "rocket", "rose", "ruby", "rustic", "saffron", "sage", "salmon",
    "sand", "sapphire", "satin", "scarlet", "sequoia", "shadow", "shell", "shore",
    "silver", "sketch", "slate", "sleet", "snow", "solar", "sparrow", "spice",
    "spruce", "stardust", "stone", "storm", "stream", "summit", "sunset", "swan",
    "sycamore", "tango", "tapir", "teal", "tempo", "thistle", "thunder", "tide",
    "timber", "topaz", "torch", "trellis", "trout", "tulip", "tundra", "turquoise",
    "umber", "unity", "valley", "velvet", "vine", "violet", "vortex", "walnut",
    "wander", "willow", "winter", "wisp", "wolf", "wren", "zenith", "zephyr",
]


def generate_word_code(words: int = 6, separator: str = "-") -> str:
    """Return a passphrase of ``words`` random words joined by ``separator``."""
    if words < 1:
        raise ValueError("words must be >= 1")
    return separator.join(secrets.choice(_WORDS) for _ in range(words))


def generate_base32_code(num_bytes: int = 20) -> str:
    """Return a compact base32 code carrying ``num_bytes`` of entropy."""
    if num_bytes < 1:
        raise ValueError("num_bytes must be >= 1")
    raw = secrets.token_bytes(num_bytes)
    return base64.b32encode(raw).decode("ascii").rstrip("=").lower()


def generate_code(kind: str = "words", **kwargs) -> str:
    """Dispatch helper used by the CLI. ``kind`` is 'words' or 'base32'."""
    if kind == "words":
        return generate_word_code(**kwargs)
    if kind == "base32":
        return generate_base32_code(**kwargs)
    raise ValueError(f"unknown code kind: {kind!r}")
