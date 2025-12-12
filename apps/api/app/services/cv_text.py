from __future__ import annotations

from io import BytesIO

from pypdf import PdfReader


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """
    Extract plain text from a PDF.

    Doc reference: pypdf text extraction uses `page.extract_text()`.
    """
    reader = PdfReader(BytesIO(pdf_bytes))
    parts: list[str] = []
    for page in reader.pages:
        txt = page.extract_text()
        if isinstance(txt, str) and txt.strip():
            parts.append(txt)
    return "\n\n".join(parts).strip()


