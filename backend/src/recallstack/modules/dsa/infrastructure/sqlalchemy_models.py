"""Read mappings for existing DSA tables; never create these at application startup.

Separate metadata deliberately keeps externally managed tables out of Alembic's
existing metadata. Only disposable DSA integration fixtures call create_all.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from recallstack.modules.content.infrastructure.sqlalchemy_models import ContentItemModel
from recallstack.modules.practice.infrastructure.sqlalchemy_models import PracticeResourceModel


class DsaReadBase(DeclarativeBase):
    pass


class DefinitionModel(DsaReadBase):
    __tablename__ = "dsa_problem_definitions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["current_version_id", "id"],
            ["dsa_problem_versions.id", "dsa_problem_versions.definition_id"],
            name="dsa_definition_current_version_fk",
            deferrable=True,
            initially="DEFERRED",
            use_alter=True,
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    content_item_id: Mapped[UUID] = mapped_column(
        ForeignKey(ContentItemModel.id, ondelete="RESTRICT")
    )
    practice_resource_id: Mapped[UUID] = mapped_column(
        ForeignKey(PracticeResourceModel.id, ondelete="RESTRICT"), unique=True
    )
    current_version_id: Mapped[UUID | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VersionModel(DsaReadBase):
    __tablename__ = "dsa_problem_versions"
    __table_args__ = (
        UniqueConstraint("definition_id", "version_number"),
        UniqueConstraint("id", "definition_id"),
        CheckConstraint("version_number > 0"),
        CheckConstraint("jsonb_typeof(specification) = 'object'"),
        CheckConstraint("jsonb_typeof(provenance) = 'object'"),
        CheckConstraint("source_sha256 IS NULL OR source_sha256 ~ '^[a-f0-9]{64}$'"),
        CheckConstraint(
            "status IN ('pending','fetched','normalized','needs_review',"
            "'verified','published','failed')"
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    definition_id: Mapped[UUID] = mapped_column(
        ForeignKey("dsa_problem_definitions.id", ondelete="RESTRICT")
    )
    version_number: Mapped[int]
    specification: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    provenance: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    source_sha256: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SuiteModel(DsaReadBase):
    __tablename__ = "dsa_test_suites"
    __table_args__ = (
        UniqueConstraint("problem_version_id", "suite_version"),
        CheckConstraint("suite_version > 0"),
        CheckConstraint("checker_type IN ('exact','unordered','numeric_tolerance','custom')"),
        CheckConstraint("status IN ('draft','needs_review','verified','published')"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    problem_version_id: Mapped[UUID] = mapped_column(
        ForeignKey("dsa_problem_versions.id", ondelete="RESTRICT")
    )
    suite_version: Mapped[int]
    checker_type: Mapped[str] = mapped_column(Text, server_default="exact")
    status: Mapped[str] = mapped_column(Text, server_default="draft")
    oracle_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TestCaseModel(DsaReadBase):
    __tablename__ = "dsa_test_cases"
    __table_args__ = (
        Index("dsa_test_cases_suite_idx", "suite_id", "visibility"),
        UniqueConstraint("suite_id", "ordinal"),
        CheckConstraint("ordinal >= 0"),
        CheckConstraint(
            "category IN ('official','boundary','edge','adversarial','randomized','performance')"
        ),
        CheckConstraint("visibility IN ('public','hidden')"),
        CheckConstraint("validation_status IN ('pending','verified','rejected')"),
        CheckConstraint("input_json IS NOT NULL OR fixture_ref IS NOT NULL"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    suite_id: Mapped[UUID] = mapped_column(ForeignKey("dsa_test_suites.id", ondelete="RESTRICT"))
    ordinal: Mapped[int]
    category: Mapped[str] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(Text, server_default="hidden")
    input_json: Mapped[Any | None] = mapped_column(JSONB(none_as_null=True))
    expected_json: Mapped[Any | None] = mapped_column(JSONB(none_as_null=True))
    fixture_ref: Mapped[str | None] = mapped_column(Text)
    validation_status: Mapped[str] = mapped_column(Text, server_default="pending")
    provenance: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RuntimeModel(DsaReadBase):
    __tablename__ = "dsa_language_runtimes"
    __table_args__ = (UniqueConstraint("language", "runtime_version"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    language: Mapped[str] = mapped_column(Text)
    runtime_version: Mapped[str] = mapped_column(Text)
    image_digest: Mapped[str | None] = mapped_column(Text)
    configuration: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    enabled: Mapped[bool] = mapped_column(Boolean, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
