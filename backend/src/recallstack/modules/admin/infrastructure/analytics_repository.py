# ruff: noqa: E501, S608

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ACCEPTED_OUTCOME = "solved_independently"


class SqlAlchemyAdminAnalyticsRepository:
    """PostgreSQL aggregate queries for the read-only administration surface."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def overview(self) -> dict[str, Any]:
        row = (
            (
                await self._session.execute(
                    text(
                        """
                    WITH problem_attempts AS (
                      SELECT pa.* FROM practice_attempts pa
                      JOIN content_items ci ON ci.id = pa.content_item_id
                      WHERE ci.type = 'problem'
                    ), completions AS (
                      SELECT DISTINCT user_id, content_item_id FROM problem_attempts
                      WHERE outcome::text = :accepted
                    ), attempted AS (
                      SELECT DISTINCT user_id, content_item_id FROM problem_attempts
                    ), last_activity AS (
                      SELECT p.id,
                        GREATEST(
                          (SELECT max(a.occurred_at) FROM activity_events a WHERE a.user_id=p.id),
                          (SELECT max(a.attempted_at) FROM practice_attempts a WHERE a.user_id=p.id),
                          (SELECT max(r.reviewed_at) FROM review_history r WHERE r.user_id=p.id)
                        ) AS at
                      FROM profiles p
                    ), per_user AS (
                      SELECT p.id, count(c.content_item_id)::int completed
                      FROM profiles p LEFT JOIN completions c ON c.user_id=p.id GROUP BY p.id
                    )
                    SELECT
                      count(DISTINCT p.id)::int total_users,
                      count(DISTINCT p.id) FILTER (WHERE p.created_at >= date_trunc('day', now()))::int new_today,
                      count(DISTINCT p.id) FILTER (WHERE p.created_at >= now()-interval '7 days')::int new_7,
                      count(DISTINCT p.id) FILTER (WHERE p.created_at >= now()-interval '30 days')::int new_30,
                      (SELECT count(*) FROM last_activity WHERE at >= now()-interval '24 hours')::int active_24,
                      (SELECT count(*) FROM last_activity WHERE at >= now()-interval '7 days')::int active_7,
                      (SELECT count(*) FROM last_activity WHERE at >= now()-interval '30 days')::int active_30,
                      (SELECT count(*) FROM content_items WHERE type='problem' AND current_published_version_id IS NOT NULL AND archived_at IS NULL)::int published,
                      (SELECT count(*) FROM problem_attempts)::int attempts,
                      (SELECT count(*) FROM problem_attempts WHERE outcome::text=:accepted)::int accepted_attempts,
                      (SELECT count(*) FROM attempted)::int unique_attempts,
                      (SELECT count(*) FROM completions)::int unique_completions,
                      coalesce((SELECT avg(completed) FROM per_user),0)::float average_completed,
                      (SELECT count(*) FROM per_user WHERE completed=0)::int bucket_0,
                      (SELECT count(*) FROM per_user WHERE completed BETWEEN 1 AND 69)::int bucket_1_69,
                      (SELECT count(*) FROM per_user WHERE completed BETWEEN 70 AND 99)::int bucket_70_99,
                      (SELECT count(*) FROM per_user WHERE completed>=100)::int bucket_100
                    FROM profiles p
                    """
                    ),
                    {"accepted": ACCEPTED_OUTCOME},
                )
            )
            .mappings()
            .one()
        )
        attempts = int(row["unique_attempts"])
        completions = int(row["unique_completions"])
        return {
            "users": {
                "total": row["total_users"],
                "new_today": row["new_today"],
                "new_last_7_days": row["new_7"],
                "new_last_30_days": row["new_30"],
                "active_last_24_hours": row["active_24"],
                "active_last_7_days": row["active_7"],
                "active_last_30_days": row["active_30"],
            },
            "problems": {
                "total_published": row["published"],
                "total_attempts": row["attempts"],
                "accepted_attempts": row["accepted_attempts"],
                "unique_user_problem_attempts": attempts,
                "unique_user_problem_completions": completions,
                "completion_rate": completions / attempts if attempts else 0.0,
            },
            "progress": {
                "average_unique_problems_completed": row["average_completed"],
                "users_with_zero_completions": row["bucket_0"],
                "users_with_1_to_69_completions": row["bucket_1_69"],
                "users_with_70_to_99_completions": row["bucket_70_99"],
                "users_with_100_or_more_completions": row["bucket_100"],
            },
            "generated_at": datetime.now(UTC),
        }

    async def list_users(
        self, *, filters: dict[str, Any], offset: int, limit: int, sort_by: str, descending: bool
    ) -> tuple[int, list[dict[str, Any]]]:
        sort_columns = {
            "created_at": "created_at",
            "last_active_at": "last_active_at",
            "unique_problems_completed": "completed",
            "unique_problems_attempted": "attempted",
            "current_streak": "created_at",
            "name": "name",
            "email": "email",
        }
        order = f"{sort_columns[sort_by]} {'DESC' if descending else 'ASC'} NULLS LAST, user_id"
        conditions = ["1=1"]
        params: dict[str, Any] = {"accepted": ACCEPTED_OUTCOME, "limit": limit, "offset": offset}
        for key, expression in (
            ("signed_up_from", "created_at >= :signed_up_from"),
            ("signed_up_to", "created_at <= :signed_up_to"),
            ("active_from", "last_active_at >= :active_from"),
            ("active_to", "last_active_at <= :active_to"),
            ("min_completed", "completed >= :min_completed"),
            ("max_completed", "completed <= :max_completed"),
        ):
            if filters.get(key) is not None:
                conditions.append(expression)
                params[key] = filters[key]
        if filters.get("search"):
            conditions.append("(name ILIKE :search ESCAPE '\\' OR email ILIKE :search ESCAPE '\\')")
            escaped = (
                str(filters["search"]).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            )
            params["search"] = f"%{escaped}%"
        if filters.get("interview_eligible") is not None:
            conditions.append(
                "completed >= 100" if filters["interview_eligible"] else "completed < 100"
            )
        if filters.get("account_status") is not None:
            conditions.append(":account_status = 'active'")
            params["account_status"] = filters["account_status"]
        where = " AND ".join(conditions)
        base = """
          SELECT p.id user_id, p.display_name name, coalesce(p.email,'') email, p.created_at,
            GREATEST(
              (SELECT max(a.occurred_at) FROM activity_events a WHERE a.user_id=p.id),
              (SELECT max(a.attempted_at) FROM practice_attempts a WHERE a.user_id=p.id),
              (SELECT max(r.reviewed_at) FROM review_history r WHERE r.user_id=p.id)
            ) last_active_at,
            (SELECT count(DISTINCT pa.content_item_id) FROM practice_attempts pa
             JOIN content_items ci ON ci.id=pa.content_item_id
             WHERE pa.user_id=p.id AND ci.type='problem')::int attempted,
            (SELECT count(DISTINCT pa.content_item_id) FROM practice_attempts pa
             JOIN content_items ci ON ci.id=pa.content_item_id
             WHERE pa.user_id=p.id AND ci.type='problem' AND pa.outcome::text=:accepted)::int completed
          FROM profiles p
        """
        total = int(
            await self._session.scalar(
                text(f"SELECT count(*) FROM ({base}) users WHERE {where}"), params
            )
            or 0
        )
        rows = (
            (
                await self._session.execute(
                    text(
                        f"SELECT * FROM ({base}) users WHERE {where} ORDER BY {order} LIMIT :limit OFFSET :offset"
                    ),
                    params,
                )
            )
            .mappings()
            .all()
        )
        return total, [self._user(dict(row)) for row in rows]

    async def user_detail(self, user_id: UUID) -> dict[str, Any] | None:
        profile = (
            (
                await self._session.execute(
                    text(
                        """
                    SELECT p.id user_id,p.display_name name,coalesce(p.email,'') email,p.created_at,
                      GREATEST((SELECT max(occurred_at) FROM activity_events WHERE user_id=p.id),
                        (SELECT max(attempted_at) FROM practice_attempts WHERE user_id=p.id),
                        (SELECT max(reviewed_at) FROM review_history WHERE user_id=p.id)) last_active_at
                    FROM profiles p WHERE p.id=:user_id
                    """
                    ),
                    {"user_id": user_id},
                )
            )
            .mappings()
            .one_or_none()
        )
        if profile is None:
            return None
        metrics = (
            (
                await self._session.execute(
                    text(
                        """
                    WITH ranked AS (
                      SELECT pa.*,row_number() OVER(PARTITION BY pa.content_item_id ORDER BY pa.attempted_at,pa.id) n
                      FROM practice_attempts pa JOIN content_items ci ON ci.id=pa.content_item_id
                      WHERE pa.user_id=:user_id AND ci.type='problem'
                    )
                    SELECT count(*)::int total_attempts,
                      count(*) FILTER(WHERE outcome::text=:accepted)::int accepted_attempts,
                      count(DISTINCT content_item_id)::int attempted,
                      count(DISTINCT content_item_id) FILTER(WHERE outcome::text=:accepted)::int completed,
                      count(*) FILTER(WHERE n=1 AND outcome::text=:accepted)::int first_success
                    FROM ranked
                    """
                    ),
                    {"user_id": user_id, "accepted": ACCEPTED_OUTCOME},
                )
            )
            .mappings()
            .one()
        )
        difficulties = (
            (
                await self._session.execute(
                    text(
                        """
                    SELECT d.difficulty,
                      count(DISTINCT pa.content_item_id)::int attempted,
                      count(DISTINCT pa.content_item_id) FILTER(WHERE pa.outcome::text=:accepted)::int completed
                    FROM (VALUES ('easy'),('medium'),('hard')) d(difficulty)
                    LEFT JOIN content_items ci ON ci.difficulty::text=d.difficulty AND ci.type='problem'
                    LEFT JOIN practice_attempts pa ON pa.content_item_id=ci.id AND pa.user_id=:user_id
                    GROUP BY d.difficulty ORDER BY array_position(ARRAY['easy','medium','hard'],d.difficulty)
                    """
                    ),
                    {"user_id": user_id, "accepted": ACCEPTED_OUTCOME},
                )
            )
            .mappings()
            .all()
        )
        topics = (
            (
                await self._session.execute(
                    text(
                        """
                    SELECT t.id topic_id,t.name topic_name,count(DISTINCT ci.id)::int available_problems,
                      count(DISTINCT pa.content_item_id)::int attempted_problems,
                      count(DISTINCT pa.content_item_id) FILTER(WHERE pa.outcome::text=:accepted)::int completed_problems
                    FROM topics t
                    JOIN content_version_topics cvt ON cvt.topic_id=t.id
                    JOIN content_items ci ON ci.id=cvt.content_item_id
                      AND ci.current_published_version_id=cvt.content_version_id
                      AND ci.type='problem' AND ci.archived_at IS NULL
                    LEFT JOIN practice_attempts pa ON pa.content_item_id=ci.id AND pa.user_id=:user_id
                    GROUP BY t.id,t.name ORDER BY t.name,t.id
                    """
                    ),
                    {"user_id": user_id, "accepted": ACCEPTED_OUTCOME},
                )
            )
            .mappings()
            .all()
        )
        revision = (
            (
                await self._session.execute(
                    text(
                        """
                    SELECT count(DISTINCT rc.id)::int total_revision_items,
                      count(DISTINCT rh.id)::int completed_revisions,
                      count(DISTINCT rc.id) FILTER(WHERE rc.due_at<now() AND rc.suspended_at IS NULL)::int overdue_revisions,
                      max(rh.reviewed_at) last_revision_at
                    FROM review_cards rc LEFT JOIN review_history rh
                      ON rh.review_card_id=rc.id AND rh.user_id=rc.user_id WHERE rc.user_id=:user_id
                    """
                    ),
                    {"user_id": user_id},
                )
            )
            .mappings()
            .one()
        )
        attempted, completed = int(metrics["attempted"]), int(metrics["completed"])
        first = int(metrics["first_success"])
        return {
            "profile": {**dict(profile), "account_status": "active"},
            "progress_summary": {
                "unique_problems_attempted": attempted,
                "unique_problems_completed": completed,
                "total_attempts": metrics["total_attempts"],
                "accepted_attempts": metrics["accepted_attempts"],
                "first_attempt_successes": first,
                "first_attempt_success_rate": first / attempted if attempted else 0.0,
                "current_streak": None,
                "longest_streak": None,
                "readiness_score": None,
            },
            "interview_unlock": self._unlock(completed),
            "difficulty_breakdown": [dict(row) for row in difficulties],
            "topic_progress": [
                {
                    **dict(row),
                    "completion_percentage": (
                        int(row["completed_problems"]) / int(row["available_problems"]) * 100
                        if row["available_problems"]
                        else 0.0
                    ),
                }
                for row in topics
            ],
            "revision_summary": {"available": True, **dict(revision)},
            "mock_test_summary": {
                "available": False,
                "total_attempts": 0,
                "completed_tests": 0,
                "average_score": None,
            },
        }

    async def activity(
        self,
        user_id: UUID,
        *,
        activity_type: str | None,
        from_date: datetime | None,
        to_date: datetime | None,
        offset: int,
        limit: int,
    ) -> tuple[int, list[dict[str, Any]]] | None:
        exists = await self._session.scalar(
            text("SELECT 1 FROM profiles WHERE id=:id"), {"id": user_id}
        )
        if exists is None:
            return None
        conditions = ["user_id=:user_id"]
        params: dict[str, Any] = {
            "user_id": user_id,
            "accepted": ACCEPTED_OUTCOME,
            "offset": offset,
            "limit": limit,
        }
        if activity_type:
            conditions.append("activity_type=:activity_type")
            params["activity_type"] = activity_type
        if from_date:
            conditions.append("occurred_at>=:from_date")
            params["from_date"] = from_date
        if to_date:
            conditions.append("occurred_at<=:to_date")
            params["to_date"] = to_date
        where = " AND ".join(conditions)
        base = """
          SELECT 'attempt:'||r.id activity_id,
            CASE WHEN r.outcome::text=:accepted THEN 'problem_completed'
                 WHEN r.attempt_number>1 THEN 'problem_reattempted' ELSE 'problem_attempted' END activity_type,
            r.attempted_at occurred_at,r.user_id,r.content_item_id problem_id,coalesce(cv.title,ci.slug) title,
            ci.difficulty::text difficulty,
            (SELECT t.name FROM content_version_topics cvt JOIN topics t ON t.id=cvt.topic_id
             WHERE cvt.content_version_id=ci.current_published_version_id ORDER BY cvt.is_primary DESC,cvt.sort_order LIMIT 1) topic,
            r.attempt_number,r.outcome status,r.duration_seconds,r.hint_used
          FROM (SELECT pa.*,row_number() OVER(PARTITION BY user_id,content_item_id ORDER BY attempted_at,id)::int attempt_number
                FROM practice_attempts pa) r
          JOIN content_items ci ON ci.id=r.content_item_id
          LEFT JOIN content_versions cv ON cv.id=ci.current_published_version_id WHERE ci.type='problem'
          UNION ALL
          SELECT 'revision:'||rh.id,'revision_completed',rh.reviewed_at,rh.user_id,
            ci.id,coalesce(cv.title,ci.slug),ci.difficulty::text,
            (SELECT t.name FROM content_version_topics cvt JOIN topics t ON t.id=cvt.topic_id
             WHERE cvt.content_version_id=ci.current_published_version_id
             ORDER BY cvt.is_primary DESC,cvt.sort_order LIMIT 1),
            NULL,rh.rating::text,
            CASE WHEN rh.response_time_ms IS NULL THEN NULL ELSE rh.response_time_ms/1000 END,
            NULL
          FROM review_history rh JOIN review_cards rc
            ON rc.id=rh.review_card_id AND rc.user_id=rh.user_id
          JOIN content_items ci ON ci.id=rc.content_item_id
          LEFT JOIN content_versions cv ON cv.id=ci.current_published_version_id
          UNION ALL
          SELECT 'signup:'||p.id,'user_signed_up',p.created_at,p.id,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
          FROM profiles p
        """
        total = int(
            await self._session.scalar(
                text(f"SELECT count(*) FROM ({base}) a WHERE {where}"), params
            )
            or 0
        )
        rows = (
            (
                await self._session.execute(
                    text(
                        f"SELECT * FROM ({base}) a WHERE {where} ORDER BY occurred_at DESC,activity_id DESC LIMIT :limit OFFSET :offset"
                    ),
                    params,
                )
            )
            .mappings()
            .all()
        )
        items = []
        for row in rows:
            item = dict(row)
            problem = (
                None
                if item["problem_id"] is None
                else {
                    "problem_id": item["problem_id"],
                    "title": item["title"],
                    "difficulty": item["difficulty"],
                    "topic": item["topic"],
                }
            )
            items.append(
                {
                    "activity_id": item["activity_id"],
                    "activity_type": item["activity_type"],
                    "occurred_at": item["occurred_at"],
                    "problem": problem,
                    "metadata": {
                        "attempt_number": item["attempt_number"],
                        "status": item["status"],
                        "time_spent_seconds": item["duration_seconds"],
                        "hints_used": item["hint_used"],
                    },
                }
            )
        return total, items

    async def list_problems(
        self, *, filters: dict[str, Any], offset: int, limit: int, sort_by: str, descending: bool
    ) -> tuple[int, list[dict[str, Any]]]:
        sort_columns = {
            "attempts": "total_attempts",
            "unique_users_attempted": "unique_users_attempted",
            "unique_users_completed": "unique_users_completed",
            "solve_rate": "solve_rate",
            "first_attempt_success_rate": "first_attempt_success_rate",
            "title": "title",
            "created_at": "created_at",
        }
        conditions = ["1=1"]
        params: dict[str, Any] = {"accepted": ACCEPTED_OUTCOME, "offset": offset, "limit": limit}
        if filters.get("search"):
            conditions.append("title ILIKE :search ESCAPE '\\'")
            escaped = (
                str(filters["search"]).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            )
            params["search"] = f"%{escaped}%"
        for key, expression in (
            ("difficulty", "difficulty=:difficulty"),
            ("publication_status", "publication_status=:publication_status"),
            ("topic_id", ":topic_id = ANY(topic_ids)"),
        ):
            if filters.get(key) is not None:
                conditions.append(expression)
                params[key] = filters[key]
        base = self._problem_analytics_sql()
        where = " AND ".join(conditions)
        total = int(
            await self._session.scalar(
                text(f"SELECT count(*) FROM ({base}) q WHERE {where}"), params
            )
            or 0
        )
        rows = (
            (
                await self._session.execute(
                    text(
                        f"SELECT * FROM ({base}) q WHERE {where} ORDER BY {sort_columns[sort_by]} {'DESC' if descending else 'ASC'} NULLS LAST,problem_id LIMIT :limit OFFSET :offset"
                    ),
                    params,
                )
            )
            .mappings()
            .all()
        )
        return total, [self._problem(dict(row)) for row in rows]

    async def problem_detail(self, problem_id: UUID) -> dict[str, Any] | None:
        row = (
            (
                await self._session.execute(
                    text(
                        f"SELECT * FROM ({self._problem_analytics_sql()}) q WHERE problem_id=:problem_id"
                    ),
                    {"problem_id": problem_id, "accepted": ACCEPTED_OUTCOME},
                )
            )
            .mappings()
            .one_or_none()
        )
        if row is None:
            return None
        item = self._problem(dict(row))
        attempts = (
            (
                await self._session.execute(
                    text(
                        """
                SELECT pa.user_id,p.display_name user_name,pa.attempted_at,
                  CASE WHEN pa.outcome::text=:accepted THEN 'accepted' ELSE pa.outcome::text END status,
                  row_number() OVER(PARTITION BY pa.user_id,pa.content_item_id ORDER BY pa.attempted_at,pa.id)::int attempt_number
                FROM practice_attempts pa JOIN profiles p ON p.id=pa.user_id
                WHERE pa.content_item_id=:problem_id ORDER BY pa.attempted_at DESC,pa.id DESC LIMIT 20
                """
                    ),
                    {"problem_id": problem_id, "accepted": ACCEPTED_OUTCOME},
                )
            )
            .mappings()
            .all()
        )
        return {
            "problem": {
                key: item[key]
                for key in ("problem_id", "title", "difficulty", "publication_status", "topics")
            },
            "analytics": {
                key: item[key]
                for key in (
                    "total_attempts",
                    "accepted_attempts",
                    "unique_users_attempted",
                    "unique_users_completed",
                    "solve_rate",
                    "first_attempt_success_rate",
                    "average_attempts_before_completion",
                    "average_solve_time_seconds",
                    "hint_usage_count",
                )
            },
            "recent_attempts": [dict(value) for value in attempts],
        }

    async def add_audit(self, values: dict[str, Any]) -> None:
        await self._session.execute(
            text(
                """INSERT INTO admin_audit_logs
                (admin_user_id,action,resource_type,resource_id,request_method,request_path,request_id,metadata_json)
                VALUES (:admin_user_id,:action,:resource_type,:resource_id,:request_method,:request_path,:request_id,CAST(:metadata_json AS jsonb))"""
            ),
            values,
        )

    async def audit_logs(
        self, *, filters: dict[str, Any], offset: int, limit: int
    ) -> tuple[int, list[dict[str, Any]]]:
        conditions = ["1=1"]
        params: dict[str, Any] = {"offset": offset, "limit": limit}
        for key, expression in (
            ("admin_user_id", "admin_user_id=:admin_user_id"),
            ("action", "action=:action"),
            ("resource_type", "resource_type=:resource_type"),
            ("from_date", "created_at>=:from_date"),
            ("to_date", "created_at<=:to_date"),
        ):
            if filters.get(key) is not None:
                conditions.append(expression)
                params[key] = filters[key]
        where = " AND ".join(conditions)
        total = int(
            await self._session.scalar(
                text(f"SELECT count(*) FROM admin_audit_logs WHERE {where}"), params
            )
            or 0
        )
        rows = (
            (
                await self._session.execute(
                    text(
                        f"SELECT * FROM admin_audit_logs WHERE {where} ORDER BY created_at DESC,id DESC LIMIT :limit OFFSET :offset"
                    ),
                    params,
                )
            )
            .mappings()
            .all()
        )
        return total, [dict(row) for row in rows]

    @staticmethod
    def _unlock(completed: int) -> dict[str, Any]:
        return {
            "required_completions": 100,
            "current_completions": completed,
            "remaining_completions": max(0, 100 - completed),
            "eligible": completed >= 100,
        }

    @classmethod
    def _user(cls, row: dict[str, Any]) -> dict[str, Any]:
        completed = int(row.pop("completed"))
        attempted = int(row.pop("attempted"))
        return {
            **row,
            "account_status": "active",
            "unique_problems_attempted": attempted,
            "unique_problems_completed": completed,
            "current_streak": None,
            "readiness_score": None,
            "interview_unlock": cls._unlock(completed),
        }

    @staticmethod
    def _problem_analytics_sql() -> str:
        return """
          WITH ranked AS (
            SELECT pa.*,row_number() OVER(PARTITION BY pa.user_id,pa.content_item_id ORDER BY pa.attempted_at,pa.id) n
            FROM practice_attempts pa
          ), completed_users AS (
            SELECT content_item_id,user_id,min(n)::int attempts_to_completion
            FROM ranked WHERE outcome::text=:accepted GROUP BY content_item_id,user_id
          )
          SELECT ci.id problem_id,coalesce(cv.title,latest.title,ci.slug) title,
            ci.difficulty::text difficulty,
            CASE WHEN ci.archived_at IS NOT NULL THEN 'archived'
                 WHEN ci.current_published_version_id IS NOT NULL THEN 'published'
                 ELSE coalesce(latest.status::text,'draft') END publication_status,
            ci.created_at,
            coalesce(array_agg(DISTINCT t.name ORDER BY t.name)
              FILTER(WHERE t.name IS NOT NULL),'{}') topics,
            coalesce(array_agg(DISTINCT t.id ORDER BY t.id)
              FILTER(WHERE t.id IS NOT NULL),'{}') topic_ids,
            count(DISTINCT r.id)::int total_attempts,
            count(DISTINCT r.id) FILTER(WHERE r.outcome::text=:accepted)::int accepted_attempts,
            count(DISTINCT r.user_id)::int unique_users_attempted,
            count(DISTINCT r.user_id) FILTER(WHERE r.outcome::text=:accepted)::int unique_users_completed,
            count(DISTINCT r.user_id) FILTER(WHERE r.n=1 AND r.outcome::text=:accepted)::int first_attempt_successes,
            CASE WHEN count(DISTINCT r.user_id)=0 THEN 0
                 ELSE count(DISTINCT r.user_id) FILTER(WHERE r.outcome::text=:accepted)::float/count(DISTINCT r.user_id) END solve_rate,
            CASE WHEN count(DISTINCT r.user_id)=0 THEN 0
                 ELSE count(DISTINCT r.user_id) FILTER(WHERE r.n=1 AND r.outcome::text=:accepted)::float/count(DISTINCT r.user_id) END first_attempt_success_rate,
            (SELECT avg(cu.attempts_to_completion)::float FROM completed_users cu
             WHERE cu.content_item_id=ci.id) average_attempts_before_completion
          FROM content_items ci LEFT JOIN content_versions cv ON cv.id=ci.current_published_version_id
          LEFT JOIN LATERAL (
            SELECT v.title,v.status FROM content_versions v WHERE v.content_item_id=ci.id
            ORDER BY v.version_number DESC LIMIT 1
          ) latest ON true
          LEFT JOIN content_version_topics cvt ON cvt.content_item_id=ci.id AND cvt.content_version_id=ci.current_published_version_id
          LEFT JOIN topics t ON t.id=cvt.topic_id LEFT JOIN ranked r ON r.content_item_id=ci.id
          WHERE ci.type='problem' GROUP BY ci.id,cv.title,latest.title,latest.status
        """

    @staticmethod
    def _problem(row: dict[str, Any]) -> dict[str, Any]:
        row.pop("created_at", None)
        row.pop("topic_ids", None)
        row["topics"] = list(row["topics"] or [])
        row["average_solve_time_seconds"] = None
        # Hint use is captured, but the requested metric's semantics are not established.
        row["hint_usage_count"] = None
        return row
