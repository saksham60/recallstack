from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx

from recallstack.main import create_app
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.modules.recall.application.review_submission import (
    DueReview,
    ScheduledReview,
)
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings


class _StubRecallService:
    def __init__(self, profile_id: UUID) -> None:
        self.profile_id = profile_id
        self.now = datetime.now(UTC)
        self.cards = tuple(
            ScheduledReview(
                uuid4(),
                uuid4(),
                "due" if index == 0 else "scheduled",
                self.now + timedelta(days=index),
                index + 1,
                self.now,
                self.now,
            )
            for index in range(3)
        )

    async def scheduled(self, **kwargs: object) -> tuple[int, tuple[ScheduledReview, ...]]:
        assert kwargs["profile_id"] == self.profile_id
        return len(self.cards), self.cards

    async def due(self, **kwargs: object) -> tuple[int, tuple[DueReview, ...]]:
        assert kwargs["profile_id"] == self.profile_id
        card = self.cards[0]
        return 1, (
            DueReview(
                card.id,
                card.next_review_at,
                card.row_version,
                card.content_item_id,
                "due-card",
                "Due card",
                None,
                "problem",
                "easy",
            ),
        )


async def test_all_scheduled_reviews_include_future_while_due_stays_due_only() -> None:
    profile_id = uuid4()
    app = create_app(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
        )
    )
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        profile_id, profile_id, frozenset({"user"})
    )
    service = _StubRecallService(profile_id)
    async with app.router.lifespan_context(app):
        app.state.recall_service = service
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            scheduled = await client.get("/api/v1/me/reviews?page_size=100")
            due = await client.get("/api/v1/me/reviews/due?page_size=100")

    assert scheduled.status_code == 200
    body = scheduled.json()
    assert body["pagination"] == {
        "page": 1,
        "page_size": 100,
        "total_items": 3,
        "total_pages": 1,
    }
    assert [item["state"] for item in body["items"]] == [
        "due",
        "scheduled",
        "scheduled",
    ]
    assert all(item["next_review_at"] for item in body["items"])
    assert due.status_code == 200
    assert len(due.json()["items"]) == 1
