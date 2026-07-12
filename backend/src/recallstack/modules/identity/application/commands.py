from dataclasses import dataclass
from enum import Enum


class Unset(Enum):
    TOKEN = 0


UNSET = Unset.TOKEN


@dataclass(frozen=True, slots=True)
class UpdateProfile:
    display_name: str | None | Unset = UNSET
    avatar_url: str | None | Unset = UNSET
    timezone: str | Unset = UNSET

    @property
    def has_changes(self) -> bool:
        return any(
            value is not UNSET for value in (self.display_name, self.avatar_url, self.timezone)
        )
