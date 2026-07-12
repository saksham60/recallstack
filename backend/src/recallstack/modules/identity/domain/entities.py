from dataclasses import dataclass
from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass(frozen=True, slots=True)
class Profile:
    id: UUID
    display_name: str | None
    avatar_url: str | None
    timezone: str
    created_at: datetime
    updated_at: datetime

    def __post_init__(self) -> None:
        try:
            ZoneInfo(self.timezone)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"Unknown IANA timezone: {self.timezone}") from exc
