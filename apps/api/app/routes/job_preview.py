from __future__ import annotations

import anyio
from fastapi import APIRouter, Form

# AnyIO v4 removed `anyio.exceptions`. `anyio.fail_after(...)` raises `TimeoutError`,
# so we catch `TimeoutError` directly (works across AnyIO versions).

from app.errors import ApiError
from app.logging import get_logger
from app.models import JobPreview
from app.services.exa_text import ExaError, ExaTextService
from app.services.job_extract import guess_role_from_markdown
from app.settings import get_settings
from app.routes.generate import _validate_job_url

router = APIRouter()
logger = get_logger(__name__)


@router.post("/v1/job/preview", response_model=JobPreview)
async def job_preview(job_url: str = Form(...)) -> JobPreview:
    settings = get_settings()
    url = _validate_job_url(job_url)

    api_key = settings.exa_api_key
    if not api_key:
        raise ApiError(code="missing_exa_api_key", message="Missing EXA_API_KEY.", status_code=500)

    service = ExaTextService(api_key=api_key)
    try:
        with anyio.fail_after(settings.request_timeout_seconds):
            text = await anyio.to_thread.run_sync(service.scrape_text, url)
    except TimeoutError:
        raise ApiError(code="exa_timeout", message="Exa request timed out.", status_code=504)
    except ExaError as exc:
        raise ApiError(code="exa_error", message=str(exc), status_code=502)
    except Exception as exc:  # noqa: BLE001
        raise ApiError(code="exa_failed", message=f"Exa scrape failed: {exc}", status_code=502)

    role = guess_role_from_markdown(text)
    logger.info("job_preview:done")
    return JobPreview(role=role)


