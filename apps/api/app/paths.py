from __future__ import annotations

from pathlib import Path


def repo_root() -> Path:
    """
    Best-effort repository root detection.

    Locally the package lives at `<repo>/apps/api/app`, so walking 3 parents up
    lands on the repo root. On build platforms (Railway/Railpack) the editable
    install ends up under `/app/app`, meaning we have fewer parents available.
    """
    current_file = Path(__file__).resolve()
    parents = list(current_file.parents)

    # Prefer walking upwards until we find the template (repo root indicator).
    for candidate in parents:
        if (candidate / "template.docx").exists() or (candidate / "Andri_Heeb_Lebenslauf.pdf").exists():
            return candidate

    target_index = 3
    if len(parents) > target_index:
        return parents[target_index]

    # Fallback: default to the current working directory (e.g. /app in Railpack),
    # otherwise use the highest available parent (usually '/').
    cwd = Path.cwd()
    if cwd.exists():
        return cwd
    return parents[-1]


def default_template_path() -> Path:
    return repo_root() / "template.docx"


def default_cv_pdf_path() -> Path:
    # User-specific default CV for single-user MVP workflows.
    return repo_root() / "Andri_Heeb_Lebenslauf.pdf"


