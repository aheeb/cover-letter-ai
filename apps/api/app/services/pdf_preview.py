from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path


class PdfPreviewError(RuntimeError):
    """Raised when a PDF cannot be converted into a preview image."""


def render_pdf_preview(pdf_bytes: bytes) -> bytes:
    """Render the first PDF page as a high-resolution PNG image."""
    pdftoppm_path = shutil.which("pdftoppm")
    if not pdftoppm_path:
        raise PdfPreviewError("Poppler 'pdftoppm' not found in PATH.")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        pdf_file = tmp_path / "input.pdf"
        preview_prefix = tmp_path / "preview"
        preview_file = tmp_path / "preview.png"
        pdf_file.write_bytes(pdf_bytes)

        try:
            subprocess.run(
                [
                    pdftoppm_path,
                    "-f",
                    "1",
                    "-l",
                    "1",
                    "-singlefile",
                    "-png",
                    "-scale-to",
                    "1800",
                    str(pdf_file),
                    str(preview_prefix),
                ],
                capture_output=True,
                text=True,
                timeout=30,
                check=True,
            )
        except subprocess.TimeoutExpired as exc:
            raise PdfPreviewError("PDF preview conversion timed out after 30 seconds.") from exc
        except subprocess.CalledProcessError as exc:
            detail = exc.stderr or exc.stdout or str(exc)
            raise PdfPreviewError(f"PDF preview conversion failed: {detail}") from exc

        if not preview_file.exists():
            raise PdfPreviewError("PDF preview output was not created.")

        return preview_file.read_bytes()
