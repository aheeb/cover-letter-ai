from __future__ import annotations

from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # Comma-separated list of allowed origins for local dev, e.g.:
    # API_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
    #
    # Keep this as a string (not list) so `.env` can be a simple comma-separated value
    # without requiring JSON parsing.
    api_cors_origins: str | None = Field(default=None)

    @classmethod
    def from_env(cls) -> "Settings":
        """
        Read settings from environment variables.

        - `API_CORS_ORIGINS` can be a comma-separated list of URLs.
        """
        # Note: actual parsing into a list happens in `main.py`.
        return cls()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()


