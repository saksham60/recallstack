import pytest

from recallstack.shared.config import Settings


def test_standard_supabase_postgres_url_is_normalized_for_psycopg() -> None:
    settings = Settings(
        supabase_project_url="https://example.supabase.co",
        app_env="test",
        database_url="postgresql://user:password@db.example.com:5432/postgres",
    )

    assert settings.database_url == (
        "postgresql+psycopg://user:password@db.example.com:5432/postgres"
    )


def test_database_pool_settings_follow_environment_names(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_POOL_SIZE", "2")
    monkeypatch.setenv("DATABASE_MAX_OVERFLOW", "3")
    monkeypatch.setenv("DATABASE_POOL_TIMEOUT", "30")
    monkeypatch.setenv("DATABASE_POOL_RECYCLE", "1800")
    monkeypatch.setenv("DATABASE_POOL_PRE_PING", "true")

    settings = Settings(
        supabase_project_url="https://example.supabase.co",
        app_env="test",
    )

    assert settings.database_pool_size == 2
    assert settings.database_max_overflow == 3
    assert settings.database_pool_timeout == 30
    assert settings.database_pool_recycle == 1800
    assert settings.database_pool_pre_ping is True


def test_database_url_accepts_matching_environment_quotes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        '"postgresql+psycopg://user:password@db.example.com:5432/postgres?sslmode=require"',
    )

    settings = Settings(
        supabase_project_url="https://example.supabase.co",
        app_env="test",
    )

    assert settings.database_url == (
        "postgresql+psycopg://user:password@db.example.com:5432/postgres?sslmode=require"
    )


def test_cors_origins_support_wildcard_and_comma_separated_values() -> None:
    wildcard = Settings(
        supabase_project_url="https://example.supabase.co",
        app_env="test",
        cors_allowed_origins="*",
    )
    restricted = Settings(
        supabase_project_url="https://example.supabase.co",
        app_env="test",
        cors_allowed_origins="http://localhost:5173, https://app.example.com",
    )

    assert wildcard.cors_origins == ["*"]
    assert restricted.cors_origins == [
        "http://localhost:5173",
        "https://app.example.com",
    ]
