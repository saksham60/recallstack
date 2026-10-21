"""Aggregate recorded actions, never infer visitors, location, attribution or billing."""
# ruff: noqa: E501

from datetime import UTC, datetime, time, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def load_platform_growth(session: AsyncSession, days: int) -> dict[str, Any]:
    if days not in (7, 30, 90):
        raise ValueError("Growth period must be 7, 30 or 90 days")
    generated_at = datetime.now(UTC)
    since = datetime.combine(generated_at.date() - timedelta(days=days - 1), time.min, tzinfo=UTC)
    # One statement gives every counter the same snapshot. Bound future client clocks.
    row = (
        (
            await session.execute(
                text("""
      WITH profiles_in_scope AS (
        SELECT id,created_at FROM profiles WHERE created_at <= :until
      ), ai AS (
        SELECT r.*,c.user_id,c.surface FROM reasonai_runs r
        JOIN reasonai_conversations c ON c.id=r.conversation_id
        WHERE r.started_at >= :since AND r.started_at <= :until
      ), jobs AS (
        SELECT id,user_id,created_at,request->>'mode' mode,status,result,plan
        FROM dsa_execution_private.jobs WHERE created_at >= :since AND created_at <= :until
      ), stories AS (
        SELECT profile_id,event_type,occurred_at FROM user_story_events
        WHERE occurred_at >= :since AND occurred_at <= :until
      ), legacy AS (
        SELECT user_id,created_at FROM dsa_practice_submissions
        WHERE created_at >= :since AND created_at <= :until
      ), tracked AS (
        SELECT a.user_id,a.occurred_at at,
          CASE WHEN ci.type='problem' THEN 'dsa' ELSE 'learning' END feature,
          a.event_type IN ('bookmark_added','note_created','note_updated') engaged
        FROM activity_events a JOIN content_items ci ON ci.id=a.content_item_id
        WHERE a.occurred_at >= :since AND a.occurred_at <= :until
          AND a.event_type IN ('content_opened','bookmark_added','note_created','note_updated')
        UNION ALL SELECT user_id,attempted_at,'dsa',true FROM practice_attempts
          WHERE attempted_at >= :since AND attempted_at <= :until
        UNION ALL SELECT user_id,reviewed_at,'learning',true FROM review_history
          WHERE reviewed_at >= :since AND reviewed_at <= :until
        UNION ALL SELECT user_id,created_at,'dsa',true FROM legacy
        UNION ALL SELECT user_id,created_at,'dsa',true FROM jobs WHERE mode IN ('run','submit')
        UNION ALL SELECT user_id,started_at,'ai_'||surface,true FROM ai
        UNION ALL SELECT profile_id,occurred_at,'knowledge_feed',
          event_type IN ('OPEN','SAVE','SHARE','ASK_REASONAI') FROM stories
      ), per_user AS (
        SELECT p.id,p.created_at,bool_or(t.engaged) engaged,
          count(DISTINCT (t.at AT TIME ZONE 'UTC')::date) active_days
        FROM tracked t JOIN profiles_in_scope p ON p.id=t.user_id GROUP BY p.id,p.created_at
      )
      SELECT
        (SELECT count(*) FROM profiles_in_scope)::int total_users,
        (SELECT count(*) FROM profiles_in_scope WHERE created_at >= :since)::int new_users,
        (SELECT count(*) FROM per_user)::int recorded_active_users,
        (SELECT count(*) FROM per_user WHERE created_at < :since)::int returning_users,
        (SELECT count(*) FROM per_user WHERE active_days >= 2)::int repeat_active_users,
        (SELECT count(*) FROM per_user WHERE engaged)::int tracked_engaged_users,
        (SELECT count(*) FROM per_user WHERE engaged AND created_at >= :since)::int newly_engaged_users,
        (SELECT count(*) FROM ai)::int ai_runs,
        (SELECT count(*) FROM ai WHERE status IN ('failed','error') OR error_code IS NOT NULL)::int ai_failed_runs,
        (SELECT count(*) FROM ai WHERE status='interrupted')::int ai_interrupted_runs,
        (SELECT count(*) FROM stories)::int knowledge_events,
        (SELECT count(*) FROM stories WHERE event_type='VIEW')::int knowledge_impressions,
        (SELECT count(*) FROM legacy)::int dsa_submissions,
        (SELECT count(*) FROM jobs WHERE mode='run')::int server_runs,
        (SELECT count(*) FROM jobs WHERE mode='submit')::int server_submissions,
        (SELECT count(*) FROM jobs WHERE mode='submit' AND status='completed'
          AND result->>'verdict'='accepted' AND plan ? 'certificateId'
          AND coalesce(plan->>'gradingLevel','official')='official')::int official_accepted,
        (SELECT count(*) FROM jobs WHERE mode='submit' AND status='completed'
          AND result->>'verdict'='provisional_pass')::int provisional_passes,
        (SELECT count(*) FROM dsa_reports_private.reports WHERE created_at >= :since AND created_at <= :until)::int code_intelligence_reports,
        (SELECT count(*) FROM dsa_reports_private.reports WHERE created_at >= :since AND created_at <= :until AND status='failed')::int code_intelligence_failed,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('day',day::date,'signups',signups) ORDER BY day),'[]')
          FROM (SELECT d.day,count(p.id)::int signups
            FROM generate_series(CAST(:since AS timestamptz) AT TIME ZONE 'UTC',CAST(:until AS timestamptz) AT TIME ZONE 'UTC',interval '1 day') d(day)
            LEFT JOIN profiles_in_scope p ON (p.created_at AT TIME ZONE 'UTC')::date=d.day::date
            GROUP BY d.day) daily) daily_signups,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('feature',feature,'unique_users',users) ORDER BY feature),'[]')
          FROM (SELECT t.feature,count(DISTINCT p.id)::int users FROM tracked t
            JOIN profiles_in_scope p ON p.id=t.user_id GROUP BY t.feature) usage) feature_usage
    """),
                {"since": since, "until": generated_at},
            )
        )
        .mappings()
        .one()
    )
    result = dict(row)
    new_users = int(result["new_users"])
    result.update(
        period_days=days,
        generated_at=generated_at,
        activation_rate=int(result["newly_engaged_users"]) / new_users if new_users else 0.0,
        tracking_source_available=False,
        signup_source_unknown=new_users,
    )
    features = {point["feature"]: point["unique_users"] for point in result["feature_usage"]}
    result["feature_usage"] = [
        {"feature": name, "unique_users": features.get(name, 0)}
        for name in (
            "dsa",
            "ai_dsa",
            "ai_system_design",
            "knowledge_feed",
            "learning",
        )
    ]
    return result
