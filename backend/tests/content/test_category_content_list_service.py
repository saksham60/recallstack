from datetime import UTC, datetime
from types import TracebackType
from typing import Self
from uuid import uuid4

import pytest

from recallstack.modules.content.application.category_content_list import (
    CategoryContentListFilters,
    CategoryContentListItem,
    CategoryContentListService,
    ContentUserProgress,
)
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.errors import AppError


class FakeRepository:
    def __init__(self, exists: bool, items: tuple[CategoryContentListItem, ...] = ()) -> None:
        self.exists = exists
        self.items = items
        self.profile_id: object | None = None

    async def category_exists(self, category_id: object) -> bool:
        return self.exists

    async def list_published_content(
        self, *, category_id: object, profile_id: object, filters: CategoryContentListFilters
    ) -> tuple[int, tuple[CategoryContentListItem, ...]]:
        self.profile_id = profile_id
        return len(self.items), self.items


class FakeUnitOfWork:
    def __init__(self, repository: FakeRepository) -> None:
        self.repository = repository

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        return None


def filters(**overrides: object) -> CategoryContentListFilters:
    values: dict[str, object] = {
        "content_type": None,
        "difficulty": None,
        "status": None,
        "topic_slug": None,
        "search": None,
        "page": 2,
        "page_size": 2,
        "sort": "sort_order",
    }
    values.update(overrides)
    return CategoryContentListFilters(**values)  # type: ignore[arg-type]


async def test_category_content_list_calculates_standard_pagination() -> None:
    item = CategoryContentListItem(
        content_item_id=uuid4(),
        slug="two-sum",
        type="problem",
        title="Two Sum",
        summary=None,
        difficulty="easy",
        primary_topic=None,
        primary_practice_resource=None,
        user_progress=ContentUserProgress(LearningStatus.NEW, 0),
        is_bookmarked=False,
        last_opened_at=datetime.now(UTC),
        next_review_at=None,
    )
    repository = FakeRepository(True, (item, item))
    service = CategoryContentListService(lambda: FakeUnitOfWork(repository))

    result = await service.query(category_id=uuid4(), profile_id=uuid4(), filters=filters())

    assert result.total_pages == 1
    assert result.page == 2
    assert result.page_size == 2
    assert result.total_items == 2


async def test_category_content_list_reports_missing_category() -> None:
    service = CategoryContentListService(lambda: FakeUnitOfWork(FakeRepository(False)))

    with pytest.raises(AppError, match="No active category") as error:
        await service.query(category_id=uuid4(), profile_id=uuid4(), filters=filters())

    assert error.value.status == 404
