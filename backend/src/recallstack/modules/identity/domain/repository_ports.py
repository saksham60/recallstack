from typing import Protocol
from uuid import UUID

from recallstack.modules.identity.domain.entities import Profile


class ProfileRepository(Protocol):
    async def get(self, profile_id: UUID) -> Profile | None: ...

    async def provision(self, profile_id: UUID) -> Profile: ...

    async def update(
        self,
        profile_id: UUID,
        *,
        display_name: str | None,
        avatar_url: str | None,
        timezone: str,
    ) -> Profile: ...


class RoleRepository(Protocol):
    async def active_codes(self, profile_id: UUID) -> frozenset[str]: ...
