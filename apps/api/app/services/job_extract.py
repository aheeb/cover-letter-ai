from __future__ import annotations

import re


def guess_role_from_markdown(markdown: str) -> str | None:
    """
    Best-effort role/title extraction from Firecrawl markdown.

    This is intentionally simple for the MVP:
    - Prefer first H1/H2 heading (`# ...` / `## ...`)
    - Otherwise, use first non-empty line (short)
    """
    lines = [ln.strip() for ln in markdown.splitlines()]

    for ln in lines:
        if ln.startswith("#"):
            title = ln.lstrip("#").strip()
            if title:
                return _clean_title(title)

    for ln in lines:
        if ln:
            # avoid huge paragraphs; only accept short-ish first lines
            if len(ln) <= 120:
                return _clean_title(ln)
            break

    return None


def _clean_title(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    return value


