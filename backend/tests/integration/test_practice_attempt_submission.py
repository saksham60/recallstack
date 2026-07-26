import asyncio
from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, text

from recallstack.composition.practice_attempt_uow import SqlAlchemyPracticeAttemptUnitOfWork
from recallstack.modules.practice.application.attempt_submission import (
    AttemptOutcome,
    DeterministicInitialReviewScheduler,
    PracticeAttemptService,
    SubmitPracticeAttempt,
)
from recallstack.modules.practice.infrastructure.attempt_submission_repository import (
    SqlAlchemyPracticeAttemptRepository,
)
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from recallstack.shared.errors import AppError
from tests.integration.test_published_study_note_repository import add_content

pytestmark = pytest.mark.integration


class FailingAfterApplyRepository(SqlAlchemyPracticeAttemptRepository):
    async def apply_attempt(self, **kwargs: object):  # type: ignore[no-untyped-def]
        await super().apply_attempt(**kwargs)  # type: ignore[arg-type]
        raise RuntimeError("simulated mandatory write failure")


class FailingAfterApplyUnitOfWork(SqlAlchemyPracticeAttemptUnitOfWork):
    async def __aenter__(self):  # type: ignore[no-untyped-def]
        await super().__aenter__()
        assert self._session is not None
        self.repository = FailingAfterApplyRepository(self._session)
        return self


def command(
    *,
    event_id: UUID,
    content_id: UUID,
    resource_id: UUID | None,
    outcome: str = AttemptOutcome.SOLVED_WITH_HINT,
) -> SubmitPracticeAttempt:
    return SubmitPracticeAttempt(
        attempt_event_id=event_id,
        content_item_id=content_id,
        practice_resource_id=resource_id,
        outcome=outcome,
        duration_seconds=1200,
        hint_used=True,
        confidence_before=2,
        confidence_after=4,
        attempted_at=datetime.now(UTC),
    )


