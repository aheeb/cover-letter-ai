from __future__ import annotations

import os
from datetime import date
from functools import partial
from pathlib import Path

import anyio
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.responses import Response

from app.models import GenerateOptions, Language, Length, Tone
from app.paths import default_cv_pdf_path, default_template_path
from app.services.cv_text import extract_text_from_pdf_bytes
from app.services.docx_render import TemplateNotFoundError, render_letter_docx
from app.services.firecrawl_text import FirecrawlError, FirecrawlTextService
from app.services.llm_letter import LlmError, generate_letter
from app.utils.dates import format_letter_date
from app.utils.strings import ascii_slug

router = APIRouter()


def _company_name_for_filename(*, company: str, recipient_block: str) -> str:
    """
    Best-effort: extract *company name only* (without address) for filenames.

    The LLM may return `company` including address parts (e.g. "ACME AG, Musterstrasse 1").
    For filenames we want just "ACME AG".
    """

    def normalize(value: str) -> str:
        first_line = value.strip().splitlines()[0].strip() if value.strip() else ""
        # Remove everything after the first comma (usually address).
        if "," in first_line:
            first_line = first_line.split(",", 1)[0].strip()
        return first_line

    c = normalize(company)
    if c and c.lower() != "firma":
        return c
    # Fallback: first line of recipient block
    r0 = normalize(recipient_block)
    return r0 or c or company.strip() or "Firma"


@router.post("/v1/generate")
async def generate(
    cv_pdf: UploadFile | None = File(None, description="CV as PDF (optional; defaults to repo-root CV)"),
    job_url: str | None = Form(None),
    job_text: str | None = Form(None),
    language: Language = Form(Language.de),
    tone: Tone = Form(Tone.professional),
    length: Length = Form(Length.medium),
    target_role: str | None = Form(None),
) -> Response:
    job_url = job_url.strip() if job_url else None
    job_text = job_text.strip() if job_text else None

    if not job_url and not job_text:
        raise HTTPException(status_code=400, detail="Provide either job_url or job_text.")

    raw_pdf: bytes
    if cv_pdf is None:
        cv_path = default_cv_pdf_path()
        if not cv_path.exists():
            raise HTTPException(
                status_code=500,
                detail=f"Default CV PDF not found at {cv_path}. Provide cv_pdf upload or add the file.",
            )
        try:
            raw_pdf = await anyio.to_thread.run_sync(cv_path.read_bytes)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Could not read default CV PDF: {exc}") from exc
    else:
        if cv_pdf.content_type not in {"application/pdf"}:
            raise HTTPException(status_code=400, detail="cv_pdf must be a PDF (application/pdf).")
        raw_pdf = await cv_pdf.read()
        if not raw_pdf:
            raise HTTPException(status_code=400, detail="Empty cv_pdf.")

    try:
        cv_text = await anyio.to_thread.run_sync(extract_text_from_pdf_bytes, raw_pdf)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read CV PDF: {exc}") from exc

    if len(cv_text) < 100:
        raise HTTPException(status_code=400, detail="Could not extract enough text from CV PDF.")

    # Keep prompts bounded
    cv_text = cv_text[:20_000]

    resolved_job_text: str
    if job_text:
        resolved_job_text = job_text
    else:
        api_key = os.getenv("FIRECRAWL_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Missing FIRECRAWL_API_KEY.")
        assert job_url is not None
        service = FirecrawlTextService(api_key=api_key)
        try:
            resolved_job_text = await anyio.to_thread.run_sync(service.scrape_markdown, job_url)
        except FirecrawlError as exc:
            raise HTTPException(status_code=502, detail=f"Firecrawl error: {exc}") from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Firecrawl scrape failed: {exc}") from exc

    resolved_job_text = resolved_job_text[:25_000]

    options = GenerateOptions(language=language, tone=tone, length=length, target_role=target_role)

    try:
        letter = await anyio.to_thread.run_sync(
            partial(generate_letter, job_text=resolved_job_text, cv_text=cv_text, options=options)
        )
    except LlmError as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc

    date_line = format_letter_date(date.today(), language)

    template_path = Path(os.getenv("TEMPLATE_PATH")) if os.getenv("TEMPLATE_PATH") else default_template_path()
    try:
        docx_bytes = await anyio.to_thread.run_sync(
            partial(render_letter_docx, template_path=template_path, letter=letter, date_line=date_line)
        )
    except TemplateNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"DOCX render failed: {exc}") from exc

    company_name = _company_name_for_filename(company=letter.company, recipient_block=letter.recipient_block)
    company_slug = ascii_slug(company_name)
    filename = f"Motivationsschreiben_{company_slug}_Andri_Heeb.docx"

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers=headers,
    )


