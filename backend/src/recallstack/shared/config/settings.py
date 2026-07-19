from functools import lru_cache
from typing import Literal, Self
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-backed application configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        hide_input_in_errors=True,
        populate_by_name=True,
    )

    app_name: str = "RecallStack API"
    app_env: Literal["development", "test", "staging", "production"] = Field(
        default="development", validation_alias=AliasChoices("APP_ENV", "ENVIRONMENT")
    )
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    port: int = Field(default=8080, ge=1, le=65535)
    database_url: str | None = None
    database_pool_size: int = Field(default=5, ge=1, le=100)
    database_max_overflow: int = Field(default=5, ge=0, le=100)
    database_pool_timeout: float = Field(
        default=30.0,
        gt=0,
        le=60,
        validation_alias=AliasChoices("DATABASE_POOL_TIMEOUT", "DATABASE_POOL_TIMEOUT_SECONDS"),
    )
    database_pool_recycle: int = Field(default=1800, ge=0, le=86400)
    database_pool_pre_ping: bool = True
    supabase_project_url: str = Field(
        validation_alias=AliasChoices("SUPABASE_PROJECT_URL", "SUPABASE_URL")
    )
    supabase_jwt_issuer: str = ""
    supabase_jwt_audience: str = "authenticated"
    supabase_jwks_url: str = ""
    jwks_cache_seconds: int = Field(default=600, ge=60, le=86400)
    request_body_max_bytes: int = Field(default=1_048_576, ge=1024, le=10_485_760)
    cors_allowed_origins: str = "*"
    readiness_cache_seconds: float = Field(default=5.0, ge=1.0, le=60.0)
    sync_retention_days: int = Field(default=30, ge=1, le=365)
    otel_enabled: bool = False

    @property
    def cors_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.cors_allowed_origins.split(",")]
        return [origin for origin in origins if origin]

    @field_validator("database_url", mode="before")
    @classmethod
    def strip_database_url_environment_quotes(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        if len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in {'"', "'"}:
            return normalized[1:-1]
        return normalized

    @model_validator(mode="after")
    def validate_urls(self) -> Self:
        parsed = urlparse(self.supabase_project_url)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("SUPABASE_PROJECT_URL must be an absolute HTTPS URL")
        self.supabase_project_url = self.supabase_project_url.rstrip("/")
        default_issuer = f"{self.supabase_project_url}/auth/v1"
        self.supabase_jwt_issuer = (self.supabase_jwt_issuer or default_issuer).rstrip("/")
        self.supabase_jwks_url = self.supabase_jwks_url or (
            f"{self.supabase_jwt_issuer}/.well-known/jwks.json"
        )
        for name, value in (
            ("SUPABASE_JWT_ISSUER", self.supabase_jwt_issuer),
            ("SUPABASE_JWKS_URL", self.supabase_jwks_url),
        ):
            parsed_auth_url = urlparse(value)
            if parsed_auth_url.scheme != "https" or not parsed_auth_url.netloc:
                raise ValueError(f"{name} must be an absolute HTTPS URL")
        if self.database_url:
            if self.database_url.startswith("postgres://"):
                self.database_url = self.database_url.replace(
                    "postgres://", "postgresql+psycopg://", 1
                )
            elif self.database_url.startswith("postgresql://"):
                self.database_url = self.database_url.replace(
                    "postgresql://", "postgresql+psycopg://", 1
                )
            elif not self.database_url.startswith("postgresql+psycopg://"):
                raise ValueError("DATABASE_URL must be a PostgreSQL connection URL")
        if self.app_env in {"staging", "production"} and self.database_url is None:
            raise ValueError("DATABASE_URL is required outside development and test")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
