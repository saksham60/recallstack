import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import event, select, text
from sqlalchemy.engine import Connection, ExecutionContext
from sqlalchemy.ext.asyncio import AsyncEngine

from recallstack.composition.admin_user_uow import SqlAlchemyAdminUserUnitOfWork
from recallstack.modules.admin.application.user_inspection import AdminUserService, UserFilters
from recallstack.modules.catalog.infrastructure.sqlalchemy_models import DomainModel
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemModel,
    ContentType,
    ContentVersionModel,
    DifficultyLevel,
    PublicationStatus,
)
from recallstack.modules.identity.infrastructure.sqlalchemy_models import ProfileModel, RoleModel
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.sqlalchemy_models import UserProgressModel
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeAttemptModel,
    PracticeOutcome,
    PracticeProviderModel,
)
from recallstack.modules.recall.infrastructure.sqlalchemy_models import (
    ReviewCardModel,
    ReviewHistoryModel,
    ReviewRating,
)
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from recallstack.shared.errors import AppError
from tests.conftest import TEST_PUBLISHER_PROFILE_ID


@pytest.mark.integration
async def test_admin_user_listing_is_paginated_and_has_fixed_query_count(
    migrated_database_url: str,
) -> None:
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = AdminUserService(lambda: SqlAlchemyAdminUserUnitOfWork(database.session_factory))
    try:
        profile_ids = [uuid4() for _ in range(3)]
        async with database.session_factory.create_session() as session, session.begin():
            for profile_id in profile_ids:
                await session.execute(
                    text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": profile_id}
                )
            session.add_all(
                [
                    ProfileModel(id=profile_id, display_name=f"User {index}")
                    for index, profile_id in enumerate(profile_ids)
                ]
            )
        async with database.session_factory.create_session() as session:
            engine = session.bind
        assert isinstance(engine, AsyncEngine)
        queries: list[str] = []

        def count_query(
            connection: Connection,
            cursor: object,
            statement: str,
            parameters: object,
            context: ExecutionContext,
            executemany: bool,
        ) -> None:
            del connection, cursor, parameters, context, executemany
            queries.append(statement)

        event.listen(engine.sync_engine, "before_cursor_execute", count_query)
        try:
            result = await service.list_users(filters=UserFilters(), page=1, page_size=2)
        finally:
            event.remove(engine.sync_engine, "before_cursor_execute", count_query)
        assert result.total_items >= 4
        assert len(result.items) == 2
        assert len(queries) == 2
    finally:
        await database.close()


@pytest.mark.integration
async def test_role_grant_and_revoke_preserve_audited_history(
    migrated_database_url: str,
) -> None:
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = AdminUserService(lambda: SqlAlchemyAdminUserUnitOfWork(database.session_factory))
    target_id = uuid4()
    try:
        async with database.session_factory.create_session() as session, session.begin():
            await session.execute(
                text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": target_id}
            )
            session.add(ProfileModel(id=target_id, display_name="Target"))
            role_id = await session.scalar(select(RoleModel.id).where(RoleModel.code == "admin"))
        assert role_id is not None

        first = await service.grant_role(
            user_id=target_id, role_id=role_id, actor_id=TEST_PUBLISHER_PROFILE_ID
        )
        duplicate = await service.grant_role(
            user_id=target_id, role_id=role_id, actor_id=TEST_PUBLISHER_PROFILE_ID
        )
        revoked = await service.revoke_role(
            user_id=target_id, role_id=role_id, actor_id=TEST_PUBLISHER_PROFILE_ID
        )
        duplicate_revoke = await service.revoke_role(
            user_id=target_id, role_id=role_id, actor_id=TEST_PUBLISHER_PROFILE_ID
        )
        second = await service.grant_role(
            user_id=target_id, role_id=role_id, actor_id=TEST_PUBLISHER_PROFILE_ID
        )
        history = await service.list_roles(user_id=target_id, page=1, page_size=25)

        assert first.changed is True
        assert duplicate.changed is False
        assert duplicate.grant.grant_id == first.grant.grant_id
        assert revoked.changed is True
        assert revoked.grant.revoked_by == TEST_PUBLISHER_PROFILE_ID
        assert duplicate_revoke.changed is False
        assert second.changed is True
        assert second.grant.grant_id != first.grant.grant_id
        assert history.total_items == 2
        assert sum(item.active for item in history.items) == 1
        historical = next(item for item in history.items if not item.active)
        assert historical.granted_by == TEST_PUBLISHER_PROFILE_ID
        assert historical.revoked_by == TEST_PUBLISHER_PROFILE_ID
        assert historical.revoked_at is not None
    finally:
        await database.close()


