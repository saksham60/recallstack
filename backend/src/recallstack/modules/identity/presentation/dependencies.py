from typing import Annotated, cast

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from recallstack.modules.identity.application.services import IdentityService
from recallstack.shared.auth import CurrentUser, CurrentUserProvider
from recallstack.shared.errors import AuthenticationError, AuthorizationError
from recallstack.shared.observability.context import profile_id_context

_bearer = HTTPBearer(auto_error=False)


def get_identity_service(request: Request) -> IdentityService:
    return cast(IdentityService, request.app.state.identity_service)


def get_current_user_provider(request: Request) -> CurrentUserProvider:
    return cast(CurrentUserProvider, request.app.state.current_user_provider)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    provider: Annotated[CurrentUserProvider, Depends(get_current_user_provider)],
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError()
    current_user = await provider.from_access_token(credentials.credentials)
    profile_id_context.set(str(current_user.profile_id))
    return current_user


CurrentUserDependency = Annotated[CurrentUser, Depends(get_current_user)]
IdentityServiceDependency = Annotated[IdentityService, Depends(get_identity_service)]


async def require_admin(current_user: CurrentUserDependency) -> CurrentUser:
    if not current_user.has_role("admin"):
        raise AuthorizationError("Administrator role is required")
    return current_user


AdminUserDependency = Annotated[CurrentUser, Depends(require_admin)]


async def require_content_editor(current_user: CurrentUserDependency) -> CurrentUser:
    if not (current_user.has_role("admin") or current_user.has_role("content_editor")):
        raise AuthorizationError("Content editor or administrator role is required")
    return current_user


ContentEditorDependency = Annotated[CurrentUser, Depends(require_content_editor)]
