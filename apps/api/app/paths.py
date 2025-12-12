from __future__ import annotations

from pathlib import Path


def repo_root() -> Path:
    # This file lives at: <repo>/apps/api/app/paths.py
    return Path(__file__).resolve().parents[3]


def default_template_path() -> Path:
    return repo_root() / "template.docx"


def default_cv_pdf_path() -> Path:
    # User-specific default CV for single-user MVP workflows.
    return repo_root() / "Andri_Heeb_Lebenslauf.pdf"


