from __future__ import annotations

from typing import Any

from firecrawl import Firecrawl


class FirecrawlError(RuntimeError):
    pass


class FirecrawlTextService:
    def __init__(self, api_key: str):
        self._client = Firecrawl(api_key=api_key)

    def scrape_markdown(self, url: str) -> str:
        """
        Scrape a URL and return markdown.

        Doc reference: Firecrawl v2 Python SDK uses `scrape(url, formats=[...])`.
        """
        result = self._client.scrape(url, formats=["markdown"])
        markdown = _extract_markdown(result)
        if not markdown.strip():
            raise FirecrawlError("Firecrawl returned no markdown.")
        return markdown.strip()


def _extract_markdown(result: Any) -> str:
    """
    Firecrawl v2 `scrape()` returns a `Document` (Pydantic model) in current SDK versions.
    Older docs/examples may show dict-like access.
    """
    if isinstance(result, dict):
        md = result.get("markdown")
        return md if isinstance(md, str) else ""

    md = getattr(result, "markdown", None)
    if isinstance(md, str):
        return md

    # Pydantic model_dump fallback
    model_dump = getattr(result, "model_dump", None)
    if callable(model_dump):
        dumped = model_dump()
        if isinstance(dumped, dict):
            md2 = dumped.get("markdown")
            return md2 if isinstance(md2, str) else ""

    return ""


