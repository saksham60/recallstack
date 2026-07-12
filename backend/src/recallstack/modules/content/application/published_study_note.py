import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from types import TracebackType
from typing import Protocol, Self
from uuid import UUID

from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.errors import AppError

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class StudyNoteDomain:
    id: UUID
    slug: str
    name: str


@dataclass(frozen=True, slots=True)
class StudyNoteCategory:
    id: UUID
    slug: str
    name: str
    sort_order: int


@dataclass(frozen=True, slots=True)
class StudyNoteTopic:
    id: UUID
    slug: str
    name: str
    kind: str
    is_primary: bool
    sort_order: int


@dataclass(frozen=True, slots=True)
class StudyNoteBlock:
    id: UUID
    type: str
    heading: str | None
    position: int
    payload: dict[str, object]


@dataclass(frozen=True, slots=True)
class StudyNoteContentReference:
    content_item_id: UUID
    slug: str
    type: str
    difficulty: str | None
    title: str
    summary: str | None
    relation_type: str
    sort_order: int


@dataclass(frozen=True, slots=True)
class StudyNotePracticeResource:
    id: UUID
    provider_slug: str
    provider_name: str
    external_key: str | None
    title: str | None
    url: str
    is_primary: bool
    sort_order: int


@dataclass(frozen=True, slots=True)
class StudyNoteUserProgress:
    status: LearningStatus
    confidence: int
    last_opened_at: datetime | None


@dataclass(frozen=True, slots=True)
class StudyNoteReviewCard:
    due_at: datetime
    interval_days: float
    review_count: int
    lapse_count: int
    last_reviewed_at: datetime | None


@dataclass(frozen=True, slots=True)
class PublishedStudyNote:
    content_item_id: UUID
    slug: str
    domain: StudyNoteDomain
    categories: tuple[StudyNoteCategory, ...]
    topics: tuple[StudyNoteTopic, ...]
    primary_topic: StudyNoteTopic | None
    type: str
    difficulty: str | None
    published_version_number: int
    title: str
    summary: str | None
    blocks: tuple[StudyNoteBlock, ...]
    related_content: tuple[StudyNoteContentReference, ...]
    prerequisites: tuple[StudyNoteContentReference, ...]
    practice_resources: tuple[StudyNotePracticeResource, ...]
    user_progress: StudyNoteUserProgress
    is_bookmarked: bool
    review_card: StudyNoteReviewCard | None


class PublishedStudyNoteReadRepository(Protocol):
    async def get_published_document(
        self, *, slug: str, profile_id: UUID
    ) -> PublishedStudyNote | None: ...


class PublishedStudyNoteUnitOfWork(Protocol):
    repository: PublishedStudyNoteReadRepository

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...


class ContentOpenedRecorder(Protocol):
    async def record_content_opened(
        self, *, profile_id: UUID, content_item_id: UUID, published_version_number: int
    ) -> None: ...


class PublishedStudyNoteService:
    def __init__(
        self,
        unit_of_work: Callable[[], PublishedStudyNoteUnitOfWork],
        activity_recorder: ContentOpenedRecorder,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._activity_recorder = activity_recorder

    async def query(self, *, slug: str, profile_id: UUID) -> PublishedStudyNote:
        async with self._unit_of_work() as uow:
            note = await uow.repository.get_published_document(slug=slug, profile_id=profile_id)
        if note is None:
            raise AppError(
                error_type="content-not-found",
                title="Content not found",
                status=404,
                detail=f"No published content exists with slug '{slug}'",
            )
        try:
            await self._activity_recorder.record_content_opened(
                profile_id=profile_id,
                content_item_id=note.content_item_id,
                published_version_number=note.published_version_number,
            )
        except Exception:
            logger.warning(
                "content_opened_recording_failed",
                extra={"profile_id": str(profile_id), "content_item_id": str(note.content_item_id)},
                exc_info=True,
            )
        return note