async def test_practice_attempt_is_idempotent_atomic_and_user_scoped(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    domain_id, category_id, user_a, user_b = uuid4(), uuid4(), uuid4(), uuid4()
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO auth.users (id) VALUES (:a), (:b)"), {"a": user_a, "b": user_b}
        )
        connection.execute(
            text("INSERT INTO profiles (id) VALUES (:a), (:b)"), {"a": user_a, "b": user_b}
        )
        connection.execute(
            text("INSERT INTO domains (id, slug, name) VALUES (:id, :slug, 'Practice')"),
            {"id": domain_id, "slug": f"practice-{domain_id.hex[:8]}"},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name) "
                "VALUES (:id, :domain_id, 'arrays', 'Arrays')"
            ),
            {"id": category_id, "domain_id": domain_id},
        )
        content_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"practice-content-{uuid4().hex[:8]}",
            title="Practice Content",
        )
        other_content_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"other-content-{uuid4().hex[:8]}",
            title="Other Content",
        )
        provider_id = connection.execute(
            text(
                "INSERT INTO practice_providers (slug, name) VALUES ('leetcode', 'LeetCode') "
                "ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id"
            )
        ).scalar_one()
        resource_id, other_resource_id = uuid4(), uuid4()
        for resource, item, url_hash in (
            (resource_id, content_id, "a" * 64),
            (other_resource_id, other_content_id, "b" * 64),
        ):
            connection.execute(
                text(
                    "INSERT INTO practice_resources "
                    "(id, content_item_id, provider_id, url, url_hash, is_primary) "
                    "VALUES (:id, :item, :provider, :url, :hash, true)"
                ),
                {
                    "id": resource,
                    "item": item,
                    "provider": provider_id,
                    "url": f"https://example.test/{resource}",
                    "hash": url_hash,
                },
            )
    engine.dispose()

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = PracticeAttemptService(
        lambda: SqlAlchemyPracticeAttemptUnitOfWork(database.session_factory),
        DeterministicInitialReviewScheduler(),
        None,
    )

    expected_progress = {
        AttemptOutcome.SKIPPED: "new",
        AttemptOutcome.PATTERN_NOT_IDENTIFIED: "learning",
        AttemptOutcome.UNDERSTOOD_BUT_COULD_NOT_CODE: "learning",
        AttemptOutcome.SOLVED_WITH_HINT: "attempted",
        AttemptOutcome.SOLVED_INDEPENDENTLY: "confident",
    }
    for outcome, status in expected_progress.items():
        result = await service.submit(
            profile_id=user_a,
            command=command(
                event_id=uuid4(),
                content_id=content_id,
                resource_id=None,
                outcome=outcome,
            ),
        )
        assert result.newly_applied is True
        assert result.updated_progress == status
        assert result.review_card_id is not None

    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        cursor_before_retry = connection.execute(
            text("SELECT last_cursor FROM user_sync_counters WHERE user_id = :user_id"),
            {"user_id": user_a},
        ).scalar_one()
        changes_before_retry = connection.execute(
            text("SELECT count(*) FROM user_sync_change_log WHERE user_id = :user_id"),
            {"user_id": user_a},
        ).scalar_one()
    engine.dispose()
    retry_command = command(event_id=uuid4(), content_id=content_id, resource_id=resource_id)
    first = await service.submit(profile_id=user_a, command=retry_command)
    retry = await service.submit(profile_id=user_a, command=retry_command)
    assert first.attempt_id == retry.attempt_id
    assert first.newly_applied is True
    assert first.sync_cursor == cursor_before_retry + 1
    assert retry.newly_applied is False
    assert retry.sync_cursor is None
    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        cursor_after_retry = connection.execute(
            text("SELECT last_cursor FROM user_sync_counters WHERE user_id = :user_id"),
            {"user_id": user_a},
        ).scalar_one()
        changes_after_retry = connection.execute(
            text("SELECT count(*) FROM user_sync_change_log WHERE user_id = :user_id"),
            {"user_id": user_a},
        ).scalar_one()
        retry_changes = (
            connection.execute(
                text(
                    "SELECT cursor, entity_type, entity_id, operation "
                    "FROM user_sync_change_log WHERE user_id = :user_id "
                    "AND cursor > :cursor ORDER BY cursor"
                ),
                {"user_id": user_a, "cursor": cursor_before_retry},
            )
            .mappings()
            .all()
        )
    engine.dispose()
    assert cursor_after_retry == first.sync_cursor
    assert len(retry_changes) == 1
    assert changes_after_retry == changes_before_retry + 1
    assert retry_changes[0]["cursor"] == first.sync_cursor
    assert retry_changes[0]["entity_type"] == "review"
    assert retry_changes[0]["entity_id"] == first.review_card_id
    assert retry_changes[0]["operation"] == "upsert"
    later = await service.submit(
        profile_id=user_a,
        command=command(
            event_id=uuid4(),
            content_id=content_id,
            resource_id=resource_id,
            outcome=AttemptOutcome.PATTERN_NOT_IDENTIFIED,
        ),
    )
    assert later.next_review_at != first.next_review_at
    retry_after_later_change = await service.submit(profile_id=user_a, command=retry_command)
    assert retry_after_later_change.attempt_id == first.attempt_id
    assert retry_after_later_change.updated_progress == first.updated_progress
    assert retry_after_later_change.updated_confidence == first.updated_confidence
    assert retry_after_later_change.review_card_id == first.review_card_id
    assert retry_after_later_change.next_review_at == first.next_review_at
    assert retry_after_later_change.sync_cursor is None
    with pytest.raises(AppError) as cross_user_retry:
        await service.submit(profile_id=user_b, command=retry_command)
    assert cross_user_retry.value.status == 409
    with pytest.raises(AppError) as changed_retry:
        await service.submit(
            profile_id=user_a,
            command=replace(retry_command, confidence_after=5),
        )
    assert changed_retry.value.status == 409

    with pytest.raises(AppError) as invalid_resource:
        await service.submit(
            profile_id=user_a,
            command=command(event_id=uuid4(), content_id=content_id, resource_id=other_resource_id),
        )
    assert invalid_resource.value.status == 422

    engine = create_engine(migrated_database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE user_progress SET status = 'mastered', confidence = 99 "
                "WHERE user_id = :user_id AND content_item_id = :content_id"
            ),
            {"user_id": user_a, "content_id": content_id},
        )
    engine.dispose()
    mastered_result = await service.submit(
        profile_id=user_a,
        command=command(
            event_id=uuid4(),
            content_id=content_id,
            resource_id=resource_id,
            outcome=AttemptOutcome.SKIPPED,
        ),
    )
    assert mastered_result.updated_progress == "mastered"
    assert mastered_result.updated_confidence == 99

    failing_service = PracticeAttemptService(
        lambda: FailingAfterApplyUnitOfWork(database.session_factory),
        DeterministicInitialReviewScheduler(),
        None,
    )
    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        cursor_before_failure = connection.execute(
            text("SELECT last_cursor FROM user_sync_counters WHERE user_id = :user_id"),
            {"user_id": user_a},
        ).scalar_one()
        changes_before_failure = connection.execute(
            text("SELECT count(*) FROM user_sync_change_log WHERE user_id = :user_id"),
            {"user_id": user_a},
        ).scalar_one()
    engine.dispose()
    rollback_event_id = uuid4()
    with pytest.raises(RuntimeError, match="mandatory write failure"):
        await failing_service.submit(
            profile_id=user_a,
            command=command(
                event_id=rollback_event_id,
                content_id=content_id,
                resource_id=resource_id,
            ),
        )
    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        cursor_after_failure = connection.execute(
            text("SELECT last_cursor FROM user_sync_counters WHERE user_id = :user_id"),
            {"user_id": user_a},
        ).scalar_one()
        changes_after_failure = connection.execute(
            text("SELECT count(*) FROM user_sync_change_log WHERE user_id = :user_id"),
            {"user_id": user_a},
        ).scalar_one()
    engine.dispose()
    assert cursor_after_failure == cursor_before_failure
    assert changes_after_failure == changes_before_failure

    user_b_result = await service.submit(
        profile_id=user_b,
        command=command(event_id=uuid4(), content_id=content_id, resource_id=resource_id),
    )
    assert user_b_result.newly_applied is True

    concurrent_command = command(event_id=uuid4(), content_id=content_id, resource_id=resource_id)
    concurrent_results = await asyncio.gather(
        service.submit(profile_id=user_a, command=concurrent_command),
        service.submit(profile_id=user_a, command=concurrent_command),
    )
    assert {result.newly_applied for result in concurrent_results} == {False, True}
    assert {result.sync_cursor is None for result in concurrent_results} == {False, True}
    assert len({result.attempt_id for result in concurrent_results}) == 1

    different_outcome_results = await asyncio.gather(
        service.submit(
            profile_id=user_b,
            command=command(
                event_id=uuid4(),
                content_id=other_content_id,
                resource_id=other_resource_id,
                outcome=AttemptOutcome.SOLVED_INDEPENDENTLY,
            ),
        ),
        service.submit(
            profile_id=user_b,
            command=command(
                event_id=uuid4(),
                content_id=other_content_id,
                resource_id=other_resource_id,
                outcome=AttemptOutcome.SKIPPED,
            ),
        ),
    )
    assert len(different_outcome_results) == 2
    concurrent_cursors = sorted(
        result.sync_cursor for result in different_outcome_results if result.sync_cursor is not None
    )
    assert len(concurrent_cursors) == 2
    assert concurrent_cursors[1] == concurrent_cursors[0] + 1

    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        rollback_count = connection.execute(
            text("SELECT count(*) FROM practice_attempts WHERE attempt_event_id = :event_id"),
            {"event_id": rollback_event_id},
        ).scalar_one()
        review_sync_changes = connection.execute(
            text(
                "SELECT count(*) FROM user_sync_change_log "
                "WHERE user_id = :user_id AND entity_type = 'review'"
            ),
            {"user_id": user_a},
        ).scalar_one()
        progress_rows = connection.execute(
            text(
                "SELECT user_id, status, confidence FROM user_progress "
                "WHERE content_item_id = :content_id ORDER BY user_id"
            ),
            {"content_id": content_id},
        ).all()
        concurrent_count = connection.execute(
            text("SELECT count(*) FROM practice_attempts WHERE attempt_event_id = :event_id"),
            {"event_id": concurrent_command.attempt_event_id},
        ).scalar_one()
        concurrent_progress = connection.execute(
            text(
                "SELECT status FROM user_progress "
                "WHERE user_id = :user_id AND content_item_id = :content_id"
            ),
            {"user_id": user_b, "content_id": other_content_id},
        ).scalar_one()
    engine.dispose()
    assert rollback_count == 0
    assert review_sync_changes >= 1
    assert concurrent_count == 1
    assert concurrent_progress == "confident"
    assert {row.user_id for row in progress_rows} == {user_a, user_b}
    await database.close()
