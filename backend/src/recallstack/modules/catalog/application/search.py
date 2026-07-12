from collections.abc import Callable
from dataclasses import dataclass
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from recallstack.modules.learning.domain.enums import LearningStatus


@dataclass(frozen=True, slots=True)
class SearchFilters:
    q: str
    domain: str | None
    category: str | None
    topic: str | None
    content_type: str | None
    difficulty: str | None
    page: int
    page_size: int


@dataclass(frozen=True, slots=True)
class SearchResult:
    content_item_id: UUID
    slug: str
    title: str
    summary_excerpt: str | None
    content_type: str
    difficulty: str | None
    matched_topic: str | None
    matched_category: str | None
    progress_status: LearningStatus
    progress_confidence: int
    rank: float


class SearchPort(Protocol):
    async def search(
        self, *, profile_id: UUID, filters: SearchFilters
    ) -> tuple[int, tuple[SearchResult, ...]]: ...


class SearchUnitOfWork(Protocol):
    search: SearchPort

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...


@dataclass(frozen=True, slots=True)
class SearchPage:
    items: tuple[SearchResult, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class SearchService:
    def __init__(self, unit_of_work: Callable[[], SearchUnitOfWork]) -> None:
        self._unit_of_work = unit_of_work

    async def query(self, *, profile_id: UUID, filters: SearchFilters) -> SearchPage:
        async with self._unit_of_work() as uow:
            total, items = await uow.search.search(profile_id=profile_id, filters=filters)
        from math import ceil

        return SearchPage(
            items,
            filters.page,
            filters.page_size,
            total,
            ceil(total / filters.page_size) if total else 0,
        )
