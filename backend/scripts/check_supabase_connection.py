"""Verify the configured PostgreSQL/Supabase connection without printing secrets."""

from __future__ import annotations

import os
import socket
import sys
from urllib.parse import urlsplit


def load_dotenv() -> None:
    path = os.path.join(os.getcwd(), ".env")
    if not os.path.exists(path):
        return
    for raw_line in open(path, encoding="utf-8"):
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> int:
    try:
        import psycopg
    except ImportError:
        print("FAIL: PostgreSQL driver is unavailable in this Python environment.")
        print("Run: uv run python scripts/check_supabase_connection.py")
        return 1

    load_dotenv()
    raw_url = os.getenv("DATABASE_URL")
    if not raw_url:
        print("FAIL: DATABASE_URL is not configured in .env or the environment")
        return 1

    database_url = raw_url.replace("postgresql+psycopg://", "postgresql://", 1)
    parsed = urlsplit(database_url)
    if not parsed.hostname:
        print("FAIL: DATABASE_URL has no hostname")
        return 1

    print(f"Host: {parsed.hostname}")
    print(f"Port: {parsed.port or 5432}")
    print(f"Database: {(parsed.path or '/').lstrip('/')}")

    try:
        addresses = socket.getaddrinfo(
            parsed.hostname,
            parsed.port or 5432,
            type=socket.SOCK_STREAM,
        )
        unique_addresses = sorted({address[4][0] for address in addresses})
        print(f"DNS: OK ({', '.join(unique_addresses)})")
    except OSError as exc:
        print(f"FAIL: DNS resolution failed: {exc}")
        return 1

    try:
        with psycopg.connect(database_url, connect_timeout=10) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT current_database(), current_user, version()")
                database, user, version = cursor.fetchone()
                cursor.execute("SELECT to_regclass('public.alembic_version')")
                migration_table = cursor.fetchone()[0]
                if migration_table:
                    cursor.execute("SELECT version_num FROM alembic_version")
                    migration = cursor.fetchone()[0]
                else:
                    migration = "missing"
        print("PostgreSQL: OK")
        print(f"Database user: {user}")
        print(f"Database name: {database}")
        print(f"Alembic revision: {migration}")
        print(f"Server: {version.splitlines()[0]}")
        return 0
    except Exception as exc:  # connection diagnostics should report the driver error
        print(f"FAIL: PostgreSQL connection failed: {type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
