from collections.abc import Callable
from dataclasses import dataclass
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from recallstack.modules.catalog.domain.entities import Category
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.errors import AppError


@dataclass(frozen=True, slots=True)
class CategoryDashboardItem:
    id: UUID
    slug: str
    name: str
    description: str | None
    sort_order: int
    total_content_items: int
    not_started_count: int
    learning_count: int
    attempted_count: int
    confident_count: int
    mastered_count: int
    progress_percentage: float


class CatalogCategoryRepository(Protocol):
    async def active_for_domain(self, domain_slug: str) -> tuple[Category, ...] | None: ...


class PublishedCategoryContentRepository(Protocol):
    async def by_category(self, category_ids: tuple[UUID, ...]) -> dict[UUID, frozenset[UUID]]: ...


class LearningProgressReadRepository(Protocol):
    async def for_content(
        self, profile_id: UUID, content_item_ids: frozenset[UUID]
    ) -> dict[UUID, LearningStatus]: ...


class CategoryDashboardUnitOfWork(Protocol):
    categories: CatalogCategoryRepository
    published_content: PublishedCategoryContentRepository
    progress: LearningProgressReadRepository

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...


class CategoryDashboardService:
    def __init__(self, unit_of_work: Callable[[], CategoryDashboardUnitOfWork]) -> None:
        self._unit_of_work = unit_of_work

    async def query(
        self, *, domain_slug: str, profile_id: UUID
    ) -> tuple[CategoryDashboardItem, ...]:
        async with self._unit_of_work() as uow:
            categories = await uow.categories.active_for_domain(domain_slug)
            if categories is None:
                raise AppError(
                    error_type="domain-not-found",
                    title="Domain not found",
                    status=404,
                    detail=f"No active domain exists with slug '{domain_slug}'",
                )
            content_by_category = await uow.published_content.by_category(
                tuple(category.id for category in categories)
            )
            all_content = frozenset().union(*content_by_category.values())
            progress = await uow.progress.for_content(profile_id, all_content)

        return tuple(
            self._build_item(category, content_by_category.get(category.id, frozenset()), progress)
            for category in categories
        )

    @staticmethod
    def _build_item(
        category: Category,
        content_ids: frozenset[UUID],
        progress: dict[UUID, LearningStatus],
    ) -> CategoryDashboardItem:
        counts = {status: 0 for status in LearningStatus}
        for content_id in content_ids:
            counts[progress.get(content_id, LearningStatus.NEW)] += 1
        total = len(content_ids)
        not_started = counts[LearningStatus.NEW]
        percentage = round(((total - not_started) / total) * 100, 2) if total else 0.0
        return CategoryDashboardItem(
            id=category.id,
            slug=category.slug,
            name=category.name,
            description=category.description,
            sort_order=category.sort_order,
            total_content_items=total,
            not_started_count=not_started,
            learning_count=counts[LearningStatus.LEARNING],
            attempted_count=counts[LearningStatus.ATTEMPTED],
            confident_count=counts[LearningStatus.CONFIDENT],
            mastered_count=counts[LearningStatus.MASTERED],
            progress_percentage=percentage,
        )