@pytest.mark.integration
async def test_concurrent_revocations_cannot_remove_the_final_admin(
    migrated_database_url: str,
) -> None:
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = AdminUserService(lambda: SqlAlchemyAdminUserUnitOfWork(database.session_factory))
    admin_a, admin_b = uuid4(), uuid4()
    try:
        async with database.session_factory.create_session() as session, session.begin():
            for profile_id in (admin_a, admin_b):
                await session.execute(
                    text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": profile_id}
                )
                session.add(ProfileModel(id=profile_id, display_name="Lockout test admin"))
            await session.flush()
            role_id = await session.scalar(select(RoleModel.id).where(RoleModel.code == "admin"))
            assert role_id is not None
            await session.execute(
                text(
                    "UPDATE profile_role_grants SET revoked_at = now(), revoked_by = :actor "
                    "WHERE role_id = :role_id AND revoked_at IS NULL"
                ),
                {"actor": TEST_PUBLISHER_PROFILE_ID, "role_id": role_id},
            )
            await session.execute(
                text(
                    "INSERT INTO profile_role_grants "
                    "(profile_id, role_id, granted_by) VALUES "
                    "(:a, :role_id, :actor), (:b, :role_id, :actor)"
                ),
                {
                    "a": admin_a,
                    "b": admin_b,
                    "role_id": role_id,
                    "actor": TEST_PUBLISHER_PROFILE_ID,
                },
            )

        outcomes = await asyncio.gather(
            service.revoke_role(
                user_id=admin_a, role_id=role_id, actor_id=TEST_PUBLISHER_PROFILE_ID
            ),
            service.revoke_role(
                user_id=admin_b, role_id=role_id, actor_id=TEST_PUBLISHER_PROFILE_ID
            ),
            return_exceptions=True,
        )
        assert sum(not isinstance(outcome, Exception) for outcome in outcomes) == 1
        failures = [outcome for outcome in outcomes if isinstance(outcome, AppError)]
        assert len(failures) == 1
        assert failures[0].error_type == "last-admin-revocation"
        async with database.session_factory.create_session() as session:
            active_count = await session.scalar(
                text(
                    "SELECT count(*) FROM profile_role_grants "
                    "WHERE role_id = :role_id AND revoked_at IS NULL"
                ),
                {"role_id": role_id},
            )
        assert active_count == 1
    finally:
        async with database.session_factory.create_session() as session, session.begin():
            role_id = await session.scalar(select(RoleModel.id).where(RoleModel.code == "admin"))
            if role_id is not None:
                await session.execute(
                    text(
                        "INSERT INTO profile_role_grants (profile_id, role_id, granted_by) "
                        "SELECT :profile, :role, :profile WHERE NOT EXISTS ("
                        "SELECT 1 FROM profile_role_grants WHERE profile_id = :profile "
                        "AND role_id = :role AND revoked_at IS NULL)"
                    ),
                    {
                        "profile": TEST_PUBLISHER_PROFILE_ID,
                        "role": role_id,
                    },
                )
        await database.close()


