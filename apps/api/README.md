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
