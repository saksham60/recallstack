from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from math import ceil
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.errors import AppError


@dataclass(frozen=True, slots=True)
class CategoryContentListFilters:
    content_type: str | None
    difficulty: str | None
    status: LearningStatus | None
    topic_slug: str | None
    search: str | None
    page: int
    page_size: int
    sort: str


@dataclass(frozen=True, slots=True)
class PrimaryTopic:
    slug: str
    name: str


@dataclass(frozen=True, slots=True)
class PrimaryPracticeResource:
    id: UUID
    provider_slug: str
    provider_name: str
    title: str | None
    url: str


@dataclass(frozen=True, slots=True)
class ContentUserProgress:
    status: LearningStatus
    confidence: int


@dataclass(frozen=True, slots=True)
class CategoryContentListItem:
    content_item_id: UUID
    slug: str
    type: str
    title: str
    summary: str | None
    difficulty: str | None
    primary_topic: PrimaryTopic | None
    primary_practice_resource: PrimaryPracticeResource | None
    user_progress: ContentUserProgress
    is_bookmarked: bool
    last_opened_at: datetime | None
    next_review_at: datetime | None


@dataclass(frozen=True, slots=True)
class CategoryContentPage:
    items: tuple[CategoryContentListItem, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CategoryContentReadRepository(Protocol):
    async def category_exists(self, category_id: UUID) -> bool: ...

    async def list_published_content(
        self,
        *,
        category_id: UUID,
        profile_id: UUID,
        filters: CategoryContentListFilters,
    ) -> tuple[int, tuple[CategoryContentListItem, ...]]: ...


class CategoryContentReadUnitOfWork(Protocol):
    repository: CategoryContentReadRepository

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...


class CategoryContentListService:
    def __init__(self, unit_of_work: Callable[[], CategoryContentReadUnitOfWork]) -> None:
        self._unit_of_work = unit_of_work

    async def query(
        self,
        *,
        category_id: UUID,
        profile_id: UUID,
        filters: CategoryContentListFilters,
    ) -> CategoryContentPage:
        async with self._unit_of_work() as uow:
            if not await uow.repository.category_exists(category_id):
                raise AppError(
                    error_type="category-not-found",
                    title="Category not found",
                    status=404,
                    detail=f"No active category exists with id '{category_id}'",
                )
            total_items, items = await uow.repository.list_published_content(
                category_id=category_id,
                profile_id=profile_id,
                filters=filters,
            )
        return CategoryContentPage(
            items=items,
            page=filters.page,
            page_size=filters.page_size,
            total_items=total_items,
            total_pages=ceil(total_items / filters.page_size) if total_items else 0,
        )