@pytest.mark.integration
async def test_admin_activity_reads_are_filtered_and_scoped_to_target_user(
    migrated_database_url: str,
) -> None:
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = AdminUserService(lambda: SqlAlchemyAdminUserUnitOfWork(database.session_factory))
    target_id, other_id = uuid4(), uuid4()
    now = datetime.now(UTC)
    try:
        async with database.session_factory.create_session() as session, session.begin():
            for profile_id in (target_id, other_id):
                await session.execute(
                    text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": profile_id}
                )
            session.add_all(
                [
                    ProfileModel(id=target_id, display_name="Inspected"),
                    ProfileModel(id=other_id, display_name="Other"),
                ]
            )
            domain = DomainModel(slug=f"domain-{target_id}", name="Inspection domain")
            provider = PracticeProviderModel(
                slug=f"provider-{target_id}", name="Inspection provider", is_active=True
            )
            session.add_all([domain, provider])
            await session.flush()
            item = ContentItemModel(
                domain_id=domain.id,
                slug=f"content-{target_id}",
                type=ContentType.PROBLEM,
                difficulty=DifficultyLevel.EASY,
                created_by=TEST_PUBLISHER_PROFILE_ID,
            )
            session.add(item)
            await session.flush()
            version = ContentVersionModel(
                content_item_id=item.id,
                version_number=1,
                status=PublicationStatus.PUBLISHED,
                title="Inspection content",
                authored_by=TEST_PUBLISHER_PROFILE_ID,
                reviewed_by=TEST_PUBLISHER_PROFILE_ID,
                published_by=TEST_PUBLISHER_PROFILE_ID,
                published_at=now,
                row_version=1,
            )
            session.add(version)
            await session.flush()
            item.current_published_version_id = version.id
            session.add_all(
                [
                    UserProgressModel(
                        user_id=target_id,
                        content_item_id=item.id,
                        status=LearningStatus.CONFIDENT,
                        confidence=80,
                        updated_at=now,
                    ),
                    UserProgressModel(
                        user_id=other_id,
                        content_item_id=item.id,
                        status=LearningStatus.LEARNING,
                        confidence=20,
                        updated_at=now,
                    ),
                ]
            )
            attempt = PracticeAttemptModel(
                attempt_event_id=uuid4(),
                user_id=target_id,
                content_item_id=item.id,
                practice_resource_id=None,
                provider_id=provider.id,
                outcome=PracticeOutcome.SOLVED_INDEPENDENTLY,
                duration_seconds=120,
                hint_used=False,
                confidence_before=60,
                confidence_after=80,
                attempted_at=now,
            )
            card = ReviewCardModel(
                user_id=target_id,
                content_item_id=item.id,
                due_at=now,
                interval_days=Decimal("1"),
            )
            session.add_all([attempt, card])
            await session.flush()
            session.add(
                ReviewHistoryModel(
                    review_event_id=uuid4(),
                    review_card_id=card.id,
                    user_id=target_id,
                    rating=ReviewRating.GOOD,
                    reviewed_at=now,
                    response_time_ms=900,
                    previous_due_at=now,
                    next_due_at=now + timedelta(days=1),
                    interval_days_after=Decimal("1"),
                    scheduler_name="simple",
                    scheduler_version="1",
                    scheduler_state_after={},
                )
            )

        progress = await service.list_progress(
            user_id=target_id,
            status="confident",
            activity_from=now - timedelta(minutes=1),
            activity_to=now + timedelta(minutes=1),
            page=1,
            page_size=25,
        )
        attempts = await service.list_practice_attempts(
            user_id=target_id,
            activity_from=now - timedelta(minutes=1),
            activity_to=now + timedelta(minutes=1),
            page=1,
            page_size=25,
        )
        reviews = await service.list_reviews(
            user_id=target_id,
            activity_from=now - timedelta(minutes=1),
            activity_to=now + timedelta(minutes=1),
            page=1,
            page_size=25,
        )
        confident_users = await service.list_users(
            filters=UserFilters(progress_status="confident"), page=1, page_size=100
        )

        assert progress.total_items == 1
        assert progress.items[0].status == "confident"
        assert attempts.total_items == 1
        assert attempts.items[0].outcome == "solved_independently"
        assert reviews.total_items == 1
        assert reviews.items[0].rating == "good"
        assert target_id in {user.id for user in confident_users.items}
        assert other_id not in {user.id for user in confident_users.items}
    finally:
        await database.close()
