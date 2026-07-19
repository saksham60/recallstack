from datetime import UTC, datetime
from types import TracebackType
from typing import Self, cast
from uuid import UUID

from sqlalchemy import ColumnElement, Select, and_, exists, func, or_, select
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.engine import Row
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.admin.application.user_inspection import (
    AdminUserRepository,
    AdminUserSummary,
    AdminUserUnitOfWork,
    PracticeAttemptSummary,
    ProgressSummary,
    ReviewSummary,
    RoleGrantSummary,
    UserFilters,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemModel,
    ContentVersionModel,
)
from recallstack.modules.identity.infrastructure.sqlalchemy_models import (
    ProfileModel,
    ProfileRoleGrantModel,
    RoleModel,
)
from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    ActivityEventModel,
    UserProgressModel,
)
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeAttemptModel,
    PracticeProviderModel,
)
from recallstack.modules.recall.infrastructure.sqlalchemy_models import (
    ReviewCardModel,
    ReviewHistoryModel,
)
from recallstack.shared.database import DatabaseSessionFactory


class SqlAlchemyAdminUserRepository(AdminUserRepository):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @staticmethod
    def _user_statement() -> Select[
        tuple[
            UUID,
            str | None,
            datetime,
            datetime,
            list[str] | None,
            int,
            int,
            int,
            datetime | None,
        ]
    ]:
        active_roles = (
            select(func.array_agg(aggregate_order_by(RoleModel.code, RoleModel.code)))
            .select_from(ProfileRoleGrantModel)
            .join(RoleModel, RoleModel.id == ProfileRoleGrantModel.role_id)
            .where(
                ProfileRoleGrantModel.profile_id == ProfileModel.id,
                ProfileRoleGrantModel.revoked_at.is_(None),
            )
            .correlate(ProfileModel)
            .scalar_subquery()
        )
        progress_count = (
            select(func.count(UserProgressModel.content_item_id))
            .where(UserProgressModel.user_id == ProfileModel.id)
            .correlate(ProfileModel)
            .scalar_subquery()
        )
        attempt_count = (
            select(func.count(PracticeAttemptModel.id))
            .where(PracticeAttemptModel.user_id == ProfileModel.id)
            .correlate(ProfileModel)
            .scalar_subquery()
        )
        review_count = (
            select(func.count(ReviewHistoryModel.id))
            .where(ReviewHistoryModel.user_id == ProfileModel.id)
            .correlate(ProfileModel)
            .scalar_subquery()
        )
        last_event = (
            select(func.max(ActivityEventModel.occurred_at))
            .where(ActivityEventModel.user_id == ProfileModel.id)
            .correlate(ProfileModel)
            .scalar_subquery()
        )
        last_attempt = (
            select(func.max(PracticeAttemptModel.attempted_at))
            .where(PracticeAttemptModel.user_id == ProfileModel.id)
            .correlate(ProfileModel)
            .scalar_subquery()
        )
        last_review = (
            select(func.max(ReviewHistoryModel.reviewed_at))
            .where(ReviewHistoryModel.user_id == ProfileModel.id)
            .correlate(ProfileModel)
            .scalar_subquery()
        )
        return select(
            ProfileModel.id,
            ProfileModel.display_name,
            ProfileModel.created_at,
            ProfileModel.updated_at,
            active_roles.label("active_roles"),
            progress_count.label("progress_count"),
            attempt_count.label("attempt_count"),
            review_count.label("review_count"),
            func.greatest(last_event, last_attempt, last_review).label("last_activity_at"),
        )

    @staticmethod
    def _user_filters(filters: UserFilters) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        if filters.progress_status is not None:
            conditions.append(
                exists().where(
                    UserProgressModel.user_id == ProfileModel.id,
                    UserProgressModel.status == filters.progress_status,
                )
            )
        if filters.activity_from is not None or filters.activity_to is not None:
            event_conditions = [ActivityEventModel.user_id == ProfileModel.id]
            attempt_conditions = [PracticeAttemptModel.user_id == ProfileModel.id]
            review_conditions = [ReviewHistoryModel.user_id == ProfileModel.id]
            if filters.activity_from is not None:
                event_conditions.append(ActivityEventModel.occurred_at >= filters.activity_from)
                attempt_conditions.append(
                    PracticeAttemptModel.attempted_at >= filters.activity_from
                )
                review_conditions.append(ReviewHistoryModel.reviewed_at >= filters.activity_from)
            if filters.activity_to is not None:
                event_conditions.append(ActivityEventModel.occurred_at <= filters.activity_to)
                attempt_conditions.append(PracticeAttemptModel.attempted_at <= filters.activity_to)
                review_conditions.append(ReviewHistoryModel.reviewed_at <= filters.activity_to)
            conditions.append(
                or_(
                    exists().where(*event_conditions),
                    exists().where(*attempt_conditions),
                    exists().where(*review_conditions),
                )
            )
        return conditions

    async def list_users(
        self, *, filters: UserFilters, offset: int, limit: int
    ) -> tuple[int, tuple[AdminUserSummary, ...]]:
        conditions = self._user_filters(filters)
        total = int(
            await self._session.scalar(select(func.count(ProfileModel.id)).where(*conditions)) or 0
        )
        rows = (
            await self._session.execute(
                self._user_statement()
                .where(*conditions)
                .order_by(ProfileModel.created_at.desc(), ProfileModel.id)
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return total, tuple(self._map_user(row) for row in rows)

    async def get_user(self, user_id: UUID) -> AdminUserSummary | None:
        row = (
            await self._session.execute(self._user_statement().where(ProfileModel.id == user_id))
        ).one_or_none()
        return self._map_user(row) if row is not None else None

    async def list_progress(
        self,
        *,
        user_id: UUID,
        status: str | None,
        activity_from: datetime | None,
        activity_to: datetime | None,
        offset: int,
        limit: int,
    ) -> tuple[int, tuple[ProgressSummary, ...]]:
        conditions = [UserProgressModel.user_id == user_id]
        if status is not None:
            conditions.append(UserProgressModel.status == status)
        if activity_from is not None:
            conditions.append(UserProgressModel.updated_at >= activity_from)
        if activity_to is not None:
            conditions.append(UserProgressModel.updated_at <= activity_to)
        total = int(
            await self._session.scalar(
                select(func.count()).select_from(UserProgressModel).where(*conditions)
            )
            or 0
        )
        rows = (
            await self._session.execute(
                select(
                    UserProgressModel.content_item_id,
                    ContentItemModel.slug,
                    ContentVersionModel.title,
                    UserProgressModel.status,
                    UserProgressModel.confidence,
                    UserProgressModel.last_opened_at,
                    UserProgressModel.row_version,
                    UserProgressModel.created_at,
                    UserProgressModel.updated_at,
                )
                .join(ContentItemModel, ContentItemModel.id == UserProgressModel.content_item_id)
                .outerjoin(
                    ContentVersionModel,
                    ContentVersionModel.id == ContentItemModel.current_published_version_id,
                )
                .where(*conditions)
                .order_by(UserProgressModel.updated_at.desc(), UserProgressModel.content_item_id)
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return total, tuple(
            ProgressSummary(r[0], r[1], r[2], r[3].value, r[4], r[5], r[6], r[7], r[8])
            for r in rows
        )

    async def list_practice_attempts(
        self,
        *,
        user_id: UUID,
        activity_from: datetime | None,
        activity_to: datetime | None,
        offset: int,
        limit: int,
    ) -> tuple[int, tuple[PracticeAttemptSummary, ...]]:
        conditions = [PracticeAttemptModel.user_id == user_id]
        if activity_from is not None:
            conditions.append(PracticeAttemptModel.attempted_at >= activity_from)
        if activity_to is not None:
            conditions.append(PracticeAttemptModel.attempted_at <= activity_to)
        total = int(
            await self._session.scalar(
                select(func.count()).select_from(PracticeAttemptModel).where(*conditions)
            )
            or 0
        )
        rows = (
            await self._session.execute(
                select(
                    PracticeAttemptModel.id,
                    PracticeAttemptModel.content_item_id,
                    ContentItemModel.slug,
                    ContentVersionModel.title,
                    PracticeAttemptModel.practice_resource_id,
                    PracticeAttemptModel.provider_id,
                    PracticeProviderModel.name,
                    PracticeAttemptModel.outcome,
                    PracticeAttemptModel.duration_seconds,
                    PracticeAttemptModel.hint_used,
                    PracticeAttemptModel.confidence_before,
                    PracticeAttemptModel.confidence_after,
                    PracticeAttemptModel.attempted_at,
                    PracticeAttemptModel.created_at,
                )
                .join(ContentItemModel, ContentItemModel.id == PracticeAttemptModel.content_item_id)
                .join(
                    PracticeProviderModel,
                    PracticeProviderModel.id == PracticeAttemptModel.provider_id,
                )
                .outerjoin(
                    ContentVersionModel,
                    ContentVersionModel.id == ContentItemModel.current_published_version_id,
                )
                .where(*conditions)
                .order_by(PracticeAttemptModel.attempted_at.desc(), PracticeAttemptModel.id)
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return total, tuple(
            PracticeAttemptSummary(
                r[0],
                r[1],
                r[2],
                r[3],
                r[4],
                r[5],
                r[6],
                r[7].value,
                r[8],
                r[9],
                r[10],
                r[11],
                r[12],
                r[13],
            )
            for r in rows
        )

    async def list_reviews(
        self,
        *,
        user_id: UUID,
        activity_from: datetime | None,
        activity_to: datetime | None,
        offset: int,
        limit: int,
    ) -> tuple[int, tuple[ReviewSummary, ...]]:
        conditions = [ReviewHistoryModel.user_id == user_id]
        if activity_from is not None:
            conditions.append(ReviewHistoryModel.reviewed_at >= activity_from)
        if activity_to is not None:
            conditions.append(ReviewHistoryModel.reviewed_at <= activity_to)
        total = int(
            await self._session.scalar(
                select(func.count()).select_from(ReviewHistoryModel).where(*conditions)
            )
            or 0
        )
        rows = (
            await self._session.execute(
                select(
                    ReviewHistoryModel.id,
                    ReviewHistoryModel.review_card_id,
                    ReviewCardModel.content_item_id,
                    ContentItemModel.slug,
                    ContentVersionModel.title,
                    ReviewHistoryModel.rating,
                    ReviewHistoryModel.response_time_ms,
                    ReviewHistoryModel.previous_due_at,
                    ReviewHistoryModel.next_due_at,
                    ReviewHistoryModel.scheduler_name,
                    ReviewHistoryModel.scheduler_version,
                    ReviewHistoryModel.reviewed_at,
                    ReviewHistoryModel.created_at,
                )
                .join(
                    ReviewCardModel,
                    and_(
                        ReviewCardModel.id == ReviewHistoryModel.review_card_id,
                        ReviewCardModel.user_id == ReviewHistoryModel.user_id,
                    ),
                )
                .join(ContentItemModel, ContentItemModel.id == ReviewCardModel.content_item_id)
                .outerjoin(
                    ContentVersionModel,
                    ContentVersionModel.id == ContentItemModel.current_published_version_id,
                )
                .where(*conditions)
                .order_by(ReviewHistoryModel.reviewed_at.desc(), ReviewHistoryModel.id)
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return total, tuple(
            ReviewSummary(
                r[0],
                r[1],
                r[2],
                r[3],
                r[4],
                r[5].value,
                r[6],
                r[7],
                r[8],
                r[9],
                r[10],
                r[11],
                r[12],
            )
            for r in rows
        )

    async def list_role_grants(
        self, *, user_id: UUID, offset: int, limit: int
    ) -> tuple[int, tuple[RoleGrantSummary, ...]]:
        condition = ProfileRoleGrantModel.profile_id == user_id
        total = int(
            await self._session.scalar(
                select(func.count()).select_from(ProfileRoleGrantModel).where(condition)
            )
            or 0
        )
        rows = (
            await self._session.execute(
                self._role_statement()
                .where(condition)
                .order_by(ProfileRoleGrantModel.granted_at.desc(), ProfileRoleGrantModel.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return total, tuple(self._map_role(row) for row in rows)

    async def lock_profile(self, user_id: UUID) -> bool:
        return (
            await self._session.scalar(
                select(ProfileModel.id).where(ProfileModel.id == user_id).with_for_update()
            )
        ) is not None

    async def role_exists(self, role_id: int) -> bool:
        return (
            await self._session.scalar(select(RoleModel.id).where(RoleModel.id == role_id))
        ) is not None

    async def role_code(self, role_id: int) -> str | None:
        return cast(
            str | None,
            await self._session.scalar(select(RoleModel.code).where(RoleModel.id == role_id)),
        )

    async def lock_admin_role_changes(self) -> None:
        # Transaction-scoped lock serializes admin grants/revocations, including changes
        # targeting different profiles, so two concurrent revocations cannot remove both.
        await self._session.execute(select(func.pg_advisory_xact_lock(7_341_998_031)))

    async def active_admin_count(self) -> int:
        return int(
            (
                await self._session.scalar(
                    select(func.count())
                    .select_from(ProfileRoleGrantModel)
                    .join(RoleModel, RoleModel.id == ProfileRoleGrantModel.role_id)
                    .where(
                        RoleModel.code == "admin",
                        ProfileRoleGrantModel.revoked_at.is_(None),
                    )
                )
            )
            or 0
        )

    async def active_role_grant(self, user_id: UUID, role_id: int) -> RoleGrantSummary | None:
        row = (
            await self._session.execute(
                self._role_statement()
                .where(
                    ProfileRoleGrantModel.profile_id == user_id,
                    ProfileRoleGrantModel.role_id == role_id,
                    ProfileRoleGrantModel.revoked_at.is_(None),
                )
                .order_by(ProfileRoleGrantModel.granted_at.desc(), ProfileRoleGrantModel.id.desc())
                .limit(1)
            )
        ).one_or_none()
        return self._map_role(row) if row is not None else None

    async def latest_role_grant(self, user_id: UUID, role_id: int) -> RoleGrantSummary | None:
        row = (
            await self._session.execute(
                self._role_statement()
                .where(
                    ProfileRoleGrantModel.profile_id == user_id,
                    ProfileRoleGrantModel.role_id == role_id,
                )
                .order_by(ProfileRoleGrantModel.granted_at.desc(), ProfileRoleGrantModel.id.desc())
                .limit(1)
            )
        ).one_or_none()
        return self._map_role(row) if row is not None else None

    async def grant_role(self, user_id: UUID, role_id: int, actor_id: UUID) -> RoleGrantSummary:
        grant = ProfileRoleGrantModel(profile_id=user_id, role_id=role_id, granted_by=actor_id)
        self._session.add(grant)
        await self._session.flush()
        row = (
            await self._session.execute(
                self._role_statement().where(ProfileRoleGrantModel.id == grant.id)
            )
        ).one()
        return self._map_role(row)

    async def revoke_role(self, grant_id: int, actor_id: UUID) -> RoleGrantSummary:
        grant = await self._session.get(ProfileRoleGrantModel, grant_id)
        if grant is None:
            raise RuntimeError("Locked role grant disappeared")
        grant.revoked_at = datetime.now(UTC)
        grant.revoked_by = actor_id
        await self._session.flush()
        row = (
            await self._session.execute(
                self._role_statement().where(ProfileRoleGrantModel.id == grant_id)
            )
        ).one()
        return self._map_role(row)

    @staticmethod
    def _role_statement() -> Select[
        tuple[int, int, str, str | None, datetime, UUID | None, datetime | None, UUID | None]
    ]:
        return select(
            ProfileRoleGrantModel.id,
            ProfileRoleGrantModel.role_id,
            RoleModel.code,
            RoleModel.description,
            ProfileRoleGrantModel.granted_at,
            ProfileRoleGrantModel.granted_by,
            ProfileRoleGrantModel.revoked_at,
            ProfileRoleGrantModel.revoked_by,
        ).join(RoleModel, RoleModel.id == ProfileRoleGrantModel.role_id)

    @staticmethod
    def _map_role(
        row: Row[
            tuple[int, int, str, str | None, datetime, UUID | None, datetime | None, UUID | None]
        ],
    ) -> RoleGrantSummary:
        return RoleGrantSummary(*row._tuple())

    @staticmethod
    def _map_user(
        row: Row[
            tuple[
                UUID,
                str | None,
                datetime,
                datetime,
                list[str] | None,
                int,
                int,
                int,
                datetime | None,
            ]
        ],
    ) -> AdminUserSummary:
        values = row._tuple()
        return AdminUserSummary(
            values[0],
            values[1],
            values[2],
            values[3],
            tuple(values[4] or ()),
            int(values[5]),
            int(values[6]),
            int(values[7]),
            values[8],
        )


class SqlAlchemyAdminUserUnitOfWork(AdminUserUnitOfWork):
    def __init__(self, session_factory: DatabaseSessionFactory[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self.repository: AdminUserRepository

    async def __aenter__(self) -> Self:
        self._session = self._session_factory.create_session()
        self.repository = SqlAlchemyAdminUserRepository(self._session)
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if self._session is None:
            return
        if exc_type is not None:
            await self._session.rollback()
        await self._session.close()

    async def commit(self) -> None:
        if self._session is None:
            raise RuntimeError("Unit of work has not been entered")
        try:
            await self._session.commit()
        except IntegrityError as exc:
            await self._session.rollback()
            raise RuntimeError("Role grant write conflicted") from exc
