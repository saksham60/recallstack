from datetime import UTC, datetime
from types import TracebackType
from typing import Self
from uuid import UUID, uuid4

import httpx

from recallstack.main import create_app
from recallstack.modules.content.application.category_content_list import (
    CategoryContentListFilters,
    CategoryContentListItem,
    CategoryContentListService,
    ContentUserProgress,
)
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings


class FakeRepository:
    async def category_exists(self, category_id: UUID) -> bool:
        return category_id != UUID("00000000-0000-0000-0000-000000000000")

    async def list_published_content(
        self,
        *,
        category_id: UUID,
        profile_id: UUID,
        filters: CategoryContentListFilters,
    ) -> tuple[int, tuple[CategoryContentListItem, ...]]:
        assert filters.content_type in {None, "problem"}
        return 1, (
            CategoryContentListItem(
                content_item_id=uuid4(),
                slug="two-sum",
                type="problem",
                title="Two Sum",
                summary="Find a pair.",
                difficulty="easy",
                primary_topic=None,
                primary_practice_resource=None,
                user_progress=ContentUserProgress(LearningStatus.NEW, 0),
                is_bookmarked=False,
                last_opened_at=datetime.now(UTC),
                next_review_at=None,
            ),
        )


class FakeUnitOfWork:
    repository = FakeRepository()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        return None


def make_app():
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    subject = uuid4()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        subject, subject, frozenset({"user"})
    )
    return app


async def test_category_content_requires_authentication() -> None:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(f"/api/v1/categories/{uuid4()}/content")
    assert response.status_code == 401


async def test_category_content_returns_items_and_pagination() -> None:
    app = make_app()
    async with app.router.lifespan_context(app):
        app.state.category_content_list_service = CategoryContentListService(
            lambda: FakeUnitOfWork()
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                f"/api/v1/categories/{uuid4()}/content?type=problem&page=1&page_size=25"
            )
    assert response.status_code == 200
    body = response.json()
    assert body["items"][0]["user_progress"] == {"status": "new", "confidence": 0}
    assert body["items"][0]["is_bookmarked"] is False
    assert body["pagination"] == {
        "page": 1,
        "page_size": 25,
        "total_items": 1,
        "total_pages": 1,
    }


async def test_category_content_rejects_invalid_filters() -> None:
    app = make_app()
    async with app.router.lifespan_context(app):
        app.state.category_content_list_service = CategoryContentListService(
            lambda: FakeUnitOfWork()
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(
                f"/api/v1/categories/{uuid4()}/content?difficulty=impossible&page_size=101"
            )
    assert response.status_code == 422
