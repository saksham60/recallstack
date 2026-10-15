"""DSA scoping adapter. All writes and synchronization remain learning-owned."""

from uuid import UUID

from sqlalchemy import func, select

from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemModel as Item,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentVersionModel as Version,
)
from recallstack.modules.dsa.infrastructure.repositories import base_visible, domain_predicate
from recallstack.modules.learning.application.learning_state import (
    Bookmark,
    NoteDeletion,
    ProgressState,
    UserNote,
)
from recallstack.modules.learning.infrastructure.learning_state_repository import (
    SqlAlchemyLearningStateRepository,
)
from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    BookmarkModel as BookmarkRow,
)
from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    UserNoteModel as Note,
)
from recallstack.modules.learning.infrastructure.sqlalchemy_models import (
    UserProgressModel as Progress,
)


class DsaLearningRepository(SqlAlchemyLearningStateRepository):
    async def content_exists(self, content_item_id: UUID) -> bool:
        return await self.content_is_user_accessible(content_item_id)

    async def content_is_user_accessible(self, content_item_id: UUID) -> bool:
        return (
            await self._session.scalar(
                select(Item.id).where(Item.id == content_item_id, base_visible())
            )
        ) is not None

    async def list_progress(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[ProgressState, ...]]:
        query = (
            select(Progress)
            .join(Item, Item.id == Progress.content_item_id)
            .where(domain_predicate(), Progress.user_id == profile_id)
        )
        count = int(
            (await self._session.scalar(select(func.count()).select_from(query.subquery()))) or 0
        )
        rows = await self._session.scalars(
            query.order_by(Progress.updated_at.desc(), Progress.content_item_id)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        return count, tuple(self._progress(row) for row in rows)

    async def list_bookmarks(
        self, *, profile_id: UUID, page: int, page_size: int
    ) -> tuple[int, tuple[Bookmark, ...]]:
        query = (
            select(BookmarkRow.content_item_id, Item.slug, Version.title, BookmarkRow.created_at)
            .join(Item, Item.id == BookmarkRow.content_item_id)
            .outerjoin(Version, Version.id == Item.current_published_version_id)
            .where(domain_predicate(), BookmarkRow.user_id == profile_id)
        )
        count = int(
            (await self._session.scalar(select(func.count()).select_from(query.subquery()))) or 0
        )
        rows = await self._session.execute(
            query.order_by(BookmarkRow.created_at.desc(), BookmarkRow.content_item_id)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        return count, tuple(Bookmark(*row) for row in rows)

    async def note_in_domain(self, profile_id: UUID, note_id: UUID) -> bool:
        return (
            await self._session.scalar(
                select(Note.id)
                .join(Item, Item.id == Note.content_item_id)
                .where(
                    domain_predicate(),
                    Note.id == note_id,
                    Note.user_id == profile_id,
                    Note.deleted_at.is_(None),
                )
            )
        ) is not None

    async def active_note_exists(self, *, profile_id: UUID, note_id: UUID) -> bool:
        return await self.note_in_domain(profile_id, note_id)

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
        if not await self.note_in_domain(profile_id, note_id):
            return None
        return await super().update_note(
            profile_id=profile_id,
            note_id=note_id,
            kind=kind,
            title=title,
            title_is_set=title_is_set,
            body=body,
            expected_row_version=expected_row_version,
        )

    async def delete_note(
        self,
        *,
        profile_id: UUID,
        note_id: UUID,
        expected_row_version: int,
    ) -> NoteDeletion | None:
        if not await self.note_in_domain(profile_id, note_id):
            return None
        return await super().delete_note(
            profile_id=profile_id, note_id=note_id, expected_row_version=expected_row_version
        )
