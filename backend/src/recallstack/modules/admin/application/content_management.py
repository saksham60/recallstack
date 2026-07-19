import hashlib
import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from types import TracebackType
from typing import Protocol, Self
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID, uuid4

from recallstack.shared.errors import AppError
from recallstack.shared.events import DomainEvent, EventPublisher

logger = logging.getLogger(__name__)

_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_PROBLEM_DIFFICULTIES = frozenset({"easy", "medium", "hard"})
_CONTENT_TYPES = frozenset(
    {"problem", "concept", "pattern", "article", "architecture", "case_study"}
)


@dataclass(frozen=True, slots=True)
class CreateContent:
    domain_id: UUID
    slug: str
    content_type: str
    difficulty: str | None


@dataclass(frozen=True, slots=True)
class CreatedContent:
    content_item_id: UUID
    draft_version_id: UUID
    domain_id: UUID
    slug: str
    content_type: str
    difficulty: str | None
    version_number: int
    version_status: str


@dataclass(frozen=True, slots=True)
class CreatedDraft:
    content_item_id: UUID
    draft_version_id: UUID
    version_number: int
    version_status: str
    row_version: int


@dataclass(frozen=True, slots=True)
class WorkflowHistoryEntry:
    from_status: str | None
    to_status: str
    changed_by: UUID | None
    reason: str | None
    changed_at: datetime


@dataclass(frozen=True, slots=True)
class VersionSummary:
    id: UUID
    content_item_id: UUID
    version_number: int
    status: str
    title: str
    summary: str | None
    authored_by: UUID | None
    reviewed_by: UUID | None
    published_by: UUID | None
    published_at: datetime | None
    row_version: int
    created_at: datetime
    updated_at: datetime
    history: tuple[WorkflowHistoryEntry, ...]


@dataclass(frozen=True, slots=True)
class VersionPage:
    items: tuple[VersionSummary, ...]
    page: int
    page_size: int
    total_items: int


@dataclass(frozen=True, slots=True)
class VersionState:
    id: UUID
    content_item_id: UUID
    domain_id: UUID
    status: str
    row_version: int
    title: str
    item_archived: bool
    block_count: int
    category_count: int
    topic_count: int
    primary_topic_count: int


@dataclass(frozen=True, slots=True)
class ContentItemState:
    id: UUID
    domain_id: UUID
    archived_at: datetime | None
    practice_resources_revision: int


@dataclass(frozen=True, slots=True)
class DocumentBlock:
    block_type: str
    heading: str | None
    payload: dict[str, object]


@dataclass(frozen=True, slots=True)
class StoredDocumentBlock:
    block_type: str
    heading: str | None
    payload: dict[str, object]
    plain_text: str | None
    content_hash: str


@dataclass(frozen=True, slots=True)
class TopicAssignment:
    topic_id: UUID
    is_primary: bool
    sort_order: int


@dataclass(frozen=True, slots=True)
class UpdateDocument:
    expected_row_version: int
    title: str
    summary: str | None
    blocks: tuple[DocumentBlock, ...]
    category_ids: tuple[UUID, ...]
    topics: tuple[TopicAssignment, ...]


@dataclass(frozen=True, slots=True)
class PracticeResourceInput:
    id: UUID | None
    provider_id: int
    external_key: str | None
    url: str
    title: str | None
    is_primary: bool
    sort_order: int


@dataclass(frozen=True, slots=True)
class StoredPracticeResourceInput:
    id: UUID | None
    provider_id: int
    external_key: str | None
    url: str
    url_hash: str
    title: str | None
    is_primary: bool
    sort_order: int


@dataclass(frozen=True, slots=True)
class PracticeResource:
    id: UUID
    provider_id: int
    external_key: str | None
    url: str
    title: str | None
    is_primary: bool
    sort_order: int


@dataclass(frozen=True, slots=True)
class PracticeResourceSet:
    content_item_id: UUID
    revision: int
    resources: tuple[PracticeResource, ...]


