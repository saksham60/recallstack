from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class CurrentUser:
    profile_id: UUID
    auth_subject: UUID
    roles: frozenset[str]
    display_name: str | None = None

    def has_role(self, role: str) -> bool:
        return role in self.roles
