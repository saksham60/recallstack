"""Mappings for the Knowledge schema owned by Alembic migration 20260926_0018."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from recallstack.shared.database.base import Base


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class KnowledgeSourceModel(Timestamps, Base):
    __tablename__ = "knowledge_sources"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    source_type: Mapped[str] = mapped_column(String(40))
    homepage_url: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, server_default="true")
    quality_weight: Mapped[Decimal] = mapped_column(Numeric(5, 4), server_default="1.0")


class KnowledgeStoryModel(Timestamps, Base):
    __tablename__ = "knowledge_stories"
    __table_args__ = (
        Index(
            "uq_knowledge_stories_source_external_id",
            "source_id",
            "external_id",
            unique=True,
            postgresql_where=text("external_id IS NOT NULL"),
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("knowledge_sources.id", ondelete="RESTRICT"))
    external_id: Mapped[str | None] = mapped_column(String(255))
    canonical_url: Mapped[str] = mapped_column(Text)
    canonical_hash: Mapped[str] = mapped_column(String(64), unique=True)
    title: Mapped[str] = mapped_column(String(500))
    summary: Mapped[str] = mapped_column(Text)
    why_it_matters: Mapped[str] = mapped_column(Text)
    bullets: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    image_url: Mapped[str] = mapped_column(Text)
    image_key: Mapped[str] = mapped_column(Text, unique=True)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    importance_score: Mapped[Decimal] = mapped_column(Numeric(5, 4))
    quality_score: Mapped[Decimal] = mapped_column(Numeric(5, 4))
    status: Mapped[str] = mapped_column(String(20), server_default="active")


class StoryTopicModel(Base):
    __tablename__ = "knowledge_story_topics"
    story_id: Mapped[UUID] = mapped_column(
        ForeignKey("knowledge_stories.id", ondelete="CASCADE"),
        primary_key=True,
    )
    topic: Mapped[str] = mapped_column(String(80), primary_key=True)
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), server_default="1.0")


class PreferencesModel(Timestamps, Base):
    __tablename__ = "user_knowledge_preferences"
    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    minimum_importance: Mapped[Decimal] = mapped_column(Numeric(5, 4), server_default="0")


class TopicPreferenceModel(Timestamps, Base):
    __tablename__ = "user_knowledge_topics"
    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    topic: Mapped[str] = mapped_column(String(80), primary_key=True)
    weight: Mapped[Decimal] = mapped_column(Numeric(6, 4), server_default="1.0")
    blocked: Mapped[bool] = mapped_column(Boolean, server_default="false")


class SourcePreferenceModel(Timestamps, Base):
    __tablename__ = "user_knowledge_sources"
    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    source_id: Mapped[UUID] = mapped_column(
        ForeignKey("knowledge_sources.id", ondelete="CASCADE"),
        primary_key=True,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, server_default="true")
    weight: Mapped[Decimal] = mapped_column(Numeric(6, 4), server_default="1.0")


class StoryEventModel(Base):
    __tablename__ = "user_story_events"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    profile_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    story_id: Mapped[UUID] = mapped_column(ForeignKey("knowledge_stories.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(30))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StoryStateModel(Base):
    __tablename__ = "user_story_state"
    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    story_id: Mapped[UUID] = mapped_column(
        ForeignKey("knowledge_stories.id", ondelete="CASCADE"),
        primary_key=True,
    )
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    saved: Mapped[bool] = mapped_column(Boolean, server_default="false")
    hidden: Mapped[bool] = mapped_column(Boolean, server_default="false")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RefreshRunModel(Base):
    __tablename__ = "knowledge_refresh_runs"
    __table_args__ = (Index("ix_knowledge_refresh_runs_requested_at", "requested_at"),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    requested_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20))
    operation_name: Mapped[str | None] = mapped_column(Text)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
