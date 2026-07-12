from collections.abc import Callable
from uuid import UUID

from recallstack.modules.identity.application.commands import UNSET, UpdateProfile
from recallstack.modules.identity.application.unit_of_work import IdentityUnitOfWork
from recallstack.modules.identity.domain.entities import Profile
from recallstack.shared.auth import CurrentUser

UnitOfWorkFactory = Callable[[], IdentityUnitOfWork]


class IdentityService:
    def __init__(self, unit_of_work: UnitOfWorkFactory) -> None:
        self._unit_of_work = unit_of_work

    async def load_current_user(self, subject: UUID) -> tuple[CurrentUser, Profile]:
        async with self._unit_of_work() as uow:
            profile = await uow.profiles.get(subject)
            if profile is None:
                profile = await uow.profiles.provision(subject)
            roles = await uow.roles.active_codes(subject)
            await uow.commit()
        return (
            CurrentUser(
                profile_id=profile.id,
                auth_subject=subject,
                roles=roles,
                display_name=profile.display_name,
            ),
            profile,
        )

    async def get_profile(self, current_user: CurrentUser) -> Profile:
        async with self._unit_of_work() as uow:
            profile = await uow.profiles.get(current_user.profile_id)
            if profile is None:
                profile = await uow.profiles.provision(current_user.profile_id)
            await uow.commit()
        return profile

    async def update_profile(
        self,
        current_user: CurrentUser,
        command: UpdateProfile,
    ) -> Profile:
        async with self._unit_of_work() as uow:
            current = await uow.profiles.get(current_user.profile_id)
            if current is None:
                current = await uow.profiles.provision(current_user.profile_id)
            profile = await uow.profiles.update(
                current_user.profile_id,
                display_name=(
                    current.display_name if command.display_name is UNSET else command.display_name
                ),
                avatar_url=current.avatar_url
                if command.avatar_url is UNSET
                else command.avatar_url,
                timezone=current.timezone if command.timezone is UNSET else command.timezone,
            )
            await uow.commit()
        return profile
