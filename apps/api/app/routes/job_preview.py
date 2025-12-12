from __future__ import annotations

import os

import anyio
from fastapi import APIRouter, Form, HTTPException

from app.models import JobPreview
from app.services.firecrawl_text import FirecrawlError, FirecrawlTextService
from app.services.job_extract import guess_role_from_markdown

router = APIRouter()


@router.post("/v1/job/preview", response_model=JobPreview)
async def job_preview(job_url: str = Form(...)) -> JobPreview:
    url = job_url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="job_url is required.")

    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing FIRECRAWL_API_KEY.")

    service = FirecrawlTextService(api_key=api_key)
    try:
        markdown = await anyio.to_thread.run_sync(service.scrape_markdown, url)
    except FirecrawlError as exc:
        raise HTTPException(status_code=502, detail=f"Firecrawl error: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Firecrawl scrape failed: {exc}") from exc

    role = guess_role_from_markdown(markdown)
    return JobPreview(role=role)


