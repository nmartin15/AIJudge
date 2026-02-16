# ── Backend: Python 3.12 / FastAPI ────────────────────────────────────
FROM python:3.12-slim AS base

# Prevent Python from writing .pyc and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System dependencies for asyncpg (libpq) and general build tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user and hand over ownership
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid appuser --shell /bin/sh appuser && \
    mkdir -p uploads && \
    chown -R appuser:appuser /app

# Make entrypoint executable
RUN chmod +x entrypoint.sh

USER appuser

EXPOSE 8000

# Use the entrypoint script so migrations run before the app starts
ENTRYPOINT ["./entrypoint.sh"]
