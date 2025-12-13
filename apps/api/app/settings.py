from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.paths import default_template_path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # Comma-separated list of allowed origins for local dev, e.g.:
    # API_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
    #
    # Keep this as a string (not list) so `.env` can be a simple comma-separated value
    # without requiring JSON parsing.
    api_cors_origins: str | None = Field(default=None)

    # Optional regex for allowing dynamic origins (e.g. Vercel preview deploy URLs).
    # Example:
    # API_CORS_ORIGIN_REGEX=^https://cover-letter-ai-beta(-[a-z0-9-]+)?\.vercel\.app$
    api_cors_origin_regex: str | None = Field(default=None)

    # LLM / OpenAI
    openai_api_key: str | None = Field(default=None)
    openai_model: str = Field(default="gpt-5-mini")

    # Firecrawl
    firecrawl_api_key: str | None = Field(default=None)

    # DOCX rendering
    template_path: str | None = Field(default=None, description="Path to template.docx")
    recipient_address_indent_cm: float | None = Field(default=None)

    # Safety / robustness
    request_timeout_seconds: float = Field(default=30.0)
    max_cv_pdf_bytes: int = Field(default=8_000_000)  # ~8 MB
    max_job_text_chars: int = Field(default=25_000)

    @classmethod
    def from_env(cls) -> "Settings":
        """
        Read settings from environment variables.

        - `API_CORS_ORIGINS` can be a comma-separated list of URLs.
        """
        # Note: actual parsing into a list happens in `main.py`.
        return cls()

    @property
    def cors_origins_list(self) -> list[str]:
        raw = self.api_cors_origins
        if not raw:
            return []
        return [part.strip() for part in raw.split(",") if part.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        raw = self.api_cors_origin_regex
        if not raw:
            return None
        raw = raw.strip()
        return raw or None

    @property
    def template_path_resolved(self) -> Path:
        if self.template_path:
            return Path(self.template_path)
        return default_template_path()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()


