from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from recallstack.shared.database.base import Base


class ContentType(StrEnum):
    PROBLEM = "problem"
    CONCEPT = "concept"
    PATTERN = "pattern"
    ARTICLE = "article"
    ARCHITECTURE = "architecture"
    CASE_STUDY = "case_study"


class DifficultyLevel(StrEnum):
    BEGINNER = "beginner"
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    EXPERT = "expert"


class PublicationStatus(StrEnum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class BlockType(StrEnum):
    RECOGNIZE = "recognize"
    REMEMBER = "remember"
    INVARIANT = "invariant"
    APPROACH = "approach"
    CODE = "code"
    MISTAKE = "mistake"
    WARNING = "warning"
    DIAGRAM = "diagram"
    TABLE = "table"
    ARCHITECTURE_FLOW = "architecture_flow"
    QUIZ = "quiz"
    RELATED_CONTENT = "related_content"
    EXTERNAL_LINK = "external_link"


class ContentRelationType(StrEnum):
    PREREQUISITE = "prerequisite"
    RELATED = "related"
    ALTERNATIVE = "alternative"


class ReleaseStatus(StrEnum):
    BUILDING = "building"
    PUBLISHED = "published"
    RETIRED = "retired"


def enum_values(enum: type[StrEnum]) -> list[str]:
    return [member.value for member in enum]


class ContentItemModel(Base):
    __tablename__ = "content_items"
    __table_args__ = (
        UniqueConstraint("domain_id", "id", name="uq_content_items_domain_id_id"),
        UniqueConstraint("domain_id", "slug", name="uq_content_items_domain_id_slug"),
        CheckConstraint(
            "practice_resources_revision > 0",
            name="chk_content_items_practice_resources_revision",
        ),
        ForeignKeyConstraint(
            ["id", "current_published_version_id"],
            ["content_versions.content_item_id", "content_versions.id"],
            ondelete="RESTRICT",
            use_alter=True,
            name="fk_content_items_current_published_version",
        ),
        Index("ix_content_items_created_by", "created_by"),
        Index(
            "ix_content_items_public_browse",
            "domain_id",
            "type",
            postgresql_where=text("archived_at IS NULL"),
        ),
        Index("ix_content_items_current_version", "current_published_version_id"),
        Index("ix_content_items_current_ownership", "id", "current_published_version_id"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    domain_id: Mapped[UUID] = mapped_column(ForeignKey("domains.id", ondelete="RESTRICT"))
    slug: Mapped[str] = mapped_column(String(160))
    type: Mapped[ContentType] = mapped_column(
        Enum(ContentType, name="content_type", values_callable=enum_values)
    )
    difficulty: Mapped[DifficultyLevel | None] = mapped_column(
        Enum(DifficultyLevel, name="difficulty_level", values_callable=enum_values)
    )
    current_published_version_id: Mapped[UUID | None]
    practice_resources_revision: Mapped[int] = mapped_column(
        BigInteger, default=1, server_default="1"
    )
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ContentVersionModel(Base):
    __tablename__ = "content_versions"
    __table_args__ = (
        UniqueConstraint("content_item_id", "id", name="uq_content_versions_content_item_id_id"),
        UniqueConstraint(
            "content_item_id", "version_number", name="uq_content_versions_item_version"
        ),
        CheckConstraint("version_number > 0", name="chk_content_version_number_positive"),
        CheckConstraint(
            "status <> 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL)",
            name="chk_content_version_published_at",
        ),
        CheckConstraint("row_version > 0", name="chk_content_version_row_version"),
        Index("ix_content_versions_authored_by", "authored_by"),
        Index("ix_content_versions_reviewed_by", "reviewed_by"),
        Index(
            "ix_content_versions_published_by",
            "published_by",
            postgresql_where=text("published_by IS NOT NULL"),
        ),
        Index("ix_content_versions_search_document", "search_document", postgresql_using="gin"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    content_item_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_items.id", ondelete="CASCADE")
    )
    version_number: Mapped[int]
    status: Mapped[PublicationStatus] = mapped_column(
        Enum(PublicationStatus, name="publication_status", values_callable=enum_values),
        default=PublicationStatus.DRAFT,
        server_default="draft",
    )
    title: Mapped[str] = mapped_column(String(240))
    summary: Mapped[str | None] = mapped_column(Text)
    search_document: Mapped[str | None] = mapped_column(TSVECTOR)
    authored_by: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    reviewed_by: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    published_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="RESTRICT")
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    row_version: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ContentVersionStatusHistoryModel(Base):
    __tablename__ = "content_version_status_history"
    __table_args__ = (
        Index("ix_content_version_status_history_version", "content_version_id"),
        Index("ix_content_version_status_history_changed_by", "changed_by"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    content_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_versions.id", ondelete="CASCADE")
    )
    from_status: Mapped[PublicationStatus | None] = mapped_column(
        Enum(PublicationStatus, name="publication_status", values_callable=enum_values)
    )
    to_status: Mapped[PublicationStatus] = mapped_column(
        Enum(PublicationStatus, name="publication_status", values_callable=enum_values)
    )
    changed_by: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    reason: Mapped[str | None] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ContentBlockModel(Base):
    __tablename__ = "content_blocks"
    __table_args__ = (
        UniqueConstraint("type", "content_hash", name="uq_content_blocks_type_hash"),
        CheckConstraint(
            "char_length(content_hash) = 64 AND content_hash ~ '^[0-9a-f]{64}$'",
            name="chk_content_blocks_hash",
        ),
        Index("ix_content_blocks_created_by", "created_by"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    type: Mapped[BlockType] = mapped_column(
        Enum(BlockType, name="block_type", values_callable=enum_values)
    )
    payload: Mapped[dict[str, object]] = mapped_column(JSONB)
    plain_text: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ContentVersionBlockModel(Base):
    __tablename__ = "content_version_blocks"
    __table_args__ = (
        UniqueConstraint(
            "content_version_id", "content_block_id", name="uq_content_version_blocks_version_block"
        ),
        CheckConstraint("position >= 0", name="chk_content_version_blocks_position"),
        Index("ix_content_version_blocks_block", "content_block_id"),
    )
    content_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_versions.id", ondelete="CASCADE"), primary_key=True
    )
    content_block_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_blocks.id", ondelete="RESTRICT")
    )
    position: Mapped[int] = mapped_column(primary_key=True)
    heading: Mapped[str | None] = mapped_column(String(240))


class ContentItemCategoryModel(Base):
    __tablename__ = "content_item_categories"
    __table_args__ = (
        ForeignKeyConstraint(
            ["domain_id", "content_item_id"],
            ["content_items.domain_id", "content_items.id"],
            ondelete="CASCADE",
            name="fk_content_item_categories_domain_item",
        ),
        ForeignKeyConstraint(
            ["domain_id", "category_id"],
            ["categories.domain_id", "categories.id"],
            ondelete="CASCADE",
            name="fk_content_item_categories_domain_category",
        ),
        Index("ix_content_item_categories_domain_category", "domain_id", "category_id"),
        Index("ix_content_item_categories_domain_item", "domain_id", "content_item_id"),
    )
    domain_id: Mapped[UUID]
    content_item_id: Mapped[UUID] = mapped_column(primary_key=True)
    category_id: Mapped[UUID] = mapped_column(primary_key=True)
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")


class ContentItemTopicModel(Base):
    __tablename__ = "content_item_topics"
    __table_args__ = (
        ForeignKeyConstraint(
            ["domain_id", "content_item_id"],
            ["content_items.domain_id", "content_items.id"],
            ondelete="CASCADE",
            name="fk_content_item_topics_domain_item",
        ),
        ForeignKeyConstraint(
            ["domain_id", "topic_id"],
            ["topics.domain_id", "topics.id"],
            ondelete="CASCADE",
            name="fk_content_item_topics_domain_topic",
        ),
        Index("ix_content_item_topics_domain_topic", "domain_id", "topic_id"),
        Index("ix_content_item_topics_domain_item", "domain_id", "content_item_id"),
        Index(
            "uq_content_item_topics_one_primary",
            "content_item_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )
    domain_id: Mapped[UUID]
    content_item_id: Mapped[UUID] = mapped_column(primary_key=True)
    topic_id: Mapped[UUID] = mapped_column(primary_key=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")


class ContentRelationModel(Base):
    __tablename__ = "content_relations"
    __table_args__ = (
        CheckConstraint(
            "source_content_item_id <> target_content_item_id", name="chk_content_relation_not_self"
        ),
        CheckConstraint(
            "(relation_type NOT IN ('related', 'alternative')) OR "
            "(source_content_item_id < target_content_item_id)",
            name="chk_content_relation_canonical_symmetric",
        ),
        Index("ix_content_relations_target", "target_content_item_id"),
    )
    source_content_item_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_items.id", ondelete="CASCADE"), primary_key=True
    )
    target_content_item_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_items.id", ondelete="CASCADE"), primary_key=True
    )
    relation_type: Mapped[ContentRelationType] = mapped_column(
        Enum(ContentRelationType, name="content_relation_type", values_callable=enum_values),
        primary_key=True,
    )
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CatalogReleaseModel(Base):
    __tablename__ = "catalog_releases"
    __table_args__ = (
        UniqueConstraint("domain_id", "id", name="uq_catalog_releases_domain_id_id"),
        UniqueConstraint("domain_id", "release_number", name="uq_catalog_releases_domain_number"),
        CheckConstraint("release_number > 0", name="chk_catalog_release_number_positive"),
        CheckConstraint(
            "status <> 'published' OR published_at IS NOT NULL",
            name="chk_catalog_release_published_at",
        ),
        CheckConstraint(
            "retired_at IS NULL OR published_at IS NOT NULL",
            name="chk_catalog_release_retire_after_publish",
        ),
        Index("ix_catalog_releases_published_by", "published_by"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    domain_id: Mapped[UUID] = mapped_column(ForeignKey("domains.id", ondelete="RESTRICT"))
    release_number: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[ReleaseStatus] = mapped_column(
        Enum(ReleaseStatus, name="release_status", values_callable=enum_values),
        default=ReleaseStatus.BUILDING,
        server_default="building",
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="SET NULL")
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CatalogReleaseVersionModel(Base):
    __tablename__ = "catalog_release_versions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["domain_id", "catalog_release_id"],
            ["catalog_releases.domain_id", "catalog_releases.id"],
            ondelete="CASCADE",
            name="fk_catalog_release_versions_domain_release",
        ),
        ForeignKeyConstraint(
            ["domain_id", "content_item_id"],
            ["content_items.domain_id", "content_items.id"],
            ondelete="RESTRICT",
            name="fk_catalog_release_versions_domain_item",
        ),
        ForeignKeyConstraint(
            ["content_item_id", "content_version_id"],
            ["content_versions.content_item_id", "content_versions.id"],
            ondelete="RESTRICT",
            name="fk_catalog_release_versions_item_version",
        ),
        Index("ix_catalog_release_versions_domain_item", "domain_id", "content_item_id"),
        Index("ix_catalog_release_versions_domain_release", "domain_id", "catalog_release_id"),
        Index("ix_catalog_release_versions_item_version", "content_item_id", "content_version_id"),
    )
    domain_id: Mapped[UUID]
    catalog_release_id: Mapped[UUID] = mapped_column(primary_key=True)
    content_item_id: Mapped[UUID] = mapped_column(primary_key=True)
    content_version_id: Mapped[UUID]
