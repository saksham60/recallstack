from functools import lru_cache
from typing import Literal, Self
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
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
    knowledge_enabled: bool = False
    knowledge_cursor_secret: SecretStr | None = None
    knowledge_batch_size: int = Field(default=20, ge=1, le=100)
    knowledge_feed_default_limit: int = Field(default=20, ge=1, le=50)
    knowledge_feed_max_limit: int = Field(default=50, ge=1, le=50)
    knowledge_discovery_concurrency: int = Field(default=2, ge=1, le=8)
    knowledge_enrichment_concurrency: int = Field(default=4, ge=1, le=16)
    knowledge_model_concurrency: int = Field(default=2, ge=1, le=8)
    knowledge_image_concurrency: int = Field(default=2, ge=1, le=8)
    knowledge_r2_concurrency: int = Field(default=2, ge=1, le=8)
    knowledge_cleanup_batch_size: int = Field(default=100, ge=1, le=1000)
    knowledge_cleanup_max_batches: int = Field(default=10, ge=1, le=100)
    knowledge_provider_timeout: float = Field(default=45, ge=1, le=120)
    knowledge_provider_retries: int = Field(default=2, ge=0, le=3)
    knowledge_image_max_bytes: int = Field(default=8_388_608, ge=1024, le=16_777_216)
    knowledge_discovery_topics: str = "software architecture,distributed systems,AI engineering"
    tavily_api_key: SecretStr | None = None
    nebius_api_key: SecretStr | None = None
    knowledge_model: str = "nvidia/nemotron-3-super-120b-a12b"
    knowledge_model_base_url: str = "https://api.tokenfactory.nebius.com/v1"
    r2_account_id: str = ""
    r2_access_key_id: SecretStr | None = None
    r2_secret_access_key: SecretStr | None = None
    r2_bucket: str = ""
    r2_public_base_url: str = ""
    r2_endpoint_url: str = ""

    @model_validator(mode="after")
    def validate_knowledge(self) -> Self:
        if self.knowledge_feed_default_limit > self.knowledge_feed_max_limit:
            raise ValueError("Knowledge default feed limit exceeds maximum")
        if self.knowledge_enabled and (
            self.knowledge_cursor_secret is None
            or len(self.knowledge_cursor_secret.get_secret_value()) < 32
        ):
            raise ValueError(
                "KNOWLEDGE_CURSOR_SECRET needs 32+ characters when Knowledge is enabled"
            )
        for name, value in (
            ("KNOWLEDGE_MODEL_BASE_URL", self.knowledge_model_base_url),
            ("R2_PUBLIC_BASE_URL", self.r2_public_base_url),
            ("R2_ENDPOINT_URL", self.r2_endpoint_url),
        ):
            if value:
                parsed = urlparse(value)
                if (
                    parsed.scheme != "https"
                    or not parsed.hostname
                    or parsed.username
                    or parsed.password
                    or parsed.query
                    or parsed.fragment
                ):
                    raise ValueError(
                        f"{name} must be an absolute HTTPS URL without credentials/query"
                    )
        topics = [topic.strip() for topic in self.knowledge_discovery_topics.split(",")]
        if not 1 <= len(topics) <= 8 or any(not topic or len(topic) > 120 for topic in topics):
            raise ValueError(
                "KNOWLEDGE_DISCOVERY_TOPICS requires 1-8 nonempty topics of <=120 chars"
            )
        return self

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
