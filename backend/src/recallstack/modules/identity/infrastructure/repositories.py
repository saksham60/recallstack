from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.identity.domain.entities import Profile
from recallstack.modules.identity.infrastructure.mappers import profile_to_domain
from recallstack.modules.identity.infrastructure.sqlalchemy_models import (
    ProfileModel,
    ProfileRoleGrantModel,
    RoleModel,
)


class SqlAlchemyProfileRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, profile_id: UUID) -> Profile | None:
        model = await self._session.get(ProfileModel, profile_id)
        return None if model is None else profile_to_domain(model)

    async def provision(self, profile_id: UUID) -> Profile:
        statement = (
            insert(ProfileModel)
            .values(id=profile_id, timezone="UTC")
            .on_conflict_do_nothing(index_elements=[ProfileModel.id])
            .returning(ProfileModel)
        )
        model = (await self._session.execute(statement)).scalar_one_or_none()
        if model is None:
            existing = await self._session.get(ProfileModel, profile_id)
            if existing is None:
                raise RuntimeError("Profile provisioning did not produce a profile")
            model = existing
        return profile_to_domain(model)

    async def update(
        self,
        profile_id: UUID,
        *,
        display_name: str | None,
        avatar_url: str | None,
        timezone: str,
    ) -> Profile:
        statement = (
            update(ProfileModel)
            .where(ProfileModel.id == profile_id)
            .values(
                display_name=display_name,
                avatar_url=avatar_url,
                timezone=timezone,
                updated_at=datetime.now(UTC),
            )
            .returning(ProfileModel)
        )
        model = (await self._session.execute(statement)).scalar_one_or_none()
        if model is None:
            raise RuntimeError("Authenticated profile does not exist")
        return profile_to_domain(model)


class SqlAlchemyRoleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def active_codes(self, profile_id: UUID) -> frozenset[str]:
        statement = (
            select(RoleModel.code)
            .join(ProfileRoleGrantModel, ProfileRoleGrantModel.role_id == RoleModel.id)
            .where(
                ProfileRoleGrantModel.profile_id == profile_id,
                ProfileRoleGrantModel.revoked_at.is_(None),
            )
        )
        return frozenset((await self._session.scalars(statement)).all())
