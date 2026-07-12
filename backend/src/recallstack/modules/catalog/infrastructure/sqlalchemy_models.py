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
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from recallstack.shared.database.base import Base


class TopicKind(StrEnum):
    TOPIC = "topic"
    PATTERN = "pattern"


class DomainModel(Base):
    __tablename__ = "domains"
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CategoryModel(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("domain_id", "id", name="uq_categories_domain_id_id"),
        UniqueConstraint("domain_id", "slug", name="uq_categories_domain_id_slug"),
        ForeignKeyConstraint(
            ["domain_id", "parent_category_id"],
            ["categories.domain_id", "categories.id"],
            ondelete="RESTRICT",
            name="fk_categories_domain_parent_category",
        ),
        CheckConstraint(
            "parent_category_id IS NULL OR parent_category_id <> id",
            name="chk_category_not_self_parent",
        ),
        Index("ix_categories_domain_parent", "domain_id", "parent_category_id"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    domain_id: Mapped[UUID] = mapped_column(ForeignKey("domains.id", ondelete="RESTRICT"))
    parent_category_id: Mapped[UUID | None]
    slug: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TopicModel(Base):
    __tablename__ = "topics"
    __table_args__ = (
        UniqueConstraint("domain_id", "id", name="uq_topics_domain_id_id"),
        UniqueConstraint("domain_id", "slug", name="uq_topics_domain_id_slug"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    domain_id: Mapped[UUID] = mapped_column(ForeignKey("domains.id", ondelete="RESTRICT"))
    kind: Mapped[TopicKind] = mapped_column(
        Enum(TopicKind, name="topic_kind", values_callable=lambda e: [x.value for x in e]),
        default=TopicKind.TOPIC,
        server_default="topic",
    )
    slug: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TopicCategoryModel(Base):
    __tablename__ = "topic_categories"
    __table_args__ = (
        ForeignKeyConstraint(
            ["domain_id", "topic_id"],
            ["topics.domain_id", "topics.id"],
            ondelete="CASCADE",
            name="fk_topic_categories_domain_topic",
        ),
        ForeignKeyConstraint(
            ["domain_id", "category_id"],
            ["categories.domain_id", "categories.id"],
            ondelete="CASCADE",
            name="fk_topic_categories_domain_category",
        ),
        Index("ix_topic_categories_domain_category", "domain_id", "category_id"),
        Index("ix_topic_categories_domain_topic", "domain_id", "topic_id"),
    )
    domain_id: Mapped[UUID]
    topic_id: Mapped[UUID] = mapped_column(primary_key=True)
    category_id: Mapped[UUID] = mapped_column(primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
