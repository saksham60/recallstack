from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from recallstack.shared.errors import AppError


@dataclass(frozen=True, slots=True)
class Page[T]:
    items: tuple[T, ...]
    page: int
    page_size: int
    total_items: int


@dataclass(frozen=True, slots=True)
class UserFilters:
    progress_status: str | None = None
    activity_from: datetime | None = None
    activity_to: datetime | None = None


@dataclass(frozen=True, slots=True)
class AdminUserSummary:
    id: UUID
    display_name: str | None
    created_at: datetime
    updated_at: datetime
    active_roles: tuple[str, ...]
    progress_count: int
    practice_attempt_count: int
    review_count: int
    last_activity_at: datetime | None


@dataclass(frozen=True, slots=True)
class ProgressSummary:
    content_item_id: UUID
    content_slug: str
    title: str | None
    status: str
    confidence: int
    last_opened_at: datetime | None
    row_version: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class PracticeAttemptSummary:
    id: UUID
    content_item_id: UUID
    content_slug: str
    title: str | None
    practice_resource_id: UUID | None
    provider_id: int
    provider_name: str
    outcome: str
    duration_seconds: int | None
    hint_used: bool
    confidence_before: int | None
    confidence_after: int | None
    attempted_at: datetime
    created_at: datetime


@dataclass(frozen=True, slots=True)
class ReviewSummary:
    id: int
    review_card_id: UUID
    content_item_id: UUID
    content_slug: str
    title: str | None
    rating: str
    response_time_ms: int | None
    previous_due_at: datetime | None
    next_due_at: datetime
    scheduler_name: str
    scheduler_version: str
    reviewed_at: datetime
    created_at: datetime


@dataclass(frozen=True, slots=True)
class RoleGrantSummary:
    grant_id: int
    role_id: int
    role_code: str
    role_description: str | None
    granted_at: datetime
    granted_by: UUID | None
    revoked_at: datetime | None
    revoked_by: UUID | None

    @property
    def active(self) -> bool:
        return self.revoked_at is None


@dataclass(frozen=True, slots=True)
class RoleMutationResult:
    grant: RoleGrantSummary
    changed: bool


class AdminUserRepository(Protocol):
    async def list_users(
        self, *, filters: UserFilters, offset: int, limit: int
    ) -> tuple[int, tuple[AdminUserSummary, ...]]: ...

    async def get_user(self, user_id: UUID) -> AdminUserSummary | None: ...

    async def list_progress(
        self,
        *,
        user_id: UUID,
        status: str | None,
        activity_from: datetime | None,
        activity_to: datetime | None,
        offset: int,
        limit: int,
    ) -> tuple[int, tuple[ProgressSummary, ...]]: ...

    async def list_practice_attempts(
        self,
        *,
        user_id: UUID,
        activity_from: datetime | None,
        activity_to: datetime | None,
        offset: int,
        limit: int,
    ) -> tuple[int, tuple[PracticeAttemptSummary, ...]]: ...

    async def list_reviews(
        self,
        *,
        user_id: UUID,
        activity_from: datetime | None,
        activity_to: datetime | None,
        offset: int,
        limit: int,
    ) -> tuple[int, tuple[ReviewSummary, ...]]: ...

    async def list_role_grants(
        self, *, user_id: UUID, offset: int, limit: int
    ) -> tuple[int, tuple[RoleGrantSummary, ...]]: ...

    async def lock_profile(self, user_id: UUID) -> bool: ...
    async def role_exists(self, role_id: int) -> bool: ...
    async def active_role_grant(self, user_id: UUID, role_id: int) -> RoleGrantSummary | None: ...
    async def latest_role_grant(self, user_id: UUID, role_id: int) -> RoleGrantSummary | None: ...
    async def grant_role(self, user_id: UUID, role_id: int, actor_id: UUID) -> RoleGrantSummary: ...
    async def revoke_role(self, grant_id: int, actor_id: UUID) -> RoleGrantSummary: ...


class AdminUserUnitOfWork(Protocol):
    repository: AdminUserRepository

    async def __aenter__(self) -> Self: ...
    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...
    async def commit(self) -> None: ...


AdminUserUnitOfWorkFactory = Callable[[], AdminUserUnitOfWork]


