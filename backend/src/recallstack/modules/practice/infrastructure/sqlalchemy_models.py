from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from recallstack.shared.database.base import Base


class PracticeOutcome(StrEnum):
    SOLVED_INDEPENDENTLY = "solved_independently"
    SOLVED_WITH_HINT = "solved_with_hint"
    UNDERSTOOD_NOT_CODED = "understood_not_coded"
    PATTERN_NOT_IDENTIFIED = "pattern_not_identified"
    SKIPPED = "skipped"


class PracticeProviderModel(Base):
    __tablename__ = "practice_providers"
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    base_url: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class PracticeResourceModel(Base):
    __tablename__ = "practice_resources"
    __table_args__ = (
        UniqueConstraint("id", "content_item_id", name="uq_practice_resources_id_content_item"),
        UniqueConstraint("id", "provider_id", name="uq_practice_resources_id_provider"),
        UniqueConstraint(
            "content_item_id",
            "provider_id",
            "url_hash",
            name="uq_practice_resources_item_provider_url",
        ),
        CheckConstraint(
            "char_length(url_hash) = 64 AND url_hash ~ '^[0-9a-f]{64}$'",
            name="chk_practice_resources_url_hash",
        ),
        Index("ix_practice_resources_provider_id", "provider_id"),
        Index(
            "uq_practice_resources_one_primary",
            "content_item_id",
            unique=True,
            postgresql_where=text("is_primary AND archived_at IS NULL"),
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    content_item_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_items.id", ondelete="RESTRICT")
    )
    provider_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("practice_providers.id", ondelete="RESTRICT")
    )
    external_key: Mapped[str | None] = mapped_column(String(160))
    url: Mapped[str] = mapped_column(Text)
    url_hash: Mapped[str] = mapped_column(String(64))
    title: Mapped[str | None] = mapped_column(String(240))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PracticeAttemptModel(Base):
    __tablename__ = "practice_attempts"
    __table_args__ = (
        UniqueConstraint("attempt_event_id", name="uq_practice_attempts_attempt_event_id"),
        ForeignKeyConstraint(
            ["practice_resource_id", "content_item_id"],
            ["practice_resources.id", "practice_resources.content_item_id"],
            ondelete="RESTRICT",
            name="fk_practice_attempts_resource_item",
        ),
        ForeignKeyConstraint(
            ["practice_resource_id", "provider_id"],
            ["practice_resources.id", "practice_resources.provider_id"],
            ondelete="RESTRICT",
            name="fk_practice_attempts_resource_provider",
        ),
        CheckConstraint(
            "duration_seconds IS NULL OR duration_seconds >= 0",
            name="chk_practice_attempt_duration",
        ),
        CheckConstraint(
            "confidence_before IS NULL OR confidence_before BETWEEN 0 AND 100",
            name="chk_practice_attempt_conf_before",
        ),
        CheckConstraint(
            "confidence_after IS NULL OR confidence_after BETWEEN 0 AND 100",
            name="chk_practice_attempt_conf_after",
        ),
        Index("ix_practice_attempts_user_attempted", "user_id", text("attempted_at DESC")),
        Index("ix_practice_attempts_content_item_id", "content_item_id"),
        Index("ix_practice_attempts_provider_id", "provider_id"),
        Index("ix_practice_attempts_resource_id", "practice_resource_id"),
        Index("ix_practice_attempts_resource_item", "practice_resource_id", "content_item_id"),
        Index("ix_practice_attempts_resource_provider", "practice_resource_id", "provider_id"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    attempt_event_id: Mapped[UUID] = mapped_column(unique=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    content_item_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_items.id", ondelete="RESTRICT")
    )
    practice_resource_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("practice_resources.id", ondelete="RESTRICT")
    )
    provider_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("practice_providers.id", ondelete="RESTRICT")
    )
    outcome: Mapped[PracticeOutcome] = mapped_column(
        Enum(
            PracticeOutcome, name="practice_outcome", values_callable=lambda e: [x.value for x in e]
        )
    )
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    hint_used: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    confidence_before: Mapped[int | None] = mapped_column(SmallInteger)
    confidence_after: Mapped[int | None] = mapped_column(SmallInteger)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
