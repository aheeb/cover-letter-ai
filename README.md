# cover-letter-ai

Web-App, die aus **Job-Link + CV (PDF)** ein **Schweizer Motivationsschreiben als sauber formatiertes `.docx`** generiert.

## Voraussetzungen

- Node.js (LTS)
- Python 3.11+

## Wichtig: Word Template

Dieses Projekt erwartet eine Word-Vorlage im Repo-Root:

- `template.docx`

Diese Vorlage wird später via `docxtpl` befüllt. Wenn die Datei fehlt, kann die Generierung nicht funktionieren.

## Lokales Setup (MVP)

### Backend (FastAPI)

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e .
uvicorn app.main:app --reload --port 8000
```

ENV (Beispiel): siehe `apps/api/env.example`.

### Frontend (Next.js)

```bash
cd apps/web
npm install
npm run dev
```

Standardmässig erwartet das Web-Frontend die API unter `http://localhost:8000`.

ENV (Beispiel): siehe `apps/web/env.example`.