class AdminUserService:
    def __init__(self, uow_factory: AdminUserUnitOfWorkFactory) -> None:
        self._uow_factory = uow_factory

    @staticmethod
    def _validate_range(activity_from: datetime | None, activity_to: datetime | None) -> None:
        if activity_from is not None and activity_to is not None and activity_from > activity_to:
            raise AppError(
                error_type="invalid-date-range",
                title="Invalid date range",
                status=422,
                detail="activity_from must be earlier than or equal to activity_to",
            )

    async def list_users(
        self, *, filters: UserFilters, page: int, page_size: int
    ) -> Page[AdminUserSummary]:
        self._validate_range(filters.activity_from, filters.activity_to)
        async with self._uow_factory() as uow:
            total, items = await uow.repository.list_users(
                filters=filters, offset=(page - 1) * page_size, limit=page_size
            )
        return Page(tuple(items), page, page_size, total)

    async def get_user(self, user_id: UUID) -> AdminUserSummary:
        async with self._uow_factory() as uow:
            user = await uow.repository.get_user(user_id)
        if user is None:
            self._not_found()
        assert user is not None
        return user

    async def list_progress(
        self,
        *,
        user_id: UUID,
        status: str | None,
        activity_from: datetime | None,
        activity_to: datetime | None,
        page: int,
        page_size: int,
    ) -> Page[ProgressSummary]:
        self._validate_range(activity_from, activity_to)
        async with self._uow_factory() as uow:
            await self._ensure_user(uow.repository, user_id)
            total, items = await uow.repository.list_progress(
                user_id=user_id,
                status=status,
                activity_from=activity_from,
                activity_to=activity_to,
                offset=(page - 1) * page_size,
                limit=page_size,
            )
        return Page(tuple(items), page, page_size, total)

    async def list_practice_attempts(
        self,
        *,
        user_id: UUID,
        activity_from: datetime | None,
        activity_to: datetime | None,
        page: int,
        page_size: int,
    ) -> Page[PracticeAttemptSummary]:
        self._validate_range(activity_from, activity_to)
        async with self._uow_factory() as uow:
            await self._ensure_user(uow.repository, user_id)
            total, items = await uow.repository.list_practice_attempts(
                user_id=user_id,
                activity_from=activity_from,
                activity_to=activity_to,
                offset=(page - 1) * page_size,
                limit=page_size,
            )
        return Page(tuple(items), page, page_size, total)

    async def list_reviews(
        self,
        *,
        user_id: UUID,
        activity_from: datetime | None,
        activity_to: datetime | None,
        page: int,
        page_size: int,
    ) -> Page[ReviewSummary]:
        self._validate_range(activity_from, activity_to)
        async with self._uow_factory() as uow:
            await self._ensure_user(uow.repository, user_id)
            total, items = await uow.repository.list_reviews(
                user_id=user_id,
                activity_from=activity_from,
                activity_to=activity_to,
                offset=(page - 1) * page_size,
                limit=page_size,
            )
        return Page(tuple(items), page, page_size, total)

    async def list_roles(
        self, *, user_id: UUID, page: int, page_size: int
    ) -> Page[RoleGrantSummary]:
        async with self._uow_factory() as uow:
            await self._ensure_user(uow.repository, user_id)
            total, items = await uow.repository.list_role_grants(
                user_id=user_id, offset=(page - 1) * page_size, limit=page_size
            )
        return Page(tuple(items), page, page_size, total)

    async def grant_role(
        self, *, user_id: UUID, role_id: int, actor_id: UUID
    ) -> RoleMutationResult:
        async with self._uow_factory() as uow:
            if not await uow.repository.lock_profile(user_id):
                self._not_found()
            if not await uow.repository.role_exists(role_id):
                raise AppError(
                    error_type="role-not-found",
                    title="Role not found",
                    status=422,
                    detail="The requested role does not exist",
                )
            existing = await uow.repository.active_role_grant(user_id, role_id)
            if existing is not None:
                return RoleMutationResult(existing, False)
            grant = await uow.repository.grant_role(user_id, role_id, actor_id)
            await uow.commit()
        return RoleMutationResult(grant, True)

    async def revoke_role(
        self, *, user_id: UUID, role_id: int, actor_id: UUID
    ) -> RoleMutationResult:
        async with self._uow_factory() as uow:
            if not await uow.repository.lock_profile(user_id):
                self._not_found()
            if not await uow.repository.role_exists(role_id):
                raise AppError(
                    error_type="role-not-found",
                    title="Role not found",
                    status=422,
                    detail="The requested role does not exist",
                )
            active = await uow.repository.active_role_grant(user_id, role_id)
            if active is None:
                latest = await uow.repository.latest_role_grant(user_id, role_id)
                if latest is None:
                    raise AppError(
                        error_type="role-grant-not-found",
                        title="Role grant not found",
                        status=404,
                        detail="The user has never held this role",
                    )
                return RoleMutationResult(latest, False)
            revoked = await uow.repository.revoke_role(active.grant_id, actor_id)
            await uow.commit()
        return RoleMutationResult(revoked, True)

    @staticmethod
    async def _ensure_user(repository: AdminUserRepository, user_id: UUID) -> None:
        if await repository.get_user(user_id) is None:
            AdminUserService._not_found()

    @staticmethod
    def _not_found() -> None:
        raise AppError(
            error_type="user-not-found",
            title="User not found",
            status=404,
            detail="The application profile was not found",
        )
