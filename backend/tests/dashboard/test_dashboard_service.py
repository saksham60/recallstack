from types import TracebackType
from typing import Self
from uuid import UUID, uuid4

import pytest

from recallstack.modules.catalog.application.category_dashboard import CategoryDashboardService
from recallstack.modules.catalog.domain.entities import Category
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.errors import AppError


class FakeCategories:
    def __init__(self, categories: tuple[Category, ...] | None) -> None:
        self.categories = categories

    async def active_for_domain(self, domain_slug: str) -> tuple[Category, ...] | None:
        return self.categories


class FakePublishedContent:
    def __init__(self, values: dict[UUID, frozenset[UUID]]) -> None:
        self.values = values

    async def by_category(self, category_ids: tuple[UUID, ...]) -> dict[UUID, frozenset[UUID]]:
        return self.values


class FakeProgress:
    def __init__(self, values: dict[UUID, dict[UUID, LearningStatus]]) -> None:
        self.values = values

    async def for_content(
        self, profile_id: UUID, content_item_ids: frozenset[UUID]
    ) -> dict[UUID, LearningStatus]:
        return {
            content_id: status
            for content_id, status in self.values.get(profile_id, {}).items()
            if content_id in content_item_ids
        }


class FakeDashboardUow:
    def __init__(
        self,
        categories: tuple[Category, ...] | None,
        content: dict[UUID, frozenset[UUID]],
        progress: dict[UUID, dict[UUID, LearningStatus]],
    ) -> None:
        self.categories = FakeCategories(categories)
        self.published_content = FakePublishedContent(content)
        self.progress = FakeProgress(progress)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        return None


def category() -> Category:
    return Category(uuid4(), uuid4(), None, "arrays", "Arrays", None, 0)


async def test_category_with_no_content_has_zero_metrics() -> None:
    item = category()
    service = CategoryDashboardService(
        lambda: FakeDashboardUow((item,), {item.id: frozenset()}, {})
    )

    result = await service.query(domain_slug="dsa", profile_id=uuid4())

    assert result[0].total_content_items == 0
    assert result[0].progress_percentage == 0


async def test_missing_progress_is_not_started_and_mixed_progress_is_counted() -> None:
    item = category()
    user = uuid4()
    content_ids = tuple(uuid4() for _ in range(5))
    statuses = {
        content_ids[1]: LearningStatus.LEARNING,
        content_ids[2]: LearningStatus.ATTEMPTED,
        content_ids[3]: LearningStatus.CONFIDENT,
        content_ids[4]: LearningStatus.MASTERED,
    }
    service = CategoryDashboardService(
        lambda: FakeDashboardUow((item,), {item.id: frozenset(content_ids)}, {user: statuses})
    )

    result = (await service.query(domain_slug="dsa", profile_id=user))[0]

    assert result.not_started_count == 1
    assert result.learning_count == 1
    assert result.attempted_count == 1
    assert result.confident_count == 1
    assert result.mastered_count == 1
    assert result.progress_percentage == 80.0


async def test_progress_is_scoped_to_requested_profile() -> None:
    item = category()
    content_id = uuid4()
    user_a, user_b = uuid4(), uuid4()
    service = CategoryDashboardService(
        lambda: FakeDashboardUow(
            (item,),
            {item.id: frozenset({content_id})},
            {user_b: {content_id: LearningStatus.MASTERED}},
        )
    )

    result = (await service.query(domain_slug="dsa", profile_id=user_a))[0]

    assert result.not_started_count == 1
    assert result.mastered_count == 0


async def test_domain_not_found_is_explicit() -> None:
    service = CategoryDashboardService(lambda: FakeDashboardUow(None, {}, {}))
    with pytest.raises(AppError) as error:
        await service.query(domain_slug="missing", profile_id=uuid4())
    assert error.value.status == 404
