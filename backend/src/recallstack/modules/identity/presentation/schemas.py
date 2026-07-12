from datetime import datetime
from typing import Self
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    display_name: str | None
    avatar_url: str | None
    timezone: str
    roles: list[str]
    created_at: datetime
    updated_at: datetime


class ProfilePatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    avatar_url: HttpUrl | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("display_name must not be blank")
        return normalized

    @field_validator("avatar_url")
    @classmethod
    def require_safe_avatar_url(cls, value: HttpUrl | None) -> HttpUrl | None:
        if value is not None and (
            value.scheme != "https" or value.username is not None or value.password is not None
        ):
            raise ValueError("avatar_url must be an HTTPS URL without credentials")
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("timezone must be a valid IANA timezone") from exc
        return value

    @model_validator(mode="after")
    def require_valid_patch(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("at least one profile field must be provided")
        if "timezone" in self.model_fields_set and self.timezone is None:
            raise ValueError("timezone cannot be null")
        return self
