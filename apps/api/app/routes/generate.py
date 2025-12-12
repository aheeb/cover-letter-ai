from __future__ import annotations

from datetime import date
from functools import partial
from time import perf_counter
from urllib.parse import urlparse

import anyio
from fastapi import APIRouter, File, Form, UploadFile
from starlette.responses import Response
from anyio.exceptions import TimeoutError as AnyioTimeoutError

from app.errors import ApiError
from app.logging import get_logger
from app.models import GenerateOptions, Language, Length, Tone
from app.paths import default_cv_pdf_path
from app.services.cv_text import extract_text_from_pdf_bytes
from app.services.docx_render import TemplateNotFoundError, render_letter_docx
from app.services.firecrawl_text import FirecrawlError, FirecrawlTextService
from app.services.llm_letter import LlmError, generate_letter
from app.settings import get_settings
from app.utils.dates import format_letter_date
from app.utils.strings import ascii_slug

router = APIRouter()
logger = get_logger(__name__)


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


def _validate_job_url(value: str) -> str:
    url = value.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ApiError(code="invalid_job_url", message="job_url must be a valid http(s) URL.", status_code=400)
    return url


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
    settings = get_settings()
    job_url = job_url.strip() if job_url else None
    job_text = job_text.strip() if job_text else None

    if not job_url and not job_text:
        raise ApiError(code="missing_job_input", message="Provide either job_url or job_text.", status_code=400)

    if job_text and len(job_text) > settings.max_job_text_chars:
        raise ApiError(
            code="job_text_too_long",
            message=f"job_text exceeds max length ({settings.max_job_text_chars} chars).",
            status_code=400,
        )

    start = perf_counter()
    logger.info("generate:start")

    raw_pdf: bytes
    if cv_pdf is None:
        cv_path = default_cv_pdf_path()
        if not cv_path.exists():
            raise ApiError(
                code="missing_default_cv",
                message=f"Default CV PDF not found at {cv_path}. Provide cv_pdf upload or add the file.",
                status_code=500,
            )
        try:
            raw_pdf = await anyio.to_thread.run_sync(cv_path.read_bytes)
        except Exception as exc:  # noqa: BLE001
            raise ApiError(code="cv_read_failed", message=f"Could not read default CV PDF: {exc}", status_code=500)
    else:
        if cv_pdf.content_type not in {"application/pdf"}:
            raise ApiError(code="cv_invalid_type", message="cv_pdf must be a PDF (application/pdf).", status_code=400)
        raw_pdf = await cv_pdf.read()
        if not raw_pdf:
            raise ApiError(code="cv_empty", message="Empty cv_pdf.", status_code=400)
        if len(raw_pdf) > settings.max_cv_pdf_bytes:
            raise ApiError(
                code="cv_too_large",
                message=f"cv_pdf is too large (>{settings.max_cv_pdf_bytes} bytes).",
                status_code=413,
            )

    try:
        cv_text = await anyio.to_thread.run_sync(extract_text_from_pdf_bytes, raw_pdf)
    except Exception as exc:  # noqa: BLE001
        raise ApiError(code="cv_extract_failed", message=f"Could not read CV PDF: {exc}", status_code=400)

    if len(cv_text) < 100:
        raise ApiError(code="cv_too_short", message="Could not extract enough text from CV PDF.", status_code=400)

    cv_text = cv_text[:20_000]

    resolved_job_text: str
    if job_text:
        resolved_job_text = job_text
    else:
        if not job_url:
            raise ApiError(code="missing_job_url", message="job_url is required when job_text is empty.", status_code=400)
        url = _validate_job_url(job_url)
        api_key = settings.firecrawl_api_key
        if not api_key:
            raise ApiError(code="missing_firecrawl_api_key", message="Missing FIRECRAWL_API_KEY.", status_code=500)
        service = FirecrawlTextService(api_key=api_key)
        try:
            async with anyio.fail_after(settings.request_timeout_seconds):
                resolved_job_text = await anyio.to_thread.run_sync(service.scrape_markdown, url)
        except AnyioTimeoutError:
            raise ApiError(code="firecrawl_timeout", message="Firecrawl request timed out.", status_code=504)
        except FirecrawlError as exc:
            raise ApiError(code="firecrawl_error", message=str(exc), status_code=502)
        except Exception as exc:  # noqa: BLE001
            raise ApiError(code="firecrawl_failed", message=f"Firecrawl scrape failed: {exc}", status_code=502)

    if len(resolved_job_text) > settings.max_job_text_chars:
        resolved_job_text = resolved_job_text[: settings.max_job_text_chars]

    options = GenerateOptions(language=language, tone=tone, length=length, target_role=target_role)

    try:
        async with anyio.fail_after(settings.request_timeout_seconds):
            letter = await anyio.to_thread.run_sync(
                partial(generate_letter, job_text=resolved_job_text, cv_text=cv_text, options=options)
            )
    except AnyioTimeoutError:
        raise ApiError(code="llm_timeout", message="LLM request timed out.", status_code=504)
    except LlmError as exc:
        raise ApiError(code="llm_error", message=str(exc), status_code=502)
    except Exception as exc:  # noqa: BLE001
        raise ApiError(code="llm_failed", message=f"LLM request failed: {exc}", status_code=502)

    date_line = format_letter_date(date.today(), language)

    template_path = settings.template_path_resolved
    try:
        docx_bytes = await anyio.to_thread.run_sync(
            partial(
                render_letter_docx,
                template_path=template_path,
                letter=letter,
                date_line=date_line,
                recipient_indent_cm=settings.recipient_address_indent_cm,
            )
        )
    except TemplateNotFoundError as exc:
        raise ApiError(code="template_not_found", message=str(exc), status_code=500)
    except Exception as exc:  # noqa: BLE001
        raise ApiError(code="docx_render_failed", message=f"DOCX render failed: {exc}", status_code=500)

    company_name = _company_name_for_filename(company=letter.company, recipient_block=letter.recipient_block)
    company_slug = ascii_slug(company_name)
    filename = f"Motivationsschreiben_{company_slug}_Andri_Heeb.docx"

    duration_ms = int((perf_counter() - start) * 1000)
    logger.info(f"generate:done duration_ms={duration_ms}")

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
    }

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers=headers,
    )


