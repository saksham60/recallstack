from datetime import UTC, datetime
from types import TracebackType
from typing import Self
from uuid import UUID

from recallstack.modules.identity.domain.entities import Profile


class FakeProfileRepository:
    def __init__(self, profiles: dict[UUID, Profile] | None = None) -> None:
        self.profiles = profiles or {}
        self.fail_updates = False

    async def get(self, profile_id: UUID) -> Profile | None:
        return self.profiles.get(profile_id)

    async def provision(self, profile_id: UUID) -> Profile:
        now = datetime.now(UTC)
        profile = self.profiles.setdefault(
            profile_id,
            Profile(
                id=profile_id,
                display_name=None,
                avatar_url=None,
                timezone="UTC",
                created_at=now,
                updated_at=now,
            ),
        )
        return profile

    async def update(
        self,
        profile_id: UUID,
        *,
        display_name: str | None,
        avatar_url: str | None,
        timezone: str,
    ) -> Profile:
        if self.fail_updates:
            raise RuntimeError("simulated write failure")
        old = self.profiles[profile_id]
        profile = Profile(
            id=old.id,
            display_name=display_name,
            avatar_url=avatar_url,
            timezone=timezone,
            created_at=old.created_at,
            updated_at=datetime.now(UTC),
        )
        self.profiles[profile_id] = profile
        return profile


class FakeRoleRepository:
    def __init__(self) -> None:
        self.roles: dict[UUID, frozenset[str]] = {}

    async def active_codes(self, profile_id: UUID) -> frozenset[str]:
        return self.roles.get(profile_id, frozenset())


class FakeIdentityUnitOfWork:
    def __init__(self, profiles: FakeProfileRepository, roles: FakeRoleRepository) -> None:
        self.profiles = profiles
        self.roles = roles
        self.committed = False
        self.rolled_back = False

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if exc_type is not None:
            await self.rollback()

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        self.rolled_back = True


class FakeUowFactory:
    def __init__(
        self,
        repository: FakeProfileRepository,
        roles: FakeRoleRepository | None = None,
    ) -> None:
        self.repository = repository
        self.roles = roles or FakeRoleRepository()
        self.instances: list[FakeIdentityUnitOfWork] = []

    def __call__(self) -> FakeIdentityUnitOfWork:
        uow = FakeIdentityUnitOfWork(self.repository, self.roles)
        self.instances.append(uow)
        return uow
