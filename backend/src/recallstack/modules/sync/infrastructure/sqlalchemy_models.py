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
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from recallstack.shared.database.base import Base


class MutationOperation(StrEnum):
    INSERT = "insert"
    UPDATE = "update"
    DELETE = "delete"


class MutationStatus(StrEnum):
    RECEIVED = "received"
    APPLIED = "applied"
    REJECTED = "rejected"


class ChangeOperation(StrEnum):
    UPSERT = "upsert"
    DELETE = "delete"


def values(enum: type[StrEnum]) -> list[str]:
    return [item.value for item in enum]


class DeviceModel(Base):
    __tablename__ = "devices"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_devices_id_user"),
        Index("ix_devices_user_id", "user_id"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    device_name: Mapped[str | None] = mapped_column(String(160))
    platform: Mapped[str] = mapped_column(String(40))
    app_version: Mapped[str | None] = mapped_column(String(40))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DeviceUserSyncStateModel(Base):
    __tablename__ = "device_user_sync_state"
    __table_args__ = (CheckConstraint("last_user_cursor >= 0", name="chk_device_user_sync_cursor"),)
    device_id: Mapped[UUID] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    last_user_cursor: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    last_pull_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_push_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    full_resync_required: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DeviceCatalogSyncStateModel(Base):
    __tablename__ = "device_catalog_sync_state"
    __table_args__ = (
        ForeignKeyConstraint(
            ["domain_id", "last_catalog_release_id"],
            ["catalog_releases.domain_id", "catalog_releases.id"],
            ondelete="RESTRICT",
            name="fk_device_catalog_sync_state_domain_release",
        ),
        CheckConstraint("last_catalog_cursor >= 0", name="chk_device_catalog_sync_cursor"),
        Index(
            "ix_device_catalog_sync_state_domain_release", "domain_id", "last_catalog_release_id"
        ),
    )
    device_id: Mapped[UUID] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    domain_id: Mapped[UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), primary_key=True
    )
    last_catalog_cursor: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    last_catalog_release_id: Mapped[UUID | None]
    full_resync_required: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    last_pull_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SyncMutationModel(Base):
    __tablename__ = "sync_mutations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["device_id", "user_id"],
            ["devices.id", "devices.user_id"],
            ondelete="CASCADE",
            name="fk_sync_mutations_device_user",
        ),
        CheckConstraint("expires_at > received_at", name="chk_sync_mutation_expiry"),
        CheckConstraint(
            "processed_at IS NULL OR processed_at >= received_at",
            name="chk_sync_mutation_processed_time",
        ),
        CheckConstraint(
            "(status = 'received' AND processed_at IS NULL) OR "
            "(status = 'applied' AND processed_at IS NOT NULL) OR "
            "(status = 'rejected' AND processed_at IS NOT NULL AND error_code IS NOT NULL)",
            name="chk_sync_mutation_status_consistency",
        ),
        CheckConstraint(
            "base_row_version IS NULL OR base_row_version > 0",
            name="chk_sync_mutation_base_version",
        ),
        CheckConstraint(
            "resulting_row_version IS NULL OR resulting_row_version > 0",
            name="chk_sync_mutation_result_version",
        ),
        CheckConstraint(
            "char_length(request_hash) = 64 AND request_hash ~ '^[0-9a-f]{64}$'",
            name="chk_sync_mutation_request_hash",
        ),
        Index("ix_sync_mutations_user_id", "user_id"),
        Index("ix_sync_mutations_device_user", "device_id", "user_id"),
        Index("ix_sync_mutations_expires_at", "expires_at"),
    )
    mutation_id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    device_id: Mapped[UUID]
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[UUID]
    operation: Mapped[MutationOperation] = mapped_column(
        Enum(MutationOperation, name="mutation_operation", values_callable=values)
    )
    payload: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    request_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[MutationStatus] = mapped_column(
        Enum(MutationStatus, name="mutation_status", values_callable=values),
        default=MutationStatus.RECEIVED,
        server_default="received",
    )
    base_row_version: Mapped[int | None] = mapped_column(BigInteger)
    resulting_row_version: Mapped[int | None] = mapped_column(BigInteger)
    error_code: Mapped[str | None] = mapped_column(String(80))
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UserSyncCounterModel(Base):
    __tablename__ = "user_sync_counters"
    __table_args__ = (
        CheckConstraint("last_cursor >= 0", name="chk_user_sync_counter_nonnegative"),
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    last_cursor: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserSyncChangeLogModel(Base):
    __tablename__ = "user_sync_change_log"
    __table_args__ = (
        CheckConstraint("cursor > 0", name="chk_user_sync_change_cursor_positive"),
        CheckConstraint("retain_until > changed_at", name="chk_user_sync_change_retention"),
        Index("ix_user_sync_change_log_retain_until", "retain_until"),
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    cursor: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[UUID]
    operation: Mapped[ChangeOperation] = mapped_column(
        Enum(ChangeOperation, name="change_operation", values_callable=values)
    )
    entity_version: Mapped[int | None] = mapped_column(BigInteger)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    retain_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CatalogSyncCounterModel(Base):
    __tablename__ = "catalog_sync_counters"
    __table_args__ = (
        CheckConstraint("last_cursor >= 0", name="chk_catalog_sync_counter_nonnegative"),
    )
    domain_id: Mapped[UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), primary_key=True
    )
    last_cursor: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CatalogSyncChangeLogModel(Base):
    __tablename__ = "catalog_sync_change_log"
    __table_args__ = (
        CheckConstraint("cursor > 0", name="chk_catalog_sync_change_cursor_positive"),
        CheckConstraint("retain_until > changed_at", name="chk_catalog_sync_change_retention"),
        Index("ix_catalog_sync_change_log_retain_until", "retain_until"),
    )
    domain_id: Mapped[UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), primary_key=True
    )
    cursor: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[UUID]
    operation: Mapped[ChangeOperation] = mapped_column(
        Enum(ChangeOperation, name="change_operation", values_callable=values)
    )
    entity_version: Mapped[int | None] = mapped_column(BigInteger)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    retain_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
