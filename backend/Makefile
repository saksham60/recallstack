.PHONY: install format lint typecheck test security check migrate seed grant-admin db-up db-down run

install:
	uv sync --frozen

format:
	uv run ruff format .
	uv run ruff check --fix .

lint:
	uv run ruff format --check .
	uv run ruff check .

typecheck:
	uv run mypy

test:
	uv run pytest

security:
	uv export --frozen --no-dev --no-emit-project -o .audit-requirements.txt
	uv run pip-audit -r .audit-requirements.txt

check: lint typecheck test security

migrate:
	uv run alembic upgrade head

seed:
	uv run python -m recallstack.commands.seed

grant-admin:
	uv run python -m recallstack.commands.grant_role $(PROFILE_ID) admin

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

run:
	uv run uvicorn recallstack.main:app --reload --port 8080