@dataclass(frozen=True, slots=True)
class PublishedVersion:
    content_item_id: UUID
    version_id: UUID
    version_number: int
    status: str
    row_version: int
    published_at: datetime
    reviewed_by: UUID
    published_by: UUID


@dataclass(frozen=True, slots=True)
class ArchivedContent:
    content_item_id: UUID
    archived_at: datetime


class DuplicateContentSlug(Exception):
    """The database rejected a duplicate domain-scoped content slug."""


class InvalidAdminReference(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class AdminWriteConflict(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class AdminContentRepository(Protocol):
    async def active_domain_exists(self, domain_id: UUID) -> bool: ...

    async def create_content(self, *, actor_id: UUID, command: CreateContent) -> CreatedContent: ...

    async def content_exists(self, content_item_id: UUID) -> bool: ...

    async def list_versions(
        self, *, content_item_id: UUID, offset: int, limit: int
    ) -> tuple[int, tuple[VersionSummary, ...]]: ...

    async def create_next_draft(self, *, content_item_id: UUID, actor_id: UUID) -> CreatedDraft: ...

    async def lock_version(self, version_id: UUID) -> VersionState | None: ...

    async def validate_taxonomy(
        self,
        *,
        domain_id: UUID,
        category_ids: tuple[UUID, ...],
        topic_ids: tuple[UUID, ...],
    ) -> None: ...

    async def replace_document(
        self,
        *,
        version: VersionState,
        actor_id: UUID,
        title: str,
        summary: str | None,
        blocks: tuple[StoredDocumentBlock, ...],
        category_ids: tuple[UUID, ...],
        topics: tuple[TopicAssignment, ...],
    ) -> VersionSummary: ...

    async def transition_version(
        self,
        *,
        version: VersionState,
        actor_id: UUID,
        to_status: str,
        reason: str | None,
    ) -> VersionSummary: ...

    async def publish_version(
        self, *, version: VersionState, actor_id: UUID, reason: str
    ) -> PublishedVersion: ...

    async def lock_content_item(self, content_item_id: UUID) -> ContentItemState | None: ...

    async def replace_practice_resources(
        self,
        *,
        item: ContentItemState,
        actor_id: UUID,
        resources: tuple[StoredPracticeResourceInput, ...],
    ) -> PracticeResourceSet: ...

    async def archive_content(
        self, *, item: ContentItemState, actor_id: UUID, reason: str
    ) -> ArchivedContent: ...


class AdminContentUnitOfWork(Protocol):
    @property
    def repository(self) -> AdminContentRepository: ...

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...

    async def commit(self) -> None: ...


class AdminContentService:
    def __init__(
        self,
        unit_of_work: Callable[[], AdminContentUnitOfWork],
        publisher: EventPublisher | None,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._publisher = publisher

    async def create_content(self, *, actor_id: UUID, command: CreateContent) -> CreatedContent:
        normalized = self._validated_create(command)
        try:
            async with self._unit_of_work() as uow:
                if not await uow.repository.active_domain_exists(normalized.domain_id):
                    raise self._validation("The selected domain does not exist or is inactive")
                result = await uow.repository.create_content(actor_id=actor_id, command=normalized)
                await uow.commit()
        except DuplicateContentSlug as exc:
            raise AppError(
                error_type="content-slug-conflict",
                title="Content slug already exists",
                status=409,
                detail="A content item with this slug already exists in the domain",
            ) from exc
        return result

    async def list_versions(
        self, *, content_item_id: UUID, page: int, page_size: int
    ) -> VersionPage:
        async with self._unit_of_work() as uow:
            if not await uow.repository.content_exists(content_item_id):
                raise self._not_found("Content item was not found")
            total, items = await uow.repository.list_versions(
                content_item_id=content_item_id,
                offset=(page - 1) * page_size,
                limit=page_size,
            )
        return VersionPage(items, page, page_size, total)

    async def create_draft(self, *, content_item_id: UUID, actor_id: UUID) -> CreatedDraft:
        try:
            async with self._unit_of_work() as uow:
                result = await uow.repository.create_next_draft(
                    content_item_id=content_item_id, actor_id=actor_id
                )
                await uow.commit()
        except InvalidAdminReference as exc:
            raise self._not_found(exc.detail) from exc
        except AdminWriteConflict as exc:
            raise self._conflict(exc.detail) from exc
        return result

    async def update_document(
        self, *, version_id: UUID, actor_id: UUID, command: UpdateDocument
    ) -> VersionSummary:
        self._validate_document(command)
        stored_blocks = tuple(self._materialize_block(block) for block in command.blocks)
        if len({(block.block_type, block.content_hash) for block in stored_blocks}) != len(
            stored_blocks
        ):
            raise self._validation("A document cannot contain the same immutable block twice")
        try:
            async with self._unit_of_work() as uow:
                version = await self._require_version(uow.repository, version_id)
                self._require_editable(version, command.expected_row_version)
                await uow.repository.validate_taxonomy(
                    domain_id=version.domain_id,
                    category_ids=command.category_ids,
                    topic_ids=tuple(topic.topic_id for topic in command.topics),
                )
                result = await uow.repository.replace_document(
                    version=version,
                    actor_id=actor_id,
                    title=command.title.strip(),
                    summary=command.summary.strip() if command.summary else None,
                    blocks=stored_blocks,
                    category_ids=command.category_ids,
                    topics=command.topics,
                )
                await uow.commit()
        except InvalidAdminReference as exc:
            raise self._validation(exc.detail) from exc
        except AdminWriteConflict as exc:
            raise self._conflict(exc.detail) from exc
        return result

    async def submit_review(
        self,
        *,
        version_id: UUID,
        actor_id: UUID,
        expected_row_version: int,
        reason: str | None,
    ) -> VersionSummary:
        try:
            async with self._unit_of_work() as uow:
                version = await self._require_version(uow.repository, version_id)
                self._require_state(version, "draft", expected_row_version)
                result = await uow.repository.transition_version(
                    version=version,
                    actor_id=actor_id,
                    to_status="in_review",
                    reason=reason.strip() if reason else None,
                )
                await uow.commit()
        except AdminWriteConflict as exc:
            raise self._conflict(exc.detail) from exc
        return result

    async def return_to_draft(
        self,
        *,
        version_id: UUID,
        actor_id: UUID,
        expected_row_version: int,
        reason: str,
    ) -> VersionSummary:
        try:
            async with self._unit_of_work() as uow:
                version = await self._require_version(uow.repository, version_id)
                self._require_state(version, "in_review", expected_row_version)
                result = await uow.repository.transition_version(
                    version=version,
                    actor_id=actor_id,
                    to_status="draft",
                    reason=reason.strip(),
                )
                await uow.commit()
        except AdminWriteConflict as exc:
            raise self._conflict(exc.detail) from exc
        return result

    async def publish(
        self,
        *,
        version_id: UUID,
        actor_id: UUID,
        expected_row_version: int,
        reason: str,
    ) -> PublishedVersion:
        try:
            async with self._unit_of_work() as uow:
                version = await self._require_version(uow.repository, version_id)
                self._require_state(version, "in_review", expected_row_version)
                if not version.title.strip():
                    raise self._validation("A published version requires a non-empty title")
                if version.block_count < 1:
                    raise self._validation(
                        "A published version requires at least one content block"
                    )
                if version.topic_count and version.primary_topic_count != 1:
                    raise self._validation(
                        "Published content with topics requires one primary topic"
                    )
                result = await uow.repository.publish_version(
                    version=version, actor_id=actor_id, reason=reason.strip()
                )
                await uow.commit()
        except AdminWriteConflict as exc:
            raise self._conflict(exc.detail) from exc
        await self._publish_catalog_event(
            event_type="CatalogContentPublished",
            actor_id=actor_id,
            content_item_id=result.content_item_id,
            version_id=result.version_id,
            occurred_at=result.published_at,
        )
        return result

    async def replace_practice_resources(
        self,
        *,
        content_item_id: UUID,
        actor_id: UUID,
        expected_revision: int,
        resources: tuple[PracticeResourceInput, ...],
    ) -> PracticeResourceSet:
        self._validate_resource_set(resources)
        stored = tuple(self._materialize_resource(resource) for resource in resources)
        if len({(r.provider_id, r.url_hash) for r in stored}) != len(stored):
            raise self._validation("Practice resource URLs must be unique per provider")
        try:
            async with self._unit_of_work() as uow:
                item = await uow.repository.lock_content_item(content_item_id)
                if item is None:
                    raise self._not_found("Content item was not found")
                if item.archived_at is not None:
                    raise self._conflict("Archived content cannot be modified")
                if item.practice_resources_revision != expected_revision:
                    raise self._conflict("Practice resource revision is stale")
                result = await uow.repository.replace_practice_resources(
                    item=item, actor_id=actor_id, resources=stored
                )
                await uow.commit()
        except InvalidAdminReference as exc:
            raise self._validation(exc.detail) from exc
        except AdminWriteConflict as exc:
            raise self._conflict(exc.detail) from exc
        return result

    async def archive(
        self, *, content_item_id: UUID, actor_id: UUID, reason: str
    ) -> ArchivedContent:
        async with self._unit_of_work() as uow:
            item = await uow.repository.lock_content_item(content_item_id)
            if item is None:
                raise self._not_found("Content item was not found")
            result = await uow.repository.archive_content(
                item=item, actor_id=actor_id, reason=reason.strip()
            )
            await uow.commit()
        await self._publish_catalog_event(
            event_type="CatalogContentArchived",
            actor_id=actor_id,
            content_item_id=result.content_item_id,
            version_id=None,
            occurred_at=result.archived_at,
        )
        return result

    @staticmethod
    async def _require_version(
        repository: AdminContentRepository, version_id: UUID
    ) -> VersionState:
        version = await repository.lock_version(version_id)
        if version is None:
            raise AdminContentService._not_found("Content version was not found")
        if version.item_archived:
            raise AdminContentService._conflict("Archived content cannot be modified")
        return version

    @staticmethod
    def _require_editable(version: VersionState, expected_row_version: int) -> None:
        AdminContentService._require_state(version, "draft", expected_row_version)

    @staticmethod
    def _require_state(
        version: VersionState, required_status: str, expected_row_version: int
    ) -> None:
        if version.status != required_status:
            if version.status == "published":
                raise AdminContentService._conflict("Published versions are immutable")
            raise AdminContentService._conflict(
                f"Version must be {required_status} for this operation"
            )
        if version.row_version != expected_row_version:
            raise AdminContentService._conflict("Content version row_version is stale")

    @staticmethod
    def _validated_create(command: CreateContent) -> CreateContent:
        slug = command.slug.strip().lower()
        if not 3 <= len(slug) <= 120 or _SLUG_PATTERN.fullmatch(slug) is None:
            raise AdminContentService._validation("slug must be lowercase kebab-case")
        if command.content_type not in _CONTENT_TYPES:
            raise AdminContentService._validation("Unsupported content type")
        if command.content_type == "problem" and command.difficulty not in _PROBLEM_DIFFICULTIES:
            raise AdminContentService._validation(
                "difficulty is required for problems and must be easy, medium, or hard"
            )
        if command.content_type != "problem" and command.difficulty is not None:
            raise AdminContentService._validation("difficulty must be null for non-problem content")
        return CreateContent(command.domain_id, slug, command.content_type, command.difficulty)

    @staticmethod
    def _validate_document(command: UpdateDocument) -> None:
        if len(set(command.category_ids)) != len(command.category_ids):
            raise AdminContentService._validation("category_ids must be unique")
        topic_ids = tuple(topic.topic_id for topic in command.topics)
        if len(set(topic_ids)) != len(topic_ids):
            raise AdminContentService._validation("topics must be unique")
        if sum(topic.is_primary for topic in command.topics) > 1:
            raise AdminContentService._validation("At most one topic may be primary")

    @staticmethod
    def _validate_resource_set(resources: tuple[PracticeResourceInput, ...]) -> None:
        supplied_ids = tuple(resource.id for resource in resources if resource.id is not None)
        if len(set(supplied_ids)) != len(supplied_ids):
            raise AdminContentService._validation("Practice resource IDs must be unique")
        sort_orders = tuple(resource.sort_order for resource in resources)
        if len(set(sort_orders)) != len(sort_orders):
            raise AdminContentService._validation(
                "Practice resource sort_order values must be unique"
            )
        if sum(resource.is_primary for resource in resources) > 1:
            raise AdminContentService._validation(
                "At most one active practice resource may be primary"
            )

    @staticmethod
    def _materialize_block(block: DocumentBlock) -> StoredDocumentBlock:
        canonical = json.dumps(
            block.payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        )
        plain_text = AdminContentService._plain_text(block.payload)
        return StoredDocumentBlock(
            block.block_type,
            block.heading.strip() if block.heading else None,
            block.payload,
            plain_text or None,
            hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        )

    @staticmethod
    def _plain_text(value: object) -> str:
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, dict):
            return " ".join(
                part for child in value.values() if (part := AdminContentService._plain_text(child))
            )
        if isinstance(value, list):
            return " ".join(
                part for child in value if (part := AdminContentService._plain_text(child))
            )
        return ""

    @staticmethod
    def _materialize_resource(resource: PracticeResourceInput) -> StoredPracticeResourceInput:
        parts = urlsplit(resource.url.strip())
        if (
            parts.scheme.lower() != "https"
            or not parts.hostname
            or parts.username
            or parts.password
        ):
            raise AdminContentService._validation(
                "Practice resource URL must be an absolute HTTPS URL without credentials"
            )
        hostname = parts.hostname.lower()
        if ":" in hostname and not hostname.startswith("["):
            hostname = f"[{hostname}]"
        port = f":{parts.port}" if parts.port and parts.port != 443 else ""
        normalized = urlunsplit(("https", f"{hostname}{port}", parts.path or "/", parts.query, ""))
        return StoredPracticeResourceInput(
            resource.id,
            resource.provider_id,
            resource.external_key.strip() if resource.external_key else None,
            normalized,
            hashlib.sha256(normalized.encode("utf-8")).hexdigest(),
            resource.title.strip() if resource.title else None,
            resource.is_primary,
            resource.sort_order,
        )

    async def _publish_catalog_event(
        self,
        *,
        event_type: str,
        actor_id: UUID,
        content_item_id: UUID,
        version_id: UUID | None,
        occurred_at: datetime,
    ) -> None:
        if self._publisher is None:
            return
        payload = {"actor_id": str(actor_id), "content_item_id": str(content_item_id)}
        if version_id is not None:
            payload["version_id"] = str(version_id)
        try:
            await self._publisher.publish((DomainEvent(uuid4(), event_type, occurred_at, payload),))
        except Exception:
            logger.warning("admin_catalog_event_publish_failed", exc_info=True)

    @staticmethod
    def _not_found(detail: str) -> AppError:
        return AppError(
            error_type="admin-content-not-found",
            title="Content not found",
            status=404,
            detail=detail,
        )

    @staticmethod
    def _validation(detail: str) -> AppError:
        return AppError(
            error_type="admin-content-validation",
            title="Content validation failed",
            status=422,
            detail=detail,
        )

    @staticmethod
    def _conflict(detail: str) -> AppError:
        return AppError(
            error_type="admin-content-conflict", title="Content conflict", status=409, detail=detail
        )
