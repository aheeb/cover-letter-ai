from __future__ import annotations

from functools import partial

import anyio
from fastapi import APIRouter, File, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.errors import ApiError
from app.logging import get_logger
from app.models import LetterData, RenderRequest
from app.services.docx_render import TemplateNotFoundError, render_letter_docx
from app.services.pdf_render import PdfRenderError, render_letter_pdf
from app.services.pdf_preview import PdfPreviewError, render_pdf_preview
from app.settings import get_settings

router = APIRouter()
logger = get_logger(__name__)


@router.post("/v1/render/docx")
async def render_docx(request: RenderRequest) -> Response:
    """
    Render DOCX from LetterData (no LLM call).
    Returns the exact DOCX that matches the previewed letter.
    """
    settings = get_settings()
    template_path = settings.template_path_resolved

    try:
        docx_bytes = await anyio.to_thread.run_sync(
            partial(
                render_letter_docx,
                template_path=template_path,
                letter=request.letter,
                date_line=request.date_line,
                sender_adress=request.sender_adress,
                sender_name=request.sender_name,
                location=request.location,
                language=request.language,
                recipient_indent_cm=settings.recipient_address_indent_cm,
            )
        )
    except TemplateNotFoundError as exc:
        raise ApiError(code="template_not_found", message=str(exc), status_code=500)
    except Exception as exc:  # noqa: BLE001
        raise ApiError(code="docx_render_failed", message=f"DOCX render failed: {exc}", status_code=500)

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.post("/v1/render/pdf")
async def render_pdf(request: RenderRequest) -> Response:
    """
    Render PDF from LetterData (no LLM call).
    First renders DOCX, then converts to PDF via LibreOffice headless.
    Returns the exact PDF that matches the previewed letter.
    """
    settings = get_settings()
    template_path = settings.template_path_resolved

    try:
        pdf_bytes = await anyio.to_thread.run_sync(
            partial(
                render_letter_pdf,
                template_path=template_path,
                letter=request.letter,
                date_line=request.date_line,
                sender_adress=request.sender_adress,
                sender_name=request.sender_name,
                location=request.location,
                language=request.language,
                recipient_indent_cm=settings.recipient_address_indent_cm,
            )
        )
    except TemplateNotFoundError as exc:
        raise ApiError(code="template_not_found", message=str(exc), status_code=500)
    except PdfRenderError as exc:
        raise ApiError(code="pdf_render_failed", message=str(exc), status_code=500)
    except Exception as exc:  # noqa: BLE001
        raise ApiError(code="pdf_render_failed", message=f"PDF render failed: {exc}", status_code=500)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
    )


@router.post("/v1/render/pdf-preview")
async def render_pdf_preview_image(pdf: UploadFile = File(...)) -> Response:
    """Render the first page of an existing PDF as a browser-safe PNG preview."""
    settings = get_settings()
    if pdf.content_type != "application/pdf":
        raise ApiError(code="pdf_invalid_type", message="pdf must be application/pdf.", status_code=400)

    pdf_bytes = await pdf.read()
    if not pdf_bytes:
        raise ApiError(code="pdf_empty", message="PDF is empty.", status_code=400)
    if len(pdf_bytes) > settings.max_cv_pdf_bytes:
        raise ApiError(code="pdf_too_large", message="PDF is too large.", status_code=413)

    try:
        preview_bytes = await anyio.to_thread.run_sync(render_pdf_preview, pdf_bytes)
    except PdfPreviewError as exc:
        raise ApiError(code="pdf_preview_failed", message=str(exc), status_code=500) from exc

    return Response(content=preview_bytes, media_type="image/png")

