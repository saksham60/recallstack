from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.database.base import Base


class NoteKind(StrEnum):
    NOTE = "note"
    MISTAKE = "mistake"
    INSIGHT = "insight"


class UserProgressModel(Base):
    __tablename__ = "user_progress"
    __table_args__ = (
        CheckConstraint("confidence BETWEEN 0 AND 100", name="chk_user_progress_confidence"),
        CheckConstraint("row_version > 0", name="chk_user_progress_row_version"),
        Index("ix_user_progress_content_item_id", "content_item_id"),
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    content_item_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_items.id", ondelete="RESTRICT"), primary_key=True
    )
    status: Mapped[LearningStatus] = mapped_column(
        Enum(
            LearningStatus, name="learning_status", values_callable=lambda e: [x.value for x in e]
        ),
        default=LearningStatus.NEW,
        server_default="new",
    )
    confidence: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    last_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    row_version: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BookmarkModel(Base):
    __tablename__ = "bookmarks"
    __table_args__ = (Index("ix_bookmarks_content_item_id", "content_item_id"),)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    content_item_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_items.id", ondelete="RESTRICT"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserNoteModel(Base):
    __tablename__ = "user_notes"
    __table_args__ = (
        CheckConstraint("row_version > 0", name="chk_user_note_row_version"),
        Index("ix_user_notes_content_item_id", "content_item_id"),
        Index("ix_user_notes_user_id", "user_id"),
        Index(
            "ix_user_notes_active_user_content",
            "user_id",
            "content_item_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_user_notes_deleted_user_updated",
            "user_id",
            "updated_at",
            postgresql_where=text("deleted_at IS NOT NULL"),
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    content_item_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_items.id", ondelete="RESTRICT")
    )
    kind: Mapped[NoteKind] = mapped_column(
        Enum(NoteKind, name="note_kind", values_callable=lambda e: [x.value for x in e])
    )
    title: Mapped[str | None] = mapped_column(String(240))
    body: Mapped[str] = mapped_column(Text)
    row_version: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ActivityEventModel(Base):
    __tablename__ = "activity_events"
    __table_args__ = (
        Index("ix_activity_events_user_occurred", "user_id", text("occurred_at DESC")),
        Index("ix_activity_events_content_item_id", "content_item_id"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    content_item_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("content_items.id", ondelete="SET NULL")
    )
    event_type: Mapped[str] = mapped_column(String(80))
    source_entity_type: Mapped[str | None] = mapped_column(String(80))
    source_entity_id: Mapped[UUID | None]
    metadata_: Mapped[dict[str, object] | None] = mapped_column("metadata", JSONB)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
