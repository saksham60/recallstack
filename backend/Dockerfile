FROM python:3.12.11-slim-bookworm AS builder

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:0.7.13 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.12.11-slim-bookworm AS runtime

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080
WORKDIR /app
RUN addgroup --system --gid 10001 recallstack \
    && adduser --system --uid 10001 --ingroup recallstack recallstack
COPY --from=builder --chown=recallstack:recallstack /app/.venv /app/.venv
COPY --chown=recallstack:recallstack src ./src
COPY --chown=recallstack:recallstack alembic ./alembic
COPY --chown=recallstack:recallstack alembic.ini ./alembic.ini
USER recallstack
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn recallstack.main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]
