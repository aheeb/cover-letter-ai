from __future__ import annotations

from functools import partial

import anyio
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from app.errors import ApiError
from app.logging import get_logger
from app.models import LetterData, RenderRequest
from app.services.docx_render import TemplateNotFoundError, render_letter_docx
from app.services.pdf_render import PdfRenderError, render_letter_pdf
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


