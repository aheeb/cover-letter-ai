from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from app.models import LetterData
from app.services.docx_render import render_letter_docx


class PdfRenderError(RuntimeError):
    pass


def render_letter_pdf(
    *,
    template_path: Path,
    letter: LetterData,
    date_line: str,
    sender_adress: str = "",
    sender_name: str = "",
    location: str = "",
    recipient_indent_cm: float | None = None,
) -> bytes:
    """
    Render DOCX then convert to PDF using LibreOffice headless.

    Args:
        template_path: Path to template_official.docx
        letter: LetterData to render
        date_line: Formatted date line
        recipient_indent_cm: Optional indent override

    Returns:
        PDF bytes

    Raises:
        PdfRenderError: If conversion fails
    """
    # First render DOCX
    docx_bytes = render_letter_docx(
        template_path=template_path,
        letter=letter,
        date_line=date_line,
        sender_adress=sender_adress,
        sender_name=sender_name,
        location=location,
        recipient_indent_cm=recipient_indent_cm,
    )

    # Check if soffice is available
    soffice_path = shutil.which("soffice")
    if not soffice_path:
        raise PdfRenderError("LibreOffice 'soffice' not found in PATH. Install LibreOffice for PDF conversion.")

    # Write DOCX to temp file
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        docx_file = tmp_path / "input.docx"
        docx_file.write_bytes(docx_bytes)

        # Convert to PDF using LibreOffice headless
        # Command: soffice --headless --convert-to pdf --outdir <dir> <input.docx>
        # Output will be input.pdf in the outdir
        pdf_file = tmp_path / "input.pdf"

        try:
            result = subprocess.run(
                [
                    soffice_path,
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(tmp_path),
                    str(docx_file),
                ],
                capture_output=True,
                text=True,
                timeout=60,  # 60 second timeout for conversion
                check=True,
            )
        except subprocess.TimeoutExpired:
            raise PdfRenderError("PDF conversion timed out after 60 seconds")
        except subprocess.CalledProcessError as e:
            raise PdfRenderError(f"PDF conversion failed: {e.stderr or e.stdout or str(e)}")
        except FileNotFoundError:
            raise PdfRenderError("LibreOffice 'soffice' executable not found")

        if not pdf_file.exists():
            raise PdfRenderError(f"PDF output file not found at {pdf_file}")

        return pdf_file.read_bytes()


