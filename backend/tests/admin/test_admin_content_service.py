from datetime import UTC, datetime
from types import TracebackType
from typing import Self, cast
from uuid import UUID, uuid4

import pytest

from recallstack.modules.admin.application.content_management import (
    AdminContentService,
    AdminContentUnitOfWork,
    PublishedVersion,
    VersionState,
)
from recallstack.shared.errors import AppError
from recallstack.shared.events import DomainEvent


class FakePublisher:
    def __init__(self) -> None:
        self.events: list[DomainEvent] = []

    async def publish(self, events: tuple[DomainEvent, ...]) -> None:
        self.events.extend(events)


class PublishRepository:
    def __init__(self, version: VersionState) -> None:
        self.version = version
        self.fail_publish = False

    async def lock_version(self, version_id: UUID) -> VersionState | None:
        return self.version if version_id == self.version.id else None

    async def publish_version(
        self, *, version: VersionState, actor_id: UUID, reason: str
    ) -> PublishedVersion:
        if self.fail_publish:
            raise RuntimeError("simulated mandatory database failure")
        return PublishedVersion(
            version.content_item_id,
            version.id,
            1,
            "published",
            version.row_version + 1,
            datetime.now(UTC),
            actor_id,
            actor_id,
        )


class FakeUow:
    def __init__(self, repository: PublishRepository) -> None:
        self.repository = repository
        self.committed = False
        self.rolled_back = False

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if exc_type is not None:
            self.rolled_back = True

    async def commit(self) -> None:
        self.committed = True


def _publishable_version(*, status: str = "in_review", row_version: int = 3) -> VersionState:
    return VersionState(
        id=uuid4(),
        content_item_id=uuid4(),
        domain_id=uuid4(),
        status=status,
        row_version=row_version,
        title="Maximum Subarray",
        item_archived=False,
        block_count=1,
        category_count=1,
        topic_count=1,
        primary_topic_count=1,
    )


async def test_publish_commits_once_and_emits_catalog_event() -> None:
    actor_id = uuid4()
    repository = PublishRepository(_publishable_version())
    uow = FakeUow(repository)
    publisher = FakePublisher()
    service = AdminContentService(lambda: cast(AdminContentUnitOfWork, uow), publisher)

    result = await service.publish(
        version_id=repository.version.id,
        actor_id=actor_id,
        expected_row_version=3,
        reason="Approved",
    )

    assert result.status == "published"
    assert uow.committed is True
    assert uow.rolled_back is False
    assert [event.event_type for event in publisher.events] == ["CatalogContentPublished"]


async def test_published_version_is_immutable_and_stale_write_conflicts() -> None:
    actor_id = uuid4()
    published_repository = PublishRepository(_publishable_version(status="published"))
    service = AdminContentService(
        lambda: cast(AdminContentUnitOfWork, FakeUow(published_repository)), None
    )
    with pytest.raises(AppError) as published_error:
        await service.publish(
            version_id=published_repository.version.id,
            actor_id=actor_id,
            expected_row_version=3,
            reason="Impossible",
        )
    assert published_error.value.status == 409
    assert "immutable" in published_error.value.detail

    stale_repository = PublishRepository(_publishable_version(row_version=4))
    service = AdminContentService(
        lambda: cast(AdminContentUnitOfWork, FakeUow(stale_repository)), None
    )
    with pytest.raises(AppError) as stale_error:
        await service.publish(
            version_id=stale_repository.version.id,
            actor_id=actor_id,
            expected_row_version=3,
            reason="Stale",
        )
    assert stale_error.value.status == 409
    assert "stale" in stale_error.value.detail


async def test_mandatory_publish_failure_rolls_back_and_emits_nothing() -> None:
    actor_id = uuid4()
    repository = PublishRepository(_publishable_version())
    repository.fail_publish = True
    uow = FakeUow(repository)
    publisher = FakePublisher()
    service = AdminContentService(lambda: cast(AdminContentUnitOfWork, uow), publisher)

    with pytest.raises(RuntimeError, match="mandatory database failure"):
        await service.publish(
            version_id=repository.version.id,
            actor_id=actor_id,
            expected_row_version=3,
            reason="Approved",
        )

    assert uow.committed is False
    assert uow.rolled_back is True
    assert publisher.events == []
