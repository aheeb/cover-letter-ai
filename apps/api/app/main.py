from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.errors import ApiError, api_error_response, log_api_error
from app.logging import configure_logging, get_logger, request_id_var
from app.routes.generate import router as generate_router
from app.routes.job_preview import router as job_preview_router
from app.settings import get_settings

def create_app() -> FastAPI:
    # Local dev convenience: load `apps/api/.env` if present.
    # This keeps production behavior unchanged (real env vars still win by default).
    dotenv_path = Path(__file__).resolve().parents[1] / ".env"
    if dotenv_path.exists():
        load_dotenv(dotenv_path=dotenv_path, override=False)

    configure_logging()

    app = FastAPI(title="cover-letter-ai API", version="0.1.0")

    # CORS for local dev (e.g. Next.js on :3000)
    settings = get_settings()
    cors_origins = settings.cors_origins_list
    cors_origin_regex = settings.cors_origin_regex
    # If nothing is configured, default to common local dev origins so the UI works out of the box.
    if not cors_origins:
        cors_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            # Vercel production + beta (exact)
            "https://cover-letter-ai.vercel.app",
            "https://cover-letter-ai-beta.vercel.app",
        ]

    # Support Vercel preview deploys (e.g. cover-letter-ai-beta-<hash>.vercel.app)
    if not cors_origin_regex:
        cors_origin_regex = r"^https://cover-letter-ai(-beta)?(-[a-z0-9-]+)?\.vercel\.app$"

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_origin_regex=cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # Allow the frontend to read the downloaded filename from the response headers.
        expose_headers=["Content-Disposition"],
    )

    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or str(uuid4())
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid
        return response

    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
        log_api_error(exc)
        return api_error_response(exc)

    @app.exception_handler(HTTPException)
    async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
        status = exc.status_code or 500
        err = ApiError(code="http_error", message=str(exc.detail), status_code=status)
        log_api_error(err)
        return api_error_response(err)

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger = get_logger("app.unexpected")
        logger.exception("Unhandled exception")
        err = ApiError(code="internal_error", message="Internal server error", status_code=500)
        return api_error_response(err)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(generate_router)
    app.include_router(job_preview_router)

    return app


app = create_app()


