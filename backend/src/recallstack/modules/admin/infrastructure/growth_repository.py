"""Read-only, aggregate platform analytics based on persisted product events.

No referral data is fabricated: acquisition source is unknown until explicitly
captured at first visit and associated with consented signup attribution.
"""
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


_TRACKED_EVENTS = """
SELECT a.user_id, 'dsa' AS feature
  FROM activity_events a JOIN content_items ci ON ci.id = a.content_item_id
 WHERE a.occurred_at >= :since AND a.event_type = 'content_opened' AND ci.type = 'problem'
UNION ALL
SELECT s.user_id, 'dsa' FROM dsa_practice_submissions s WHERE s.created_at >= :since
UNION ALL
SELECT c.user_id, 'ai_' || c.surface FROM reasonai_conversations c WHERE c.created_at >= :since
UNION ALL
SELECT c.user_id, 'ai_' || c.surface FROM reasonai_runs r
 JOIN reasonai_conversations c ON c.id = r.conversation_id WHERE r.started_at >= :since
UNION ALL
SELECT e.profile_id, 'knowledge_feed' FROM user_story_events e WHERE e.occurred_at >= :since
"""


async def load_platform_growth(session: AsyncSession, days: int) -> dict[str, Any]:
    """Counts unique *recorded* feature users, not page visitors or sessions."""
    generated_at = datetime.now(UTC)
    start_date = generated_at.date() - timedelta(days=days - 1)
    since = datetime.combine(start_date, time.min, tzinfo=UTC)
    params = {"since": since}

    overview = (
        await session.execute(
            text(
                """
                SELECT COUNT(*)::int total_users,
                       COUNT(*) FILTER (WHERE created_at >= :since)::int new_users
                FROM profiles
                """
            ),
            params,
        )
    ).mappings().one()

    daily_rows = (
        await session.execute(
            text(
                """
                SELECT (created_at AT TIME ZONE 'UTC')::date day, COUNT(*)::int signups
                FROM profiles WHERE created_at >= :since
                GROUP BY 1 ORDER BY 1
                """
            ),
            params,
        )
    ).mappings().all()
    daily_map = {row["day"]: int(row["signups"]) for row in daily_rows}
    daily_signups = [
        {"day": start_date + timedelta(days=i),
         "signups": daily_map.get(start_date + timedelta(days=i), 0)}
        for i in range(days)
    ]

    engagement = (
        await session.execute(
            text(
                f"""
                WITH tracked AS ({_TRACKED_EVENTS}),
                unique_users AS (SELECT DISTINCT user_id FROM tracked)
                SELECT
                  COUNT(*)::int tracked_engaged_users,
                  COUNT(*) FILTER (
                    WHERE user_id IN (SELECT id FROM profiles WHERE created_at >= :since)
                  )::int newly_engaged_users
                FROM unique_users
                """
            ),
            params,
        )
    ).mappings().one()

    feature_rows = (
        await session.execute(
            text(
                f"""
                WITH tracked AS ({_TRACKED_EVENTS})
                SELECT feature, COUNT(DISTINCT user_id)::int unique_users
                FROM tracked GROUP BY feature ORDER BY unique_users DESC, feature
                """
            ),
            params,
        )
    ).mappings().all()
    features = {str(row["feature"]): int(row["unique_users"]) for row in feature_rows}

    product_counts = (
        await session.execute(
            text(
                """
                SELECT
                  (SELECT COUNT(*) FROM reasonai_runs WHERE started_at >= :since)::int ai_runs,
                  (SELECT COUNT(*) FROM reasonai_runs
                   WHERE started_at >= :since
                     AND (status IN ('failed', 'error') OR error_code IS NOT NULL))::int ai_failed_runs,
                  (SELECT COUNT(*) FROM user_story_events WHERE occurred_at >= :since)::int knowledge_events,
                  (SELECT COUNT(*) FROM dsa_practice_submissions WHERE created_at >= :since)::int dsa_submissions
                """
            ),
            params,
        )
    ).mappings().one()

    new_users = int(overview["new_users"])
    newly_engaged_users = int(engagement["newly_engaged_users"])
    return {
        "period_days": days,
        "generated_at": generated_at,
        "total_users": int(overview["total_users"]),
        "new_users": new_users,
        "tracked_engaged_users": int(engagement["tracked_engaged_users"]),
        "newly_engaged_users": newly_engaged_users,
        "activation_rate": newly_engaged_users / new_users if new_users else 0.0,
        "ai_runs": int(product_counts["ai_runs"]),
        "ai_failed_runs": int(product_counts["ai_failed_runs"]),
        "knowledge_events": int(product_counts["knowledge_events"]),
        "dsa_submissions": int(product_counts["dsa_submissions"]),
        "tracking_source_available": False,
        "signup_source_unknown": new_users,
        "daily_signups": daily_signups,
        "feature_usage": [
            {"feature": name, "unique_users": features.get(name, 0)}
            for name in ("dsa", "ai_dsa", "ai_system_design", "knowledge_feed")
        ],
    }
