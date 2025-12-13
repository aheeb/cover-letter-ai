# cover-letter-ai API

## Local dev

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -e .
uvicorn app.main:app --reload --port 8000
```

## Env

Create a `.env` file in `apps/api/` (same folder as `env.example`) and copy variables from `env.example`.

Key settings:

- `OPENAI_API_KEY` (required), `OPENAI_MODEL` (optional)
- `FIRECRAWL_API_KEY` (required if scraping job URLs)
- `TEMPLATE_PATH` (optional; defaults to repo-root `template.docx`)
- `API_CORS_ORIGINS` (comma-separated allowed origins)
- `API_CORS_ORIGIN_REGEX` (optional regex for dynamic origins; useful for Vercel preview deploys)
- `RECIPIENT_ADDRESS_INDENT_CM` (optional fine-tune for DOCX layout)
- `REQUEST_TIMEOUT_SECONDS` (timeouts for LLM/Firecrawl)
- `MAX_CV_PDF_BYTES`, `MAX_JOB_TEXT_CHARS` (payload limits)
