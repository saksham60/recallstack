from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from recallstack.shared.database.base import Base


class ProfileModel(Base):
    __tablename__ = "profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(120))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class RoleModel(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)


class ProfileRoleGrantModel(Base):
    __tablename__ = "profile_role_grants"
    __table_args__ = (
        CheckConstraint(
            "revoked_at IS NULL OR revoked_at >= granted_at",
            name="chk_role_grant_revoke_time",
        ),
        Index("ix_profile_role_grants_profile_id", "profile_id"),
        Index("ix_profile_role_grants_role_id", "role_id"),
        Index("ix_profile_role_grants_granted_by", "granted_by"),
        Index("ix_profile_role_grants_revoked_by", "revoked_by"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    granted_by: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_by: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
