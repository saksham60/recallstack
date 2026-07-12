from typing import cast

from fastapi import APIRouter

from recallstack.modules.identity.application.commands import UNSET, Unset, UpdateProfile
from recallstack.modules.identity.domain.entities import Profile
from recallstack.modules.identity.presentation.dependencies import (
    CurrentUserDependency,
    IdentityServiceDependency,
)
from recallstack.modules.identity.presentation.schemas import ProfilePatchRequest, ProfileResponse

router = APIRouter(prefix="/me", tags=["identity"])


def _response(profile: Profile, roles: frozenset[str]) -> ProfileResponse:
    return ProfileResponse(
        id=profile.id,
        display_name=profile.display_name,
        avatar_url=profile.avatar_url,
        timezone=profile.timezone,
        roles=sorted(roles),
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


@router.get("", response_model=ProfileResponse, operation_id="getCurrentProfile")
async def get_profile(
    current_user: CurrentUserDependency,
    service: IdentityServiceDependency,
) -> ProfileResponse:
    profile = await service.get_profile(current_user)
    return _response(profile, current_user.roles)


@router.patch("", response_model=ProfileResponse, operation_id="updateCurrentProfile")
async def update_profile(
    payload: ProfilePatchRequest,
    current_user: CurrentUserDependency,
    service: IdentityServiceDependency,
) -> ProfileResponse:
    timezone: str | Unset = UNSET
    if "timezone" in payload.model_fields_set:
        timezone = cast(str, payload.timezone)
    command = UpdateProfile(
        display_name=(
            payload.display_name if "display_name" in payload.model_fields_set else UNSET
        ),
        avatar_url=(str(payload.avatar_url) if payload.avatar_url is not None else None)
        if "avatar_url" in payload.model_fields_set
        else UNSET,
        timezone=timezone,
    )
    profile = await service.update_profile(current_user, command)
    return _response(profile, current_user.roles)
