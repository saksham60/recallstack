from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from recallstack.shared.database.base import Base


class ReviewRating(StrEnum):
    AGAIN = "again"
    HARD = "hard"
    GOOD = "good"
    EASY = "easy"


class ReviewCardModel(Base):
    __tablename__ = "review_cards"
    __table_args__ = (
        UniqueConstraint("user_id", "content_item_id", name="uq_review_cards_user_content"),
        UniqueConstraint("id", "user_id", name="uq_review_cards_id_user"),
        CheckConstraint("interval_days >= 0", name="chk_review_card_interval"),
        CheckConstraint("review_count >= 0", name="chk_review_card_review_count"),
        CheckConstraint("lapse_count >= 0", name="chk_review_card_lapse_count"),
        CheckConstraint("row_version > 0", name="chk_review_card_row_version"),
        Index("ix_review_cards_content_item_id", "content_item_id"),
        Index(
            "ix_review_cards_due_active",
            "user_id",
            "due_at",
            postgresql_where=text("suspended_at IS NULL"),
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    user_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    content_item_id: Mapped[UUID] = mapped_column(
        ForeignKey("content_items.id", ondelete="RESTRICT")
    )
    scheduler_name: Mapped[str] = mapped_column(
        String(80), default="simple", server_default="simple"
    )
    scheduler_version: Mapped[str] = mapped_column(String(40), default="1", server_default="1")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    interval_days: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=0, server_default="0")
    stability: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    difficulty: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    review_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    lapse_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scheduler_state: Mapped[dict[str, object]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    row_version: Mapped[int] = mapped_column(BigInteger, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReviewHistoryModel(Base):
    __tablename__ = "review_history"
    __table_args__ = (
        ForeignKeyConstraint(
            ["review_card_id", "user_id"],
            ["review_cards.id", "review_cards.user_id"],
            ondelete="CASCADE",
            name="fk_review_history_card_user",
        ),
        CheckConstraint(
            "response_time_ms IS NULL OR response_time_ms >= 0",
            name="chk_review_history_response_time",
        ),
        CheckConstraint(
            "interval_days_after IS NULL OR interval_days_after >= 0",
            name="chk_review_history_interval",
        ),
        Index("ix_review_history_card_user", "review_card_id", "user_id"),
        Index("ix_review_history_user_reviewed", "user_id", text("reviewed_at DESC")),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    review_event_id: Mapped[UUID] = mapped_column(
        unique=True, server_default=func.gen_random_uuid()
    )
    review_card_id: Mapped[UUID]
    user_id: Mapped[UUID]
    rating: Mapped[ReviewRating] = mapped_column(
        Enum(ReviewRating, name="review_rating", values_callable=lambda e: [x.value for x in e])
    )
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    response_time_ms: Mapped[int | None]
    previous_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    interval_days_after: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    scheduler_name: Mapped[str] = mapped_column(String(80))
    scheduler_version: Mapped[str] = mapped_column(String(40))
    scheduler_state_after: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
