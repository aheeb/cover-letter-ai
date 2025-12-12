## Integrations (doc-first notes)

This project intentionally follows a **doc-first** approach before integrating external services/libraries.

### Firecrawl (scraping)

- **Python SDK**: `firecrawl-py`
- **Docs/Refs**: `https://github.com/mendableai/firecrawl/blob/main/apps/python-sdk/README.md`
- **Key call (v2)**: `Firecrawl(...).scrape(url, formats=["markdown"])`

### OpenAI (structured output)

- **Python SDK**: `openai` (official)
- **Docs/Refs**: `https://github.com/openai/openai-python/blob/main/helpers.md`
- **Key call**: `client.chat.completions.parse(..., response_format=MyPydanticModel)`

### DOCX templating

- **Library**: `docxtpl`
- **Docs/Refs**: `https://docxtpl.readthedocs.io/en/latest/`
- **Note**: Use `Listing(...)` for multi-line/paragraph-friendly text rendering in templates.

### CV PDF text extraction

- **Library**: `pypdf`
- **Docs/Refs**: `https://pypdf.readthedocs.io/en/latest/user/extract-text.html`
- **Key call**: `PdfReader(file).pages[i].extract_text()`
