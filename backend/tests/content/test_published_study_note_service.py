from datetime import UTC, datetime
from types import TracebackType
from typing import Self
from uuid import uuid4

import pytest

from recallstack.modules.content.application.published_study_note import (
    PublishedStudyNote,
    PublishedStudyNoteService,
    StudyNoteDomain,
    StudyNoteUserProgress,
)
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.errors import AppError


def note() -> PublishedStudyNote:
    content_id = uuid4()
    return PublishedStudyNote(
        content_item_id=content_id,
        slug="two-sum",
        domain=StudyNoteDomain(uuid4(), "dsa", "DSA"),
        categories=(),
        topics=(),
        primary_topic=None,
        type="problem",
        difficulty="easy",
        published_version_number=3,
        title="Two Sum",
        summary=None,
        blocks=(),
        related_content=(),
        prerequisites=(),
        practice_resources=(),
        user_progress=StudyNoteUserProgress(LearningStatus.NEW, 0, datetime.now(UTC)),
        is_bookmarked=False,
        review_card=None,
    )


class FakeRepository:
    def __init__(self, result: PublishedStudyNote | None) -> None:
        self.result = result

    async def get_published_document(
        self, *, slug: str, profile_id: object
    ) -> PublishedStudyNote | None:
        return self.result


class FakeUnitOfWork:
    def __init__(self, result: PublishedStudyNote | None) -> None:
        self.repository = FakeRepository(result)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        return None


class FailingRecorder:
    async def record_content_opened(
        self, *, profile_id: object, content_item_id: object, published_version_number: int
    ) -> None:
        raise RuntimeError("publisher unavailable")


async def test_published_note_returns_when_optional_activity_delivery_fails() -> None:
    expected = note()
    service = PublishedStudyNoteService(lambda: FakeUnitOfWork(expected), FailingRecorder())

    result = await service.query(slug=expected.slug, profile_id=uuid4())

    assert result == expected


async def test_published_note_returns_not_found_when_no_published_document_exists() -> None:
    service = PublishedStudyNoteService(lambda: FakeUnitOfWork(None), FailingRecorder())

    with pytest.raises(AppError, match="No published content") as error:
        await service.query(slug="draft-only", profile_id=uuid4())

    assert error.value.status == 404
