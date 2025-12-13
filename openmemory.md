## Overview

Single-user MVP to generate a **Swiss-style motivation letter** as a **professionally formatted Word `.docx`** from:

- Job **URL** (scraped via Firecrawl) or **Job text** fallback
- **CV PDF** (text extracted server-side). The upload is **optional**; if omitted, the API reads a default CV PDF from repo root.

The `.docx` layout is controlled by a fixed **`template.docx` in repo root** (Word-authored template), filled via `docxtpl`.

## Architecture

- `apps/web`: Next.js (App Router) + Tailwind (strict TypeScript, no `any`)
- `apps/api`: FastAPI (Pydantic models, service layer), endpoints for generate + health
- Root: `template.docx` (required), `README.md`

### Backend runtime patterns (FastAPI)

- Centralized settings via `app.settings.Settings` (env-driven): OpenAI keys/model, Firecrawl key, template path, recipient indent override, request timeout seconds, payload limits (CV bytes, job text chars), CORS CSV.
- Request-scoped logging with request IDs (middleware sets `X-Request-ID`; logs prefixed).
- Error schema via `ApiError` + exception handlers: `{error:{code,message,request_id,details?}}`; HTTP errors normalized; internal errors return generic message.
- Timeouts around external calls (Firecrawl, LLM) with 504 mapping; payload validation with 400/413; job_url scheme enforced (http/https).

## Frontend Design System

- **Stack**: Next.js 15, Tailwind CSS 4, Lucide Icons, Inter font.
- **UI Components**: Minimalist, accessible components (Button, Input, Select, Card, Tabs, FileUpload) in `apps/web/src/components/ui/` inspired by shadcn/ui but implementation-light (no Radix dependencies yet).
- **Styling**: `clsx` + `tailwind-merge` for class management.
- **Theme**: Zinc palette (neutral), flat design, subtle borders (`border-zinc-200`), clear typography (`text-sm` base), sticky backdrop-blur header.

## CORS / Downloads

- The web UI reads the download filename from the `Content-Disposition` response header. For cross-origin requests, the API must expose it via CORS (`expose_headers=["Content-Disposition"]` in `apps/api/app/main.py`).

### Data flow

1. User fills form in `apps/web`
2. Frontend sends `multipart/form-data` to `apps/api` `/v1/generate`
3. Backend:
   - extracts CV text from PDF (`pypdf`)
   - scrapes job URL to markdown (`firecrawl-py`) unless job text provided
   - generates structured letter fields (OpenAI SDK structured parsing, with `max_completion_tokens` caps per length, `reasoning_effort="minimal"`, plus a one-time retry with extra headroom if parsing fails due to length limit)
   - renders final `.docx` via `docxtpl` using root `template.docx`
4. Frontend downloads `.docx`

## API

### `GET /healthz`

Returns `{ "status": "ok" }`.

### `POST /v1/generate`

**Request (multipart):**

- `cv_pdf` (file, PDF, optional; if omitted the API reads the default CV PDF from repo root)
- `job_url` (string, optional if `job_text` provided)
- `job_text` (string, optional if `job_url` provided)
- `language`: `de | en`
- `tone`: `professional | friendly | concise`
- `length`: `short | medium | long`
- `target_role` (string, optional)

**Response:**

- `.docx` file as `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `Content-Disposition` attachment filename: `Motivationsschreiben_<Firma>_Andri_Heeb.docx`

### `POST /v1/job/preview`

**Purpose:** Scrape job URL and return a best-effort role/title guess for UI autofill.

**Request (multipart/form):**

- `job_url` (string, required)

**Response (JSON):**

- `{ "role": string | null }`

## DOCX Template (`template.docx`)

The backend provides these context variables for `docxtpl`:

- **Template placeholders (current)**:

  - `date`
  - `recipient_address`
  - `role`
  - `body_of_motivational_letter` (`docxtpl.Listing`, paragraph separator `\\a`)

- **Additional keys (available, but not required by your template)**:
  - `date_line`
  - `company`, `role_title`, `subject`
  - `sender_block`, `recipient_block`, `salutation`, `closing`, `signature_name`
  - `body_paragraphs` (list of strings), `body_listing` (`docxtpl.Listing`)

Template placeholders in your current Word template:

- `{{date}}`
- `{{recipient_address}}`
- `{{role}}`
- `{{body_of_motivational_letter}}`

## Debug Notes

- **Duplicate recipient block after body**: `template.docx` contains `{{recipient_address}}` only once (and not in header/footer). If the address block appears again after the body, it is likely the LLM repeated recipient/address lines inside `body_paragraphs`. The backend sanitizes trailing recipient-block lines from `body_paragraphs` in `apps/api/app/services/llm_letter.py` and also explicitly instructs the model to not repeat address lines in the body.
- **Signature/contact block appended after body**: If the output ends with a signature-like contact block (e.g. name + address + phone + email), it is produced by the LLM as trailing `body_paragraphs`. The backend strips trailing contact-like paragraphs (email/phone/address patterns, plus optional preceding name line) in `apps/api/app/services/llm_letter.py` and instructs the model to not include signature/contact lines in the body.
- **Recipient block commas / merged lines**: If the LLM returns address parts as a single line with commas (e.g. `Firma, Strasse 1,`), the backend normalizes `recipient_block` to 2-3 clean lines (Firma / Strasse / PLZ Ort) and strips trailing commas in `apps/api/app/services/llm_letter.py` (`_normalize_recipient_block`).
- **Recipient block last line misaligned (left)**: The `template.docx` uses a custom tab stop in the paragraph containing `{{recipient_address}}`. When docxtpl `Listing` generates extra paragraphs for additional address lines, those new paragraphs may not inherit the custom tab stop, causing lines (e.g. PLZ/Ort) to appear at the left margin. Fix: `apps/api/app/services/docx_render.py` copies the `<w:tabs>` element (tab stops) from the first recipient paragraph to all recipient paragraphs during post-processing.
- **Recipient block line breaks inside one paragraph**: Sometimes docxtpl renders the whole recipient block in a single paragraph with line breaks. Then only the first line has the leading tab, and subsequent lines (e.g. PLZ/Ort) start at the left margin. Fix: `apps/api/app/services/docx_render.py` detects this case and rewrites the paragraph to insert a tab after each line break (`\"\\n\\t\"`), preserving the template tab stops.
- **Recipient vs date horizontal alignment**: The template positions the date line via a specific tab stop (`w:pos` in `<w:tabs>`). For pixel-perfect alignment, `apps/api/app/services/docx_render.py` reads the first tab stop from the date paragraph and uses it as the recipient block indent (twips → EMU), so both start at the exact same x-position.

## Deployment (Railway / Railpack)

- **Service root directory**: `apps/api`
- **Railway config**: `apps/api/railway.json` (Railpack builder)
- **Healthcheck**: `GET /healthz`
- **Key fix**: build + run from a repo-local `venv/` (not `.venv`) because Railpack runtime Python may not see packages installed during build.
- **Start command**: uses `./venv/bin/python -m uvicorn ... --port "$PORT"` to guarantee the same interpreter/site-packages at runtime.


## Integrations (Doc-first)

Concrete doc references and API usage notes are captured in:

- `apps/api/docs/integrations.md`

## Code quality conventions

- **TypeScript**: strict mode, no `any`, small components, typed helpers
- **Python**: Pydantic models for domain contracts, small services, clear error handling

## User Defined Namespaces

- [Leave blank - user populates]
