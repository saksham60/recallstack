from typing import cast
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemModel,
    ContentVersionModel,
)
from recallstack.modules.learning.application.learning_state import (
    Bookmark,
    ProgressState,
    UserNote,
)
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    ActivityEventModel,
    BookmarkModel,
    NoteKind,
    UserNoteModel,
    UserProgressModel,
)


class SqlAlchemyLearningStateRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def content_exists(self, content_item_id: UUID) -> bool:
        statement = select(ContentItemModel.id).where(ContentItemModel.id == content_item_id)
        return (await self._session.scalar(statement)) is not None

    async def get_progress(
        self, *, profile_id: UUID, content_item_id: UUID
    ) -> ProgressState | None:
        statement = select(UserProgressModel).where(
            UserProgressModel.user_id == profile_id,
            UserProgressModel.content_item_id == content_item_id,
        )
        model = await self._session.scalar(statement)
        return self._progress(model) if model is not None else None

    async def list_progress(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[ProgressState, ...]]:
        filters = (UserProgressModel.user_id == profile_id,)
        total_statement = select(func.count()).where(*filters).select_from(UserProgressModel)
        total = int((await self._session.scalar(total_statement)) or 0)
        statement = (
            select(UserProgressModel)
            .where(*filters)
            .order_by(UserProgressModel.updated_at.desc(), UserProgressModel.content_item_id)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        models = await self._session.scalars(statement)
        return total, tuple(self._progress(model) for model in models)

    async def save_progress(
        self,
        *,
        profile_id: UUID,
        content_item_id: UUID,
        status: LearningStatus,
        confidence: int,
        expected_row_version: int,
    ) -> ProgressState | None:
        if expected_row_version == 0:
            create_statement = (
                insert(UserProgressModel)
                .values(
                    user_id=profile_id,
                    content_item_id=content_item_id,
                    status=status,
                    confidence=confidence,
                    last_opened_at=func.now(),
                    row_version=1,
                )
                .on_conflict_do_nothing(index_elements=["user_id", "content_item_id"])
                .returning(UserProgressModel)
            )
            model = await self._session.scalar(create_statement)
            if model is None:
                return None
            await self._activity(
                profile_id=profile_id,
                content_item_id=content_item_id,
                event_type="progress_created",
                source_entity_type="user_progress",
                source_entity_id=None,
                metadata={"status": str(status), "confidence": confidence},
            )
            return self._progress(model)
        update_statement = (
            update(UserProgressModel)
            .where(
                UserProgressModel.user_id == profile_id,
                UserProgressModel.content_item_id == content_item_id,
                UserProgressModel.row_version == expected_row_version,
            )
            .values(
                status=status,
                confidence=confidence,
                last_opened_at=func.now(),
                row_version=UserProgressModel.row_version + 1,
                updated_at=func.now(),
            )
            .returning(UserProgressModel)
        )
        model = await self._session.scalar(update_statement)
        if model is None:
            return None
        await self._activity(
            profile_id=profile_id,
            content_item_id=content_item_id,
            event_type="progress_updated",
            source_entity_type="user_progress",
            source_entity_id=None,
            metadata={"status": str(status), "confidence": confidence},
        )
        return self._progress(model)

    async def list_bookmarks(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[Bookmark, ...]]:
        filters = (BookmarkModel.user_id == profile_id,)
        total_statement = select(func.count()).where(*filters).select_from(BookmarkModel)
        total = int((await self._session.scalar(total_statement)) or 0)
        statement = (
            select(
                BookmarkModel.content_item_id,
                ContentItemModel.slug,
                ContentVersionModel.title,
                BookmarkModel.created_at,
            )
            .select_from(BookmarkModel)
            .join(ContentItemModel, ContentItemModel.id == BookmarkModel.content_item_id)
            .outerjoin(
                ContentVersionModel,
                ContentVersionModel.id == ContentItemModel.current_published_version_id,
            )
            .where(*filters)
            .order_by(BookmarkModel.created_at.desc(), BookmarkModel.content_item_id)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        return total, tuple(
            Bookmark(content_id, slug, title, created_at)
            for content_id, slug, title, created_at in await self._session.execute(statement)
        )

    async def add_bookmark(self, *, profile_id: UUID, content_item_id: UUID) -> bool:
        statement = (
            insert(BookmarkModel)
            .values(user_id=profile_id, content_item_id=content_item_id)
            .on_conflict_do_nothing(index_elements=["user_id", "content_item_id"])
            .returning(BookmarkModel.content_item_id)
        )
        added = await self._session.scalar(statement)
        if added is None:
            return False
        await self._activity(
            profile_id=profile_id,
            content_item_id=content_item_id,
            event_type="bookmark_added",
            source_entity_type="bookmark",
            source_entity_id=None,
            metadata=None,
        )
        return True

    async def remove_bookmark(self, *, profile_id: UUID, content_item_id: UUID) -> bool:
        statement = (
            delete(BookmarkModel)
            .where(
                BookmarkModel.user_id == profile_id,
                BookmarkModel.content_item_id == content_item_id,
            )
            .returning(BookmarkModel.content_item_id)
        )
        removed = await self._session.scalar(statement)
        if removed is None:
            return False
        await self._activity(
            profile_id=profile_id,
            content_item_id=content_item_id,
            event_type="bookmark_removed",
            source_entity_type="bookmark",
            source_entity_id=None,
            metadata=None,
        )
        return True

    async def list_notes(
        self,
        *,
        profile_id: UUID,
        content_item_id: UUID | None,
        page: int,
        page_size: int,
    ) -> tuple[int, tuple[UserNote, ...]]:
        filters = [UserNoteModel.user_id == profile_id, UserNoteModel.deleted_at.is_(None)]
        if content_item_id is not None:
            filters.append(UserNoteModel.content_item_id == content_item_id)
        total_statement = select(func.count()).where(*filters).select_from(UserNoteModel)
        total = int((await self._session.scalar(total_statement)) or 0)
        statement = (
            select(UserNoteModel)
            .where(*filters)
            .order_by(UserNoteModel.updated_at.desc(), UserNoteModel.id)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        notes = await self._session.scalars(statement)
        return total, tuple(self._note(note) for note in notes)

    async def create_note(
        self,
        *,
        profile_id: UUID,
        note_id: UUID | None,
        content_item_id: UUID,
        kind: str,
        title: str | None,
        body: str,
    ) -> UserNote:
        model = UserNoteModel(
            id=note_id,
            user_id=profile_id,
            content_item_id=content_item_id,
            kind=NoteKind(kind),
            title=title,
            body=body,
        )
        self._session.add(model)
        await self._session.flush()
        await self._activity(
            profile_id=profile_id,
            content_item_id=content_item_id,
            event_type="note_created",
            source_entity_type="user_note",
            source_entity_id=model.id,
            metadata={"kind": kind},
        )
        return self._note(model)

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
    ) -> UserNote | None:
        values: dict[str, object] = {
            "row_version": UserNoteModel.row_version + 1,
            "updated_at": func.now(),
        }
        if kind is not None:
            values["kind"] = NoteKind(kind)
        if title_is_set:
            values["title"] = title
        if body is not None:
            values["body"] = body
        statement = (
            update(UserNoteModel)
            .where(
                UserNoteModel.id == note_id,
                UserNoteModel.user_id == profile_id,
                UserNoteModel.deleted_at.is_(None),
                UserNoteModel.row_version == expected_row_version,
            )
            .values(**values)
            .returning(UserNoteModel)
        )
        model = await self._session.scalar(statement)
        if model is None:
            return None
        await self._activity(
            profile_id=profile_id,
            content_item_id=model.content_item_id,
            event_type="note_updated",
            source_entity_type="user_note",
            source_entity_id=model.id,
            metadata=None,
        )
        return self._note(model)

    async def delete_note(
        self, *, profile_id: UUID, note_id: UUID, expected_row_version: int
    ) -> bool | None:
        statement = (
            update(UserNoteModel)
            .where(
                UserNoteModel.id == note_id,
                UserNoteModel.user_id == profile_id,
                UserNoteModel.deleted_at.is_(None),
                UserNoteModel.row_version == expected_row_version,
            )
            .values(
                deleted_at=func.now(),
                updated_at=func.now(),
                row_version=UserNoteModel.row_version + 1,
            )
            .returning(UserNoteModel.content_item_id, UserNoteModel.id)
        )
        row = (await self._session.execute(statement)).one_or_none()
        if row is None:
            return None
        await self._activity(
            profile_id=profile_id,
            content_item_id=row.content_item_id,
            event_type="note_deleted",
            source_entity_type="user_note",
            source_entity_id=row.id,
            metadata=None,
        )
        return True

    async def active_note_exists(self, *, profile_id: UUID, note_id: UUID) -> bool:
        statement = select(UserNoteModel.id).where(
            UserNoteModel.id == note_id,
            UserNoteModel.user_id == profile_id,
            UserNoteModel.deleted_at.is_(None),
        )
        return (await self._session.scalar(statement)) is not None

    async def _activity(
        self,
        *,
        profile_id: UUID,
        content_item_id: UUID | None,
        event_type: str,
        source_entity_type: str,
        source_entity_id: UUID | None,
        metadata: dict[str, object] | None,
    ) -> None:
        self._session.add(
            ActivityEventModel(
                user_id=profile_id,
                content_item_id=content_item_id,
                event_type=event_type,
                source_entity_type=source_entity_type,
                source_entity_id=source_entity_id,
                metadata_=metadata,
            )
        )

    @staticmethod
    def _progress(model: UserProgressModel) -> ProgressState:
        return ProgressState(
            content_item_id=model.content_item_id,
            status=model.status,
            confidence=model.confidence,
            last_opened_at=model.last_opened_at,
            row_version=model.row_version,
            updated_at=model.updated_at,
        )

    @staticmethod
    def _note(model: UserNoteModel) -> UserNote:
        return UserNote(
            id=model.id,
            content_item_id=model.content_item_id,
            kind=cast(str, model.kind),
            title=model.title,
            body=model.body,
            row_version=model.row_version,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
