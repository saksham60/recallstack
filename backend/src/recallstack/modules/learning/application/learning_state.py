from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from math import ceil
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.errors import AppError

VALID_TRANSITIONS: dict[LearningStatus, frozenset[LearningStatus]] = {
    LearningStatus.NEW: frozenset(
        {LearningStatus.NEW, LearningStatus.LEARNING, LearningStatus.ATTEMPTED}
    ),
    LearningStatus.LEARNING: frozenset(
        {
            LearningStatus.NEW,
            LearningStatus.LEARNING,
            LearningStatus.ATTEMPTED,
            LearningStatus.CONFIDENT,
        }
    ),
    LearningStatus.ATTEMPTED: frozenset(
        {
            LearningStatus.NEW,
            LearningStatus.LEARNING,
            LearningStatus.ATTEMPTED,
            LearningStatus.CONFIDENT,
        }
    ),
    LearningStatus.CONFIDENT: frozenset(LearningStatus),
    LearningStatus.MASTERED: frozenset(LearningStatus),
}


@dataclass(frozen=True, slots=True)
class ProgressState:
    content_item_id: UUID
    status: LearningStatus
    confidence: int
    last_opened_at: datetime | None
    row_version: int
    updated_at: datetime | None


@dataclass(frozen=True, slots=True)
class Bookmark:
    content_item_id: UUID
    slug: str
    title: str | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class UserNote:
    id: UUID
    content_item_id: UUID
    kind: str
    title: str | None
    body: str
    row_version: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class Page[T]:
    items: tuple[T, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class LearningStateRepository(Protocol):
    async def content_exists(self, content_item_id: UUID) -> bool: ...

    async def get_progress(
        self, *, profile_id: UUID, content_item_id: UUID
    ) -> ProgressState | None: ...

    async def list_progress(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[ProgressState, ...]]: ...

    async def save_progress(
        self,
        *,
        profile_id: UUID,
        content_item_id: UUID,
        status: LearningStatus,
        confidence: int,
        expected_row_version: int,
    ) -> ProgressState | None: ...

    async def list_bookmarks(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[Bookmark, ...]]: ...

    async def add_bookmark(self, *, profile_id: UUID, content_item_id: UUID) -> bool: ...

    async def remove_bookmark(self, *, profile_id: UUID, content_item_id: UUID) -> bool: ...

    async def list_notes(
        self,
        *,
        profile_id: UUID,
        content_item_id: UUID | None,
        page: int,
        page_size: int,
    ) -> tuple[int, tuple[UserNote, ...]]: ...

    async def create_note(
        self,
        *,
        profile_id: UUID,
        note_id: UUID | None,
        content_item_id: UUID,
        kind: str,
        title: str | None,
        body: str,
    ) -> UserNote: ...

    async def update_note(
        self,
        *,
        profile_id: UUID,
        note_id: UUID,
        kind: str | None,
        title: str | None,
        title_is_set: bool,
        body: str | None,
        expected_row_version: int,
    ) -> UserNote | None: ...

    async def delete_note(
        self, *, profile_id: UUID, note_id: UUID, expected_row_version: int
    ) -> bool | None: ...

    async def active_note_exists(self, *, profile_id: UUID, note_id: UUID) -> bool: ...


class LearningUnitOfWork(Protocol):
    repository: LearningStateRepository

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...

    async def commit(self) -> None: ...


class LearningService:
    def __init__(self, unit_of_work: Callable[[], LearningUnitOfWork]) -> None:
        self._unit_of_work = unit_of_work

    async def get_progress(self, *, profile_id: UUID, content_item_id: UUID) -> ProgressState:
        async with self._unit_of_work() as uow:
            if not await uow.repository.content_exists(content_item_id):
                self._content_not_found(content_item_id)
            state = await uow.repository.get_progress(
                profile_id=profile_id, content_item_id=content_item_id
            )
        return state or ProgressState(
            content_item_id=content_item_id,
            status=LearningStatus.NEW,
            confidence=0,
            last_opened_at=None,
            row_version=0,
            updated_at=None,
        )

    async def list_progress(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> Page[ProgressState]:
        async with self._unit_of_work() as uow:
            total, items = await uow.repository.list_progress(
                profile_id=profile_id, page=page, page_size=page_size
            )
        return self._page(items, page, page_size, total)

    async def save_progress(
        self,
        *,
        profile_id: UUID,
        content_item_id: UUID,
        status: LearningStatus,
        confidence: int,
        expected_row_version: int,
    ) -> ProgressState:
        async with self._unit_of_work() as uow:
            if not await uow.repository.content_exists(content_item_id):
                self._content_not_found(content_item_id)
            current = await uow.repository.get_progress(
                profile_id=profile_id, content_item_id=content_item_id
            )
            current_status = current.status if current is not None else LearningStatus.NEW
            if status not in VALID_TRANSITIONS[current_status]:
                raise AppError(
                    error_type="invalid-progress-transition",
                    title="Invalid progress transition",
                    status=422,
                    detail=f"Cannot transition from '{current_status}' to '{status}'",
                )
            if current is None and expected_row_version != 0:
                self._stale_progress()
            if current is not None and current.row_version != expected_row_version:
                self._stale_progress()
            saved = await uow.repository.save_progress(
                profile_id=profile_id,
                content_item_id=content_item_id,
                status=status,
                confidence=confidence,
                expected_row_version=expected_row_version,
            )
            if saved is None:
                self._stale_progress()
            await uow.commit()
        assert saved is not None
        return saved

    async def list_bookmarks(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> Page[Bookmark]:
        async with self._unit_of_work() as uow:
            total, items = await uow.repository.list_bookmarks(
                profile_id=profile_id, page=page, page_size=page_size
            )
        return self._page(items, page, page_size, total)

    async def add_bookmark(self, *, profile_id: UUID, content_item_id: UUID) -> None:
        async with self._unit_of_work() as uow:
            if not await uow.repository.content_exists(content_item_id):
                self._content_not_found(content_item_id)
            await uow.repository.add_bookmark(
                profile_id=profile_id, content_item_id=content_item_id
            )
            await uow.commit()

    async def remove_bookmark(self, *, profile_id: UUID, content_item_id: UUID) -> None:
        async with self._unit_of_work() as uow:
            await uow.repository.remove_bookmark(
                profile_id=profile_id, content_item_id=content_item_id
            )
            await uow.commit()

    async def list_notes(
        self,
        *,
        profile_id: UUID,
        content_item_id: UUID | None,
        page: int,
        page_size: int,
    ) -> Page[UserNote]:
        async with self._unit_of_work() as uow:
            if content_item_id is not None and not await uow.repository.content_exists(
                content_item_id
            ):
                self._content_not_found(content_item_id)
            total, items = await uow.repository.list_notes(
                profile_id=profile_id,
                content_item_id=content_item_id,
                page=page,
                page_size=page_size,
            )
        return self._page(items, page, page_size, total)

    async def create_note(
        self,
        *,
        profile_id: UUID,
        note_id: UUID | None = None,
        content_item_id: UUID,
        kind: str,
        title: str | None,
        body: str,
    ) -> UserNote:
        async with self._unit_of_work() as uow:
            if not await uow.repository.content_exists(content_item_id):
                self._content_not_found(content_item_id)
            note = await uow.repository.create_note(
                profile_id=profile_id,
                note_id=note_id,
                content_item_id=content_item_id,
                kind=kind,
                title=title,
                body=body,
            )
            await uow.commit()
        return note

    async def update_note(
        self,
        *,
        profile_id: UUID,
        note_id: UUID,
        kind: str | None,
        title: str | None,
        title_is_set: bool,
        body: str | None,
        expected_row_version: int,
    ) -> UserNote:
        async with self._unit_of_work() as uow:
            note = await uow.repository.update_note(
                profile_id=profile_id,
                note_id=note_id,
                kind=kind,
                title=title,
                title_is_set=title_is_set,
                body=body,
                expected_row_version=expected_row_version,
            )
            if note is None:
                if await uow.repository.active_note_exists(profile_id=profile_id, note_id=note_id):
                    self._stale_note()
                self._note_not_found(note_id)
            await uow.commit()
        assert note is not None
        return note

    async def delete_note(
        self, *, profile_id: UUID, note_id: UUID, expected_row_version: int
    ) -> None:
        async with self._unit_of_work() as uow:
            deleted = await uow.repository.delete_note(
                profile_id=profile_id,
                note_id=note_id,
                expected_row_version=expected_row_version,
            )
            if deleted is None:
                if await uow.repository.active_note_exists(profile_id=profile_id, note_id=note_id):
                    self._stale_note()
                self._note_not_found(note_id)
            await uow.commit()

    @staticmethod
    def _page[T](items: tuple[T, ...], page: int, page_size: int, total: int) -> Page[T]:
        return Page(items, page, page_size, total, ceil(total / page_size) if total else 0)

    @staticmethod
    def _content_not_found(content_item_id: UUID) -> None:
        raise AppError(
            error_type="content-not-found",
            title="Content not found",
            status=404,
            detail=f"No content exists with id '{content_item_id}'",
        )

    @staticmethod
    def _note_not_found(note_id: UUID) -> None:
        raise AppError(
            error_type="note-not-found",
            title="Note not found",
            status=404,
            detail=f"No active note exists with id '{note_id}'",
        )

    @staticmethod
    def _stale_progress() -> None:
        raise AppError(
            error_type="stale-progress-version",
            title="Progress has changed",
            status=409,
            detail="Refresh progress before applying this update",
        )

    @staticmethod
    def _stale_note() -> None:
        raise AppError(
            error_type="stale-note-version",
            title="Note has changed",
            status=409,
            detail="Refresh the note before applying this update",
        )
