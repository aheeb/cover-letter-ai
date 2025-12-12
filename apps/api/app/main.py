from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.settings import get_settings
from app.routes.generate import router as generate_router
from app.routes.job_preview import router as job_preview_router


def _parse_cors_origins(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def create_app() -> FastAPI:
    # Local dev convenience: load `apps/api/.env` if present.
    # This keeps production behavior unchanged (real env vars still win by default).
    dotenv_path = Path(__file__).resolve().parents[1] / ".env"
    if dotenv_path.exists():
        load_dotenv(dotenv_path=dotenv_path, override=False)

    app = FastAPI(title="cover-letter-ai API", version="0.1.0")

    # CORS for local dev (e.g. Next.js on :3000)
    settings = get_settings()
    cors_origins = (
        _parse_cors_origins(os.getenv("API_CORS_ORIGINS") or settings.api_cors_origins)
    )
    # If nothing is configured, default to common local dev origins so the UI works out of the box.
    if not cors_origins:
        cors_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # Allow the frontend to read the downloaded filename from the response headers.
        expose_headers=["Content-Disposition"],
    )

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(generate_router)
    app.include_router(job_preview_router)

    return app


app = create_app()


