# Dockerfile for FastAPI with LibreOffice for PDF conversion
FROM python:3.11-slim

# Install LibreOffice and minimal fonts
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libreoffice \
    libreoffice-writer \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip setuptools build && \
    pip install --no-cache-dir .

# Copy application code
COPY app/ ./app/
COPY template.docx ./

# Expose port (Railway sets PORT env var)
EXPOSE 8000

# Healthcheck endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')"

# Start command (Railway sets PORT env var)
CMD sh -c 'python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"'

