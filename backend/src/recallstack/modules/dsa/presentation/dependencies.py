import asyncio
from collections.abc import Awaitable, Callable, Coroutine
from typing import Annotated, Any, cast

from fastapi import Depends, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException

from recallstack.modules.dsa.application.services import DsaService
from recallstack.modules.identity.presentation.dependencies import (
    get_current_user,
    get_current_user_provider,
)
from recallstack.modules.learning.application.learning_state import LearningService
from recallstack.shared.errors import AppError, AuthenticationError, AuthorizationError

_bearer = HTTPBearer(auto_error=False)


async def unexpected_response(request: Request, exc: Exception) -> Response:
    # Reuse the installed handler while keeping its response inside the DSA
    # middleware stack, so even unexpected preview errors cannot be cached.
    handler = cast(
        Callable[[Request, Exception], Awaitable[Response]],
        request.app.exception_handlers[Exception],
    )
    return await handler(request, exc)


class DsaRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()

        async def bounded(request: Request) -> Response:
            try:
                async with asyncio.timeout(10):
                    return await original(request)
            except (SQLAlchemyError, OSError, TimeoutError):
                raise AppError(
                    error_type="dependency-unavailable",
                    title="Dependency unavailable",
                    status=503,
                    detail="The DSA data service is temporarily unavailable",
                ) from None
            except RuntimeError as exc:
                if str(exc) != "DATABASE_URL is not configured":
                    return await unexpected_response(request, exc)
                raise AppError(
                    error_type="dependency-unavailable",
                    title="Dependency unavailable",
                    status=503,
                    detail="The DSA data service is temporarily unavailable",
                ) from None
            except (AppError, RequestValidationError, HTTPException):
                raise
            except Exception as exc:
                return await unexpected_response(request, exc)

        return bounded


async def preview_allowed(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    preview: Annotated[
        bool, Query(description="Explicit administrator/reviewer draft preview")
    ] = False,
) -> bool:
    if not preview:
        return False
    if credentials is None:
        raise AuthenticationError()
    user = await get_current_user(credentials, get_current_user_provider(request))
    if not (user.has_role("admin") or user.has_role("reviewer")):
        raise AuthorizationError()
    return True


Preview = Annotated[bool, Depends(preview_allowed)]


def get_service(request: Request) -> DsaService:
    return cast(DsaService, request.app.state.dsa_service)


def get_learning(request: Request) -> LearningService:
    return cast(LearningService, request.app.state.dsa_learning_service)


Service = Annotated[DsaService, Depends(get_service)]
Learning = Annotated[LearningService, Depends(get_learning)]
