from __future__ import annotations

from typing import Any

from exa_py import Exa


class ExaError(RuntimeError):
    pass


class ExaTextService:
    def __init__(self, api_key: str):
        self._client = Exa(api_key=api_key)

    def scrape_text(self, url: str) -> str:
        """
        Fetch content from a URL using Exa's get_contents API.

        Returns the text content of the page.
        """
        result = self._client.get_contents(
            [url],
            text=True,
        )
        text = _extract_text(result)
        if not text.strip():
            raise ExaError("Exa returned no text content.")
        return text.strip()


def _extract_text(result: Any) -> str:
    """
    Extract text from Exa get_contents response.

    The response has a `results` list where each item has a `text` attribute.
    """
    # Handle SearchResponse object
    results = getattr(result, "results", None)
    if results is None and isinstance(result, dict):
        results = result.get("results")

    if not results:
        return ""

    first_result = results[0] if results else None
    if first_result is None:
        return ""

    # Get text from result object or dict
    if isinstance(first_result, dict):
        text = first_result.get("text")
        return text if isinstance(text, str) else ""

    text = getattr(first_result, "text", None)
    if isinstance(text, str):
        return text

    return ""
