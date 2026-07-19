import asyncio
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, text

from recallstack.composition.recall_uow import SqlAlchemyRecallUnitOfWork
from recallstack.modules.recall.application.review_submission import (
    DeterministicReviewScheduler,
    RecallService,
    SubmitReview,
)
from recallstack.modules.recall.infrastructure.review_repository import SqlAlchemyRecallRepository
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from recallstack.shared.errors import AppError
from tests.integration.test_published_study_note_repository import add_content

pytestmark = pytest.mark.integration


class FailingAfterReviewRepository(SqlAlchemyRecallRepository):
    async def apply_review(self, **kwargs: object):  # type: ignore[no-untyped-def]
        await super().apply_review(**kwargs)  # type: ignore[arg-type]
        raise RuntimeError("simulated review write failure")


class FailingAfterReviewUnitOfWork(SqlAlchemyRecallUnitOfWork):
    async def __aenter__(self):  # type: ignore[no-untyped-def]
        await super().__aenter__()
        assert self._session is not None
        self.repository = FailingAfterReviewRepository(self._session)
        return self


async def test_recall_review_submission_is_safe_and_deterministic(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    domain_id, category_id, user_a, user_b = uuid4(), uuid4(), uuid4(), uuid4()
    ratings = ("again", "hard", "good", "easy")
    cards: list[tuple[UUID, UUID]] = []
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO auth.users (id) VALUES (:a), (:b)"), {"a": user_a, "b": user_b}
        )
        connection.execute(
            text("INSERT INTO profiles (id) VALUES (:a), (:b)"), {"a": user_a, "b": user_b}
        )
        connection.execute(
            text("INSERT INTO domains (id, slug, name) VALUES (:id, :slug, 'Recall')"),
            {"id": domain_id, "slug": f"recall-{domain_id.hex[:8]}"},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name) "
                "VALUES (:id, :domain, 'arrays', 'Arrays')"
            ),
            {"id": category_id, "domain": domain_id},
        )
        for index, _ in enumerate(ratings):
            content_id, _ = add_content(
                connection,
                domain_id=domain_id,
                category_id=category_id,
                slug=f"recall-{index}-{uuid4().hex[:6]}",
                title=f"Recall {index}",
            )
            card_id = uuid4()
            connection.execute(
                text(
                    "INSERT INTO review_cards "
                    "(id, user_id, content_item_id, due_at, interval_days, row_version) "
                    "VALUES (:id, :user, :content, now() - interval '1 hour', 2, 4)"
                ),
                {"id": card_id, "user": user_a, "content": content_id},
            )
            cards.append((card_id, content_id))
        suspended_card, suspended_content = cards[0]
        connection.execute(
            text("UPDATE review_cards SET suspended_at = now() WHERE id = :id"),
            {"id": suspended_card},
        )
        other_card = uuid4()
        connection.execute(
            text(
                "INSERT INTO review_cards (id, user_id, content_item_id, due_at) "
                "VALUES (:id, :user, :content, now() - interval '1 hour')"
            ),
            {"id": other_card, "user": user_b, "content": suspended_content},
        )
    engine.dispose()

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = RecallService(
        lambda: SqlAlchemyRecallUnitOfWork(database.session_factory),
        DeterministicReviewScheduler(),
        None,
    )
    due_total, due_cards = await service.due(profile_id=user_a, page=1, page_size=10)
    assert due_total == 3
    assert suspended_card not in {item.card_id for item in due_cards}

    for rating, (card_id, _) in zip(ratings[1:], cards[1:], strict=True):
        result = await service.submit(
            profile_id=user_a,
            card_id=card_id,
            command=SubmitReview(uuid4(), rating, 4500, datetime.now(UTC), 4),
        )
        assert result.newly_applied is True
        assert result.row_version == 5

    retry_card = cards[1][0]
    retry_command = SubmitReview(uuid4(), "good", 100, datetime.now(UTC), 5)
    first = await service.submit(profile_id=user_a, card_id=retry_card, command=retry_command)
    retry = await service.submit(profile_id=user_a, card_id=retry_card, command=retry_command)
    assert first.review_history_id == retry.review_history_id
    assert retry.newly_applied is False
    with pytest.raises(AppError) as cross_user_event:
        await service.submit(profile_id=user_b, card_id=other_card, command=retry_command)
    assert cross_user_event.value.status == 409
    assert cross_user_event.value.error_type == "stale-review-card-version"
    with pytest.raises(AppError) as stale:
        await service.submit(
            profile_id=user_a,
            card_id=retry_card,
            command=SubmitReview(uuid4(), "good", None, datetime.now(UTC), 5),
        )
    assert stale.value.status == 409
    with pytest.raises(AppError) as ownership:
        await service.submit(
            profile_id=user_a,
            card_id=other_card,
            command=SubmitReview(uuid4(), "good", None, datetime.now(UTC), 1),
        )
    assert ownership.value.status == 404
    with pytest.raises(AppError) as suspended:
        await service.submit(
            profile_id=user_a,
            card_id=suspended_card,
            command=SubmitReview(uuid4(), "good", None, datetime.now(UTC), 4),
        )
    assert suspended.value.status == 404

    concurrent_card = cards[3][0]
    concurrent_results = await asyncio.gather(
        service.submit(
            profile_id=user_a,
            card_id=concurrent_card,
            command=SubmitReview(uuid4(), "good", 100, datetime.now(UTC), 5),
        ),
        service.submit(
            profile_id=user_a,
            card_id=concurrent_card,
            command=SubmitReview(uuid4(), "hard", 200, datetime.now(UTC), 5),
        ),
        return_exceptions=True,
    )
    assert sum(not isinstance(result, Exception) for result in concurrent_results) == 1
    concurrent_failures = [result for result in concurrent_results if isinstance(result, AppError)]
    assert len(concurrent_failures) == 1
    assert concurrent_failures[0].status == 409

    rollback_event = uuid4()
    failing_service = RecallService(
        lambda: FailingAfterReviewUnitOfWork(database.session_factory),
        DeterministicReviewScheduler(),
        None,
    )
    with pytest.raises(RuntimeError, match="review write failure"):
        await failing_service.submit(
            profile_id=user_a,
            card_id=cards[2][0],
            command=SubmitReview(rollback_event, "good", None, datetime.now(UTC), 5),
        )
    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        rolled_back = connection.execute(
            text("SELECT count(*) FROM review_history WHERE review_event_id = :id"),
            {"id": rollback_event},
        ).scalar_one()
    engine.dispose()
    assert rolled_back == 0
    await database.close()
