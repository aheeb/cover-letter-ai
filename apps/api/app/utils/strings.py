from __future__ import annotations

import re
import unicodedata


def ascii_slug(value: str) -> str:
    """
    Convert a string into a safe ASCII-ish slug for filenames.
    """
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_value = ascii_value.strip()
    ascii_value = re.sub(r"[^A-Za-z0-9]+", "_", ascii_value)
    ascii_value = ascii_value.strip("_")
    return ascii_value or "X"


