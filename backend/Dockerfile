FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    UV_SYSTEM_PYTHON=1

COPY pyproject.toml ./
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts

RUN uv pip install --system .

# Run as a non-root user to limit container privilege.
RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app --create-home app \
    && chown -R app:app /app
USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
