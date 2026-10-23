"""Read canonical metadata, never source code, prompts, documents or provider payloads."""

# SQL fragments below are application literals, never user-provided identifiers.
# ruff: noqa: E501, S608
import base64
import json
from datetime import UTC, datetime, time, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.telemetry.contract import Coverage, Intelligence, Metric, Timeline
from recallstack.shared.errors import AppError

SOURCES = {
    "events": "telemetry_private.product_events",
    "sessions": "telemetry_private.user_sessions",
    "acquisition": "telemetry_private.user_acquisition",
    "classes": "telemetry_private.account_classifications",
    "jobs": "dsa_execution_private.jobs",
    "job_transitions": "telemetry_private.dsa_job_transitions",
    "ai": "public.reasonai_runs",
    "feed": "public.user_story_events",
    "feed_archive": "telemetry_private.deleted_story_actions",
    "reports": "public.dsa_code_intelligence_reports",
    "ci_usage": "dsa_reports_private.reports",
    "designs": "public.diagrams",
    "ai_measurements": "telemetry_private.ai_run_measurements",
    "catalog": "public.content_items",
    "topics": "public.content_version_topics",
    "story_topics": "public.knowledge_story_topics",
}
EMPTY = "SELECT ''::text id,NULL::uuid user_id,NULL::timestamptz at,''::text name,''::text feature,''::text source,''::text evidence,NULL::uuid session_id,NULL::text entity_id,NULL::uuid correlation_id,'{}'::jsonb properties,false engaged WHERE false"


class IntelligenceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.available: dict[str, bool] = {}
        self.installed_at: datetime | None = None

    async def inspect(self) -> None:
        self.available = {
            row[0]: row[1]
            for row in (
                await self.session.execute(
                    text(
                        "SELECT key,to_regclass(value) IS NOT NULL present FROM jsonb_each_text(CAST(:sources AS jsonb))"
                    ),
                    {"sources": json.dumps(SOURCES)},
                )
            ).all()
        }
        if self.available["events"]:
            self.installed_at = await self.session.scalar(
                text(
                    "SELECT collection_started_at FROM telemetry_private.installation WHERE singleton"
                )
            )

    async def classify(
        self, user: UUID, admin: UUID, classification: str | None, reason: str
    ) -> dict[str, str | None]:
        await self.inspect()
        if not self.available["classes"]:
            raise AppError(
                error_type="telemetry-unavailable",
                title="Telemetry unavailable",
                status=503,
                detail="Install the reviewed telemetry migration before classifying accounts.",
            )
        if not await self.session.scalar(
            text("SELECT EXISTS(SELECT 1 FROM profiles WHERE id=:user)"), {"user": user}
        ):
            raise AppError(
                error_type="user-not-found",
                title="User not found",
                status=404,
                detail="The requested user was not found.",
            )
        if classification is None:
            await self.session.execute(
                text("DELETE FROM telemetry_private.account_classifications WHERE user_id=:user"),
                {"user": user},
            )
        else:
            await self.session.execute(
                text("""
              INSERT INTO telemetry_private.account_classifications(user_id,classified_by,classification,reason)
              VALUES(:user,:admin,:classification,:reason) ON CONFLICT(user_id) DO UPDATE
              SET classified_by=excluded.classified_by,classification=excluded.classification,
                reason=excluded.reason,created_at=now()
            """),
                {"user": user, "admin": admin, "classification": classification, "reason": reason},
            )
        return {"classification": classification}

    def coverage(self, days: int) -> Coverage:
        now = datetime.now(UTC)
        return Coverage(
            generated_at=now,
            until=now,
            since=datetime.combine(now.date() - timedelta(days=days - 1), time.min, UTC),
            telemetry_since=self.installed_at,
        )

    def facts(self) -> str:
        parts = [
            """SELECT 'profile:'||id id,id user_id,created_at at,'auth.profile_created' name,
          'auth' feature,'backend' source,'canonical' evidence,NULL::uuid session_id,
          id::text entity_id,NULL::uuid correlation_id,'{}'::jsonb properties,false engaged
          FROM profiles WHERE created_at BETWEEN :since AND :until
            AND (CAST(:user AS uuid) IS NULL OR id=:user)"""
        ]
        if self.available["events"]:
            parts.append("""SELECT 'event:'||event_id id,user_id,effective_at at,event_name name,
              CASE WHEN feature='navigation' THEN coalesce(properties->>'feature','navigation') ELSE feature END feature,
              source,'client_reported'::text evidence,session_id,entity_id::text,correlation_id,properties||jsonb_build_object('clock_quality',clock_quality,'client_occurred_at',occurred_at,'received_at',received_at),engaged
              FROM telemetry_private.product_events WHERE effective_at BETWEEN :since AND :until
                AND (CAST(:user AS uuid) IS NULL OR user_id=:user)""")
        if self.available["jobs"]:
            parts.append("""SELECT 'job:'||id,user_id,created_at,'dsa.'||(request->>'mode')||'_recorded','dsa',
              'backend','canonical',NULL::uuid,request->>'problemId',NULL::uuid,
              jsonb_build_object('mode',request->>'mode','status',status,
                'error',status IN ('failed','timed_out'),
                'verdict',CASE WHEN result->>'verdict' IN ('accepted','provisional_pass','passed_public_tests',
                  'wrong_answer','runtime_error','syntax_error','time_limit_exceeded','output_limit_exceeded') THEN result->>'verdict' END,
                'official',request->>'mode'='submit' AND nullif(plan->>'certificateId','') IS NOT NULL
                  AND coalesce(plan->>'gradingLevel','official')='official',
                'accepted',request->>'mode'='submit' AND status='completed' AND result->>'verdict'='accepted'
                  AND nullif(plan->>'certificateId','') IS NOT NULL AND coalesce(plan->>'gradingLevel','official')='official'),true
              FROM dsa_execution_private.jobs WHERE created_at BETWEEN :since AND :until
                AND (CAST(:user AS uuid) IS NULL OR user_id=:user)""")
        if self.available["ai"]:
            parts.append("""SELECT 'run:'||r.id,c.user_id,r.started_at,'ai.run_recorded','ai','backend','canonical',
              NULL::uuid,r.id::text,NULL::uuid,
              jsonb_build_object('status',r.status,'surface',c.surface,
                'error',r.error_code IS NOT NULL OR r.status IN ('failed','error'),
                'duration_ms',CASE WHEN r.completed_at>=r.started_at THEN extract(epoch FROM r.completed_at-r.started_at)*1000 END),true
              FROM reasonai_runs r JOIN reasonai_conversations c ON c.id=r.conversation_id
              WHERE r.started_at BETWEEN :since AND :until AND (CAST(:user AS uuid) IS NULL OR c.user_id=:user)""")
        if self.available["job_transitions"]:
            parts.append("""SELECT 'job-transition:'||id,user_id,occurred_at,event_name,'dsa','backend',
              'authoritative_transition',NULL::uuid,problem_id::text,job_id,
              jsonb_build_object('job_id',job_id,'mode',mode,'status',status,'phase',phase,
                'attempt',attempt,'verdict',verdict,'official',official),true
              FROM telemetry_private.dsa_job_transitions WHERE occurred_at BETWEEN :since AND :until
                AND (CAST(:user AS uuid) IS NULL OR user_id=:user)""")
        if self.available["feed"]:
            parts.append("""SELECT 'story:'||id,profile_id,occurred_at,'feed.'||lower(event_type),'feed',
              'backend','canonical_client_action',NULL::uuid,story_id::text,NULL::uuid,
              jsonb_build_object('action',event_type),event_type IN ('OPEN','SAVE','SHARE','ASK_REASONAI')
              FROM user_story_events WHERE occurred_at BETWEEN :since AND :until
                AND (CAST(:user AS uuid) IS NULL OR profile_id=:user)""")
        if self.available["feed_archive"]:
            parts.append("""SELECT 'story:'||id,profile_id,occurred_at,'feed.'||lower(event_type),'feed',
              'backend','canonical_client_action',NULL::uuid,story_id::text,NULL::uuid,
              jsonb_build_object('action',event_type,'story_deleted',true),event_type IN ('OPEN','SAVE','SHARE','ASK_REASONAI')
              FROM telemetry_private.deleted_story_actions WHERE occurred_at BETWEEN :since AND :until
                AND (CAST(:user AS uuid) IS NULL OR profile_id=:user)""")
        if self.available["reports"]:
            parts.append("""SELECT 'report:'||id,user_id,created_at,'dsa.report_recorded','dsa','backend','canonical',
              NULL::uuid,problem_id::text,NULL::uuid,
              jsonb_build_object('status',generation_status),true FROM dsa_code_intelligence_reports
              WHERE created_at BETWEEN :since AND :until AND (CAST(:user AS uuid) IS NULL OR user_id=:user)""")
        if self.available["designs"]:
            parts.append("""SELECT 'design:'||id,owner_id,created_at,'system_design.design_created','system_design',
              'backend','canonical',NULL::uuid,id::text,NULL::uuid,jsonb_build_object('revision',revision),true
              FROM diagrams WHERE created_at BETWEEN :since AND :until AND (CAST(:user AS uuid) IS NULL OR owner_id=:user)""")
        union = " UNION ALL ".join(parts) or EMPTY
        return f"""WITH raw_facts(id,user_id,at,name,feature,source,evidence,session_id,entity_id,correlation_id,properties,engaged) AS ({union}), facts AS (
          SELECT f.* FROM raw_facts f JOIN profiles p ON p.id=f.user_id AND p.created_at<=:until
          WHERE {self.internal_predicate("f.user_id")}
        )"""

    def internal_predicate(self, column: str) -> str:
        if not self.available["classes"]:
            return "true"
        return f"(NOT :exclude_internal OR NOT EXISTS(SELECT 1 FROM telemetry_private.account_classifications cl WHERE cl.user_id={column}))"

    @staticmethod
    def returning_predicate(alias: str) -> str:
        return f"""EXISTS(SELECT 1 FROM telemetry_private.product_events e
          WHERE e.user_id={alias}.user_id AND e.session_id={alias}.session_id
            AND (e.engaged OR e.feature='navigation'))
          AND EXISTS(SELECT 1 FROM telemetry_private.user_sessions prev
            JOIN telemetry_private.product_events pe ON pe.user_id=prev.user_id AND pe.session_id=prev.session_id
            WHERE prev.user_id={alias}.user_id AND prev.started_at<{alias}.started_at
              AND (pe.engaged OR pe.feature='navigation'))"""

    async def overview(self, days: int, user: UUID | None, exclude: bool) -> Intelligence:
        await self.inspect()
        coverage = self.coverage(days)
        params = {
            "since": coverage.since,
            "until": coverage.until,
            "user": user,
            "exclude_internal": exclude,
        }
        row = (
            (
                await self.session.execute(
                    text(
                        self.facts()
                        + """
          SELECT count(DISTINCT user_id) FILTER(WHERE feature NOT IN ('session','auth','acquisition','diagnostics'))::int active,
            count(DISTINCT user_id) FILTER(WHERE engaged)::int engaged,
            count(DISTINCT user_id) FILTER(WHERE properties->>'error'='true' OR name IN
              ('diagnostics.client_error','diagnostics.api_failed','dsa.local_run_failed','system_design.save_failed'))::int errors,
            count(*) FILTER(WHERE name='dsa.local_run_started')::int local_runs,
            count(*) FILTER(WHERE name='dsa.submit_recorded')::int submits,
            count(DISTINCT (user_id,entity_id)) FILTER(WHERE properties->>'accepted'='true')::int solves,
            count(*) FILTER(WHERE properties->>'accepted'='true')::int accepted,
            count(*) FILTER(WHERE name='dsa.submit_recorded' AND properties->>'official'='true'
              AND properties->>'status'='completed')::int official_finished,
            count(*) FILTER(WHERE name='dsa.run_recorded')::int server_runs,
            count(*) FILTER(WHERE name='ai.run_recorded')::int ai_runs,
            count(*) FILTER(WHERE name='ai.run_recorded' AND properties->>'error'='true')::int ai_errors,
            avg((properties->>'duration_ms')::float) FILTER(WHERE name='ai.run_recorded') ai_latency_ms,
            count(*) FILTER(WHERE name='feed.view')::int impressions,
            count(*) FILTER(WHERE name='feed.open')::int opens,
            count(*) FILTER(WHERE name='feed.save')::int saves,
            count(*) FILTER(WHERE feature='feed' AND engaged AND evidence='canonical_client_action')::int feed_actions,
            count(*) FILTER(WHERE name='feed.ask_reasonai')::int feed_asks,
            count(*) FILTER(WHERE name='system_design.design_created')::int designs,
            count(*) FILTER(WHERE name='dsa.report_recorded')::int reports,
            count(DISTINCT (user_id,entity_id)) FILTER(WHERE name='dsa.problem_opened')::int viewed,
            count(DISTINCT (user_id,entity_id)) FILTER(WHERE name='dsa.submit_recorded')::int attempted,
            count(DISTINCT user_id) FILTER(WHERE source='mobile')::int mobile_users
            ,count(*) FILTER(WHERE evidence='client_reported')::int client_events
          FROM facts
        """
                    ),
                    params,
                )
            )
            .mappings()
            .one()
        )
        metrics: dict[str, Metric] = {}

        def metric(
            key: str, value: Any, source: str, definition: str, client: bool = False
        ) -> None:
            available = self.available.get(source, True)
            if client and source in ("events", "sessions"):
                available = available and row["client_events"] > 0
            metrics[key] = Metric(
                value=value if available else None,
                status=("partial_history" if client else "measured")
                if available
                else "not_tracked",
                source=SOURCES.get(source, source),
                definition=definition,
            )

        for key, value, definition in (
            (
                "recorded_active_users",
                row["active"],
                "Unique accounts with observed or canonical actions in the UTC window; coverage is partial.",
            ),
            (
                "engaged_users",
                row["engaged"],
                "Unique accounts with meaningful actions; passive screen views and impressions excluded.",
            ),
            (
                "error_affected_users",
                row["errors"],
                "Accounts with recorded client errors or canonical AI failures; partial diagnostic coverage.",
            ),
        ):
            metric(key, value, "canonical_and_client", definition)
            metrics[key].status = "partial_history"
        for key, value, source, definition in (
            (
                "server_submits",
                row["submits"],
                "jobs",
                "Persisted jobs with mode=submit, including unsuccessful/queued jobs.",
            ),
            (
                "server_runs",
                row["server_runs"],
                "jobs",
                "Persisted server Run jobs, separate from browser Pyodide runs.",
            ),
            (
                "official_solves",
                row["solves"],
                "jobs",
                "Distinct user/problem pairs with a completed, certified official accepted Submit created in this window.",
            ),
            (
                "official_accepted",
                row["accepted"],
                "jobs",
                "Completed certified official accepted Submits; repeats count as attempts.",
            ),
            (
                "official_acceptance_rate",
                row["accepted"] / row["official_finished"] if row["official_finished"] else None,
                "jobs",
                "Official accepted / completed certified official Submits. Pending and provisional excluded; no denominator is Unknown.",
            ),
            (
                "ai_runs",
                row["ai_runs"],
                "ai",
                "Persisted orchestration runs, not provider calls or tool executions.",
            ),
            (
                "ai_errors",
                row["ai_errors"],
                "ai",
                "Run status failed/error or persisted error code.",
            ),
            (
                "ai_latency_ms",
                row["ai_latency_ms"],
                "ai",
                "Mean completed_at minus started_at for persisted finished runs.",
            ),
            (
                "feed_impressions",
                row["impressions"],
                "feed",
                "Stored VIEW actions; exposure evidence, not reading.",
            ),
            ("feed_opens", row["opens"], "feed", "Stored OPEN actions, not inferred reading."),
            (
                "feed_saves",
                row["saves"],
                "feed",
                "Stored SAVE actions; distinct from currently saved state.",
            ),
            (
                "feed_meaningful_actions",
                row["feed_actions"],
                "feed",
                "Canonical OPEN/SAVE/SHARE/ASK_REASONAI actions, never doubled with navigation events.",
            ),
            (
                "feed_ask_actions",
                row["feed_asks"],
                "feed",
                "Stored Ask ReasonAI invocations; not proof of successful AI response.",
            ),
            (
                "designs_created",
                row["designs"],
                "designs",
                "Persisted Diagram Studio creations; local-only System Design documents are separate.",
            ),
            (
                "code_intelligence_reports",
                row["reports"],
                "reports",
                "Canonical report rows created in window, not report opens or retry calls.",
            ),
            (
                "problems_attempted",
                row["attempted"],
                "jobs",
                "Unique user/problem pairs with a server Submit.",
            ),
        ):
            metric(key, value, source, definition)
        for key, value, definition in (
            (
                "local_runs",
                row["local_runs"],
                "Observed browser Run starts; never counted as official submissions or solves.",
            ),
            (
                "problems_viewed",
                row["viewed"],
                "Distinct observed user/problem opens; history starts with client instrumentation.",
            ),
            (
                "mobile_users",
                row["mobile_users"],
                "Accounts with mobile-reported events; canonical records have unknown platform.",
            ),
        ):
            metric(key, value, "events", definition, True)
        if self.available["events"]:
            client_counts = (
                (
                    await self.session.execute(
                        text(
                            self.facts()
                            + """
              SELECT count(*) FILTER(WHERE name='system_design.editing_started')::int design_sessions,
                count(*) FILTER(WHERE name='system_design.save_succeeded')::int designs_revised,
                count(*) FILTER(WHERE name='system_design.export_requested')::int design_exports,
                count(*) FILTER(WHERE name='collaboration.joined')::int collaboration_sessions,
                coalesce(sum((properties->>'nodes_added')::int) FILTER(WHERE name='system_design.operations_summarized'),0)::int nodes_added,
                coalesce(sum((properties->>'nodes_deleted')::int) FILTER(WHERE name='system_design.operations_summarized'),0)::int nodes_deleted,
                coalesce(sum((properties->>'edges_added')::int) FILTER(WHERE name='system_design.operations_summarized'),0)::int edges_added,
                coalesce(sum((properties->>'edges_removed')::int) FILTER(WHERE name='system_design.operations_summarized'),0)::int edges_removed
              FROM facts
            """
                        ),
                        params,
                    )
                )
                .mappings()
                .one()
            )
            for key, value in client_counts.items():
                metric(
                    key,
                    value,
                    "events",
                    "Observed client transitions, not proof of server persistence or export delivery.",
                    True,
                )
        for key in (
            "billed_cost",
            "estimated_cost",
            "input_tokens",
            "output_tokens",
            "tavily_calls",
            "provider_calls",
            "time_to_first_token",
            "geography",
        ):
            metrics[key] = Metric(
                status="not_tracked",
                source="unavailable",
                definition="No complete canonical measurement; not inferred from run count or content.",
            )
        if self.available["ai_measurements"]:
            measured_ai = (
                (
                    await self.session.execute(
                        text(f"""
              SELECT count(*)::int measured_ai_runs,avg(first_output_ms)::float first_output_ms,
                coalesce(sum((SELECT coalesce(sum((v->>'requested')::int),0) FROM jsonb_each(m.tools) x(k,v))),0)::int tool_calls,
                coalesce(sum((m.tools->'search_web'->>'requested')::int),0)::int search_tool_calls,
                coalesce(sum((SELECT coalesce(sum((v->>'failed')::int),0) FROM jsonb_each(m.tools) x(k,v))),0)::int tool_failures
              FROM telemetry_private.ai_run_measurements m WHERE received_at BETWEEN :since AND :until
                AND (CAST(:user AS uuid) IS NULL OR user_id=:user) AND {self.internal_predicate("m.user_id")}
            """),
                        params,
                    )
                )
                .mappings()
                .one()
            )
            for key, value in measured_ai.items():
                metric(
                    key,
                    value,
                    "ai_measurements",
                    "Server-observed orchestration metadata since rollout. Search tool requests are distinct from billable Tavily HTTP calls; first output is not provider TTFT.",
                    True,
                )
                if key != "measured_ai_runs" and measured_ai["measured_ai_runs"] == 0:
                    metrics[key].value = None
                    metrics[key].status = "not_tracked"
        profile = (
            (
                await self.session.execute(
                    text(f"""
          SELECT count(*)::int registered,count(*) FILTER(WHERE created_at>=:since)::int new_users
          FROM profiles p WHERE created_at<=:until AND (CAST(:user AS uuid) IS NULL OR id=:user) AND {self.internal_predicate("p.id")}
        """),
                    params,
                )
            )
            .mappings()
            .one()
        )
        if self.available["ci_usage"]:
            ci_usage = (
                (
                    await self.session.execute(
                        text(f"""
              SELECT sum(CASE WHEN usage->>'inputTokens' ~ '^[0-9]{{1,12}}$' THEN (usage->>'inputTokens')::bigint END) ci_input_tokens,
                sum(CASE WHEN usage->>'outputTokens' ~ '^[0-9]{{1,12}}$' THEN (usage->>'outputTokens')::bigint END) ci_output_tokens,
                avg(CASE WHEN usage->>'durationMs' ~ '^[0-9]{{1,12}}$' THEN (usage->>'durationMs')::bigint END)::float ci_latency_ms
              FROM dsa_reports_private.reports r WHERE created_at BETWEEN :since AND :until
                AND (CAST(:user AS uuid) IS NULL OR user_id=:user) AND {self.internal_predicate("r.user_id")}
            """),
                        params,
                    )
                )
                .mappings()
                .one()
            )
            for key, value in ci_usage.items():
                metric(
                    key,
                    value,
                    "ci_usage",
                    "Final Code Intelligence report provider measurements only. Excludes unmeasured/failed attempts; not complete AI billing.",
                )
                metrics[key].status = "partial_history"
        metric(
            "registered_users",
            profile["registered"],
            "profiles",
            "Actual profiles within the classification filter; registration is not engagement.",
        )
        metric(
            "new_users",
            profile["new_users"],
            "profiles",
            "Profile creation within the inclusive UTC calendar window.",
        )
        activity_windows = (
            (
                await self.session.execute(
                    text(
                        self.facts()
                        + """
          SELECT count(DISTINCT user_id) FILTER(WHERE at>=:today)::int dau,
            count(DISTINCT user_id) FILTER(WHERE at>=:week)::int wau,
            count(DISTINCT user_id)::int mau FROM facts
          WHERE feature NOT IN ('session','auth','acquisition','diagnostics')
        """
                    ),
                    {
                        **params,
                        "since": datetime.combine(
                            coverage.until.date() - timedelta(days=29), time.min, UTC
                        ),
                        "today": datetime.combine(coverage.until.date(), time.min, UTC),
                        "week": datetime.combine(
                            coverage.until.date() - timedelta(days=6), time.min, UTC
                        ),
                    },
                )
            )
            .mappings()
            .one()
        )
        for key, value in activity_windows.items():
            metric(
                key,
                value,
                "canonical_and_client",
                "Distinct accounts with qualifying actions in 1/7/30 UTC calendar days through as-of. Canonical and client coverage is partial.",
            )
            metrics[key].status = "partial_history"
        activation = await self.session.scalar(
            text(
                self.facts()
                + """
          SELECT count(DISTINCT f.user_id) FROM facts f JOIN profiles p ON p.id=f.user_id
          WHERE p.created_at>=:since AND (f.properties->>'accepted'='true'
            OR (f.name='ai.run_recorded' AND f.properties->>'status'='completed')
            OR f.name IN ('feed.save','system_design.design_created'))
        """
            ),
            params,
        )
        metric(
            "new_user_activation_rate",
            activation / profile["new_users"] if profile["new_users"] else None,
            "canonical_and_client",
            "New profiles with first-value (official acceptance, completed AI run, Feed save, persisted design creation) / new profiles in window. Coverage is partial.",
        )
        metrics["new_user_activation_rate"].status = "partial_history"
        features = (
            (
                await self.session.execute(
                    text(
                        self.facts()
                        + """
          SELECT feature,count(DISTINCT user_id)::int users,
            count(*) FILTER(WHERE evidence<>'authoritative_transition')::int actions,
            count(DISTINCT user_id) FILTER(WHERE engaged)::int engaged_users
          FROM facts WHERE feature NOT IN ('session','auth','acquisition','diagnostics','navigation')
          GROUP BY feature ORDER BY users DESC,feature
        """
                    ),
                    params,
                )
            )
            .mappings()
            .all()
        )
        daily = (
            (
                await self.session.execute(
                    text(
                        self.facts()
                        + """
          SELECT (at AT TIME ZONE 'UTC')::date AS day,count(DISTINCT user_id)::int active,
            count(DISTINCT user_id) FILTER(WHERE engaged)::int engaged
          FROM facts WHERE feature NOT IN ('session','auth','acquisition','diagnostics') GROUP BY 1 ORDER BY 1
        """
                    ),
                    params,
                )
            )
            .mappings()
            .all()
        )
        details: dict[str, Any] = {
            "sources_available": self.available,
            "exclude_classified_internal": exclude,
            "classification": "Unknown",
            "attribution": "Unknown",
        }
        if self.available["sessions"]:
            sessions = (
                (
                    await self.session.execute(
                        text(f"""
              SELECT count(*)::int sessions,count(DISTINCT user_id)::int users,
                coalesce(sum(active_seconds),0)::int active_seconds,
                (SELECT count(DISTINCT cur.user_id) FROM telemetry_private.user_sessions cur
                  WHERE cur.started_at BETWEEN :since AND :until AND (CAST(:user AS uuid) IS NULL OR cur.user_id=:user)
                  AND {self.internal_predicate("cur.user_id")} AND {self.returning_predicate("cur")})::int AS "returning"
              FROM telemetry_private.user_sessions WHERE started_at BETWEEN :since AND :until
                AND (CAST(:user AS uuid) IS NULL OR user_id=:user)
                AND {self.internal_predicate("user_sessions.user_id")}
            """),
                        params,
                    )
                )
                .mappings()
                .one()
            )
            for key, value in sessions.items():
                metric(
                    key,
                    value,
                    "sessions",
                    "Observed foreground sessions. Client-reported active time is bounded by server elapsed time; not authoritative time-to-solve.",
                    True,
                )
        else:
            for key in ("sessions", "returning", "active_seconds"):
                metric(key, None, "sessions", "Session instrumentation unavailable.", True)
        if user:
            exists = await self.session.scalar(
                text("SELECT EXISTS(SELECT 1 FROM profiles WHERE id=:user)"), params
            )
            if not exists:
                raise AppError(
                    error_type="user-not-found",
                    title="User not found",
                    status=404,
                    detail="The requested user was not found.",
                )
            if self.available["acquisition"]:
                details["attribution"] = (
                    await self.session.scalar(
                        text(
                            "SELECT properties FROM telemetry_private.user_acquisition WHERE user_id=:user"
                        ),
                        params,
                    )
                    or "Unknown"
                )
            if self.available["classes"]:
                details["classification"] = (
                    await self.session.scalar(
                        text(
                            "SELECT classification FROM telemetry_private.account_classifications WHERE user_id=:user"
                        ),
                        params,
                    )
                    or "Unknown"
                )
        if user and self.available["jobs"]:
            details["dsa"] = await self.dsa_details(user, coverage)
        if self.available["feed"]:
            details["feed_stories"] = [
                dict(r)
                for r in (
                    await self.session.execute(
                        text(
                            self.facts()
                            + """
              SELECT entity_id story_id,count(DISTINCT user_id)::int users,
                count(*) FILTER(WHERE name='feed.view')::int impressions,
                count(*) FILTER(WHERE name='feed.open')::int opens,
                count(*) FILTER(WHERE name='feed.save')::int saves,
                count(*) FILTER(WHERE name='feed.ask_reasonai')::int asks
              FROM facts WHERE feature='feed' AND evidence='canonical_client_action'
              GROUP BY entity_id ORDER BY count(*) DESC,entity_id LIMIT 20
            """
                        ),
                        params,
                    )
                )
                .mappings()
                .all()
            ]
        if self.available["story_topics"]:
            details["feed_topics"] = [
                dict(r)
                for r in (
                    await self.session.execute(
                        text(
                            self.facts()
                            + """
              SELECT t.topic,count(DISTINCT f.user_id)::int users,count(*)::int meaningful_actions
              FROM facts f JOIN knowledge_story_topics t ON t.story_id::text=f.entity_id
              WHERE f.feature='feed' AND f.engaged AND f.evidence='canonical_client_action'
              GROUP BY t.topic ORDER BY count(*) DESC,t.topic LIMIT 20
            """
                        ),
                        params,
                    )
                )
                .mappings()
                .all()
            ]
        if self.available["ai_measurements"]:
            details["ai_tools"] = [
                dict(r)
                for r in (
                    await self.session.execute(
                        text(f"""
              SELECT tool,sum((v->>'requested')::int)::int requested,
                sum((v->>'completed')::int)::int completed,sum((v->>'failed')::int)::int failed,
                sum((v->>'duration_ms')::int)::int duration_ms
              FROM telemetry_private.ai_run_measurements m CROSS JOIN LATERAL jsonb_each(m.tools) t(tool,v)
              WHERE received_at BETWEEN :since AND :until AND (CAST(:user AS uuid) IS NULL OR user_id=:user)
                AND {self.internal_predicate("m.user_id")}
              GROUP BY tool ORDER BY requested DESC,tool LIMIT 20
            """),
                        params,
                    )
                )
                .mappings()
                .all()
            ]
            details["ai_models"] = [
                dict(r)
                for r in (
                    await self.session.execute(
                        text(f"""
              SELECT model,count(*)::int runs FROM telemetry_private.ai_run_measurements m
              CROSS JOIN LATERAL jsonb_array_elements_text(m.models) t(model)
              WHERE received_at BETWEEN :since AND :until AND (CAST(:user AS uuid) IS NULL OR user_id=:user)
                AND {self.internal_predicate("m.user_id")}
              GROUP BY model ORDER BY runs DESC,model LIMIT 20
            """),
                        params,
                    )
                )
                .mappings()
                .all()
            ]
        return Intelligence(
            coverage=coverage,
            metrics=metrics,
            features=[dict(r) for r in features],
            daily=[dict(r) for r in daily],
            details=details,
        )

    async def dsa_details(self, user: UUID, coverage: Coverage) -> dict[str, Any]:
        rows = (
            (
                await self.session.execute(
                    text("""
          WITH attempts AS (
            SELECT id,request->>'problemId' problem,created_at,status,
              result->>'verdict' verdict,
              nullif(plan->>'certificateId','') IS NOT NULL AND coalesce(plan->>'gradingLevel','official')='official' official,
              row_number() OVER(PARTITION BY request->>'problemId' ORDER BY created_at,id) attempt
            FROM dsa_execution_private.jobs WHERE user_id=:user AND request->>'mode'='submit' AND created_at<=:until
          ), ranked AS (
            SELECT *,sum(official::int) OVER(PARTITION BY problem ORDER BY created_at,id ROWS UNBOUNDED PRECEDING) official_attempt FROM attempts
          ), per_problem AS (
            SELECT problem,count(*)::int attempts,min(created_at) first_attempt,max(created_at) last_attempt,
              min(attempt) FILTER(WHERE status='completed' AND verdict='accepted' AND official)::int first_accepted_attempt,
              (min(attempt) FILTER(WHERE status='completed' AND verdict='accepted' AND official)-1)::int attempts_before_first_official_accept,
              CASE WHEN bool_or(official AND official_attempt=1 AND status='completed')
                THEN bool_or(official AND official_attempt=1 AND status='completed' AND verdict='accepted') END first_official_submit_accepted,
              bool_or(status='completed' AND verdict='accepted' AND official) solved
            FROM ranked GROUP BY problem
          ) SELECT * FROM per_problem WHERE last_attempt>=:since ORDER BY last_attempt DESC,problem LIMIT 100
        """),
                    {"user": user, "since": coverage.since, "until": coverage.until},
                )
            )
            .mappings()
            .all()
        )
        result: dict[str, Any] = {
            "problems": [dict(r) for r in rows],
            "definition": "All historical server Submits for this account, recent problems only, capped at 100. First accepted attempt requires certified official completed acceptance. No local Runs or legacy practice.",
        }
        if self.available["catalog"] and rows:
            metadata = (
                (
                    await self.session.execute(
                        text("""
              SELECT ci.id::text problem,ci.difficulty::text difficulty,coalesce(cv.title,ci.slug) title
              FROM content_items ci LEFT JOIN content_versions cv ON cv.id=ci.current_published_version_id
              WHERE ci.id::text=ANY(CAST(:ids AS text[]))
            """),
                        {"ids": [r["problem"] for r in rows]},
                    )
                )
                .mappings()
                .all()
            )
            by_id = {m["problem"]: dict(m) for m in metadata}
            for problem in result["problems"]:
                problem.update(
                    by_id.get(problem["problem"], {"difficulty": "Unknown", "title": "Unavailable"})
                )
            difficulty: dict[str, dict[str, Any]] = {}
            for problem in result["problems"]:
                group = difficulty.setdefault(
                    problem["difficulty"],
                    {"difficulty": problem["difficulty"], "attempted": 0, "officially_solved": 0},
                )
                group["attempted"] += 1
                group["officially_solved"] += int(problem["solved"])
            result["difficulty_breakdown"] = list(difficulty.values())
            if self.available["topics"]:
                topic_rows = (
                    (
                        await self.session.execute(
                            text("""
                  SELECT DISTINCT ci.id::text problem,t.id,t.name
                  FROM content_items ci JOIN content_version_topics ct ON ct.content_item_id=ci.id
                    AND ct.content_version_id=ci.current_published_version_id
                  JOIN topics t ON t.id=ct.topic_id
                  WHERE ci.id::text=ANY(CAST(:ids AS text[])) ORDER BY t.name,ci.id::text
                """),
                            {"ids": [r["problem"] for r in rows]},
                        )
                    )
                    .mappings()
                    .all()
                )
                outcomes = {r["problem"]: r["solved"] for r in rows}
                topics: dict[str, dict[str, Any]] = {}
                for row in topic_rows:
                    group = topics.setdefault(
                        str(row["id"]),
                        {"topic": row["name"], "attempted": 0, "officially_solved": 0},
                    )
                    group["attempted"] += 1
                    group["officially_solved"] += int(outcomes[row["problem"]])
                result["topic_breakdown"] = list(topics.values())
        return result

    async def timeline(self, user: UUID, days: int, limit: int, cursor: str | None) -> Timeline:
        await self.inspect()
        coverage = self.coverage(days)
        before, before_id = coverage.until, "~"
        if cursor:
            try:
                value = json.loads(base64.urlsafe_b64decode(cursor.encode()))
                before = datetime.fromisoformat(value["at"])
                before_id = value["id"]
                if before.tzinfo is None or not isinstance(before_id, str) or len(before_id) > 100:
                    raise ValueError("invalid cursor")
            except (ValueError, KeyError, TypeError) as exc:
                raise AppError(
                    error_type="invalid-cursor",
                    title="Invalid cursor",
                    status=422,
                    detail="Use the opaque next_cursor returned by the previous page.",
                ) from exc
        rows = (
            (
                await self.session.execute(
                    text(
                        self.facts()
                        + """
          SELECT * FROM facts WHERE (at,id)<(:before,:before_id) ORDER BY at DESC,id DESC LIMIT :limit
        """
                    ),
                    {
                        "user": user,
                        "since": coverage.since,
                        "until": coverage.until,
                        "exclude_internal": False,
                        "before": before,
                        "before_id": before_id,
                        "limit": limit + 1,
                    },
                )
            )
            .mappings()
            .all()
        )
        next_cursor = None
        if len(rows) > limit:
            last = rows[limit - 1]
            next_cursor = base64.urlsafe_b64encode(
                json.dumps({"at": last["at"].isoformat(), "id": last["id"]}).encode()
            ).decode()
        return Timeline(
            coverage=coverage, items=[dict(r) for r in rows[:limit]], next_cursor=next_cursor
        )

    async def sessions(self, user: UUID, days: int, limit: int, offset: int) -> dict[str, Any]:
        await self.inspect()
        coverage = self.coverage(days)
        rows: Any = []
        if self.available["sessions"]:
            rows = (
                (
                    await self.session.execute(
                        text("""
              SELECT session_id,source,started_at,last_received_at,ended_at,active_seconds,
                event_count,app_version,build_version,os_family,
                CASE WHEN ended_at IS NOT NULL THEN 'ended'
                  WHEN last_received_at<:until-interval '30 minutes' THEN 'timed_out' ELSE 'open' END status
              FROM telemetry_private.user_sessions WHERE user_id=:user AND started_at BETWEEN :since AND :until
              ORDER BY started_at DESC,session_id DESC LIMIT :limit OFFSET :offset
            """),
                        {
                            "user": user,
                            "since": coverage.since,
                            "until": coverage.until,
                            "limit": limit,
                            "offset": offset,
                        },
                    )
                )
                .mappings()
                .all()
            )
        return {
            "coverage": coverage.model_dump(mode="json"),
            "items": [dict(r) for r in rows],
            "status": "partial_history" if self.available["sessions"] else "not_tracked",
        }

    async def health(self, days: int) -> dict[str, Any]:
        await self.inspect()
        coverage = self.coverage(days)
        result: dict[str, Any] = {
            "coverage": coverage.model_dump(mode="json"),
            "installed": self.available["events"],
            "aggregation": "Live bounded queries; no asynchronous aggregation job",
            "queue_lag": "Not applicable",
            "last_aggregation_completed": "Not applicable",
            "generated_at": coverage.generated_at,
            "schema_version": 1,
            "rejected_scope": "Handler failures; authentication and pre-auth oversized bodies are logged separately.",
            "sources": self.available,
            "versions": [],
            "features": [],
        }
        if self.available["events"]:
            result.update(
                dict(
                    (
                        await self.session.execute(
                            text("""
              SELECT max(last_received_at) last_event_received,coalesce(sum(accepted),0) accepted,
                coalesce(sum(duplicates),0) duplicates,coalesce(sum(delayed),0) delayed,
                coalesce(sum(rejected),0) rejected,coalesce(sum(failed),0) failed,coalesce(sum(journal_failures),0) journal_failures,coalesce(sum(invalid_clocks),0) invalid_clocks FROM telemetry_private.ingestion_health
              WHERE day>=:since
            """),
                            {"since": coverage.since.date()},
                        )
                    )
                    .mappings()
                    .one()
                )
            )
            result["versions"] = [
                dict(r)
                for r in (
                    await self.session.execute(
                        text("""
              SELECT e.source,coalesce(s.app_version,'unknown') version,count(*)::int events,
                max(e.received_at) last_received_at
              FROM telemetry_private.product_events e LEFT JOIN telemetry_private.user_sessions s
                ON s.user_id=e.user_id AND s.session_id=e.session_id
              WHERE e.received_at BETWEEN :since AND :until
              GROUP BY e.source,s.app_version ORDER BY events DESC LIMIT 100
            """),
                        {"since": coverage.since, "until": coverage.until},
                    )
                )
                .mappings()
                .all()
            ]
            result["features"] = [
                dict(r)
                for r in (
                    await self.session.execute(
                        text("""
              SELECT feature,count(*)::int events,max(received_at) last_received_at
              FROM telemetry_private.product_events WHERE received_at BETWEEN :since AND :until
              GROUP BY feature ORDER BY events DESC LIMIT 100
            """),
                        {"since": coverage.since, "until": coverage.until},
                    )
                )
                .mappings()
                .all()
            ]
            result["client_delivery"] = dict(
                (
                    await self.session.execute(
                        text("""
              SELECT sum((properties->>'count')::int) client_reported_drops,
                sum((properties->>'retry_count')::int) client_reported_retries
              FROM telemetry_private.product_events WHERE event_name='diagnostics.delivery'
                AND received_at BETWEEN :since AND :until
            """),
                        {"since": coverage.since, "until": coverage.until},
                    )
                )
                .mappings()
                .one()
            )
        return result

    async def users(
        self, days: int, search: str, segment: str, exclude: bool, limit: int, offset: int
    ) -> dict[str, Any]:
        await self.inspect()
        coverage = self.coverage(days)
        session_sql = "NULL::int sessions,false returning_user"
        session_join = ""
        if self.available["sessions"]:
            session_sql = "coalesce(s.sessions,0)::int sessions,coalesce(s.returning_user,false) returning_user"
            session_join = f"""LEFT JOIN (SELECT cur.user_id,count(*) sessions,
              bool_or({self.returning_predicate("cur")}) returning_user FROM telemetry_private.user_sessions cur
              WHERE cur.started_at BETWEEN :since AND :until GROUP BY cur.user_id) s ON s.user_id=p.id"""
        class_sql = "'Unknown'::text classification"
        class_join = ""
        if self.available["classes"]:
            class_sql = "coalesce(c.classification,'Unknown') classification"
            class_join = "LEFT JOIN telemetry_private.account_classifications c ON c.user_id=p.id"
        acquisition_sql = "'Unknown'::text signup_source"
        acquisition_join = ""
        if self.available["acquisition"]:
            acquisition_sql = "coalesce(a.properties->>'utm_source',a.properties->>'referrer_host','Unknown') signup_source"
            acquisition_join = "LEFT JOIN telemetry_private.user_acquisition a ON a.user_id=p.id"
        conditions = {
            "all": "true",
            "new": "created_at>=:since",
            "active": "last_activity IS NOT NULL",
            "engaged": "engaged",
            "returning": "returning_user",
            "unobserved": "last_activity IS NULL",
            "dsa": "'dsa'=ANY(features)",
            "feed": "'feed'=ANY(features)",
            "ai": "'ai'=ANY(features)",
            "system_design": "'system_design'=ANY(features)",
            "mobile": "mobile",
            "internal": "classification<>'Unknown'",
        }
        condition = conditions[segment]
        result = (
            (
                await self.session.execute(
                    text(
                        self.facts()
                        + f""",
          usage AS (SELECT user_id,max(at) last_activity,count(DISTINCT (at AT TIME ZONE 'UTC')::date)::int active_days,
            bool_or(engaged) engaged,array_agg(DISTINCT feature) features,bool_or(source='mobile') mobile,
            (array_agg(feature ORDER BY at DESC,id DESC))[1] last_feature,
            CASE WHEN (array_agg(source ORDER BY at DESC,id DESC))[1] IN ('web','mobile') THEN (array_agg(source ORDER BY at DESC,id DESC))[1] END last_platform,
            count(DISTINCT entity_id) FILTER(WHERE properties->>'accepted'='true')::int official_solves,
            count(*) FILTER(WHERE name='ai.run_recorded')::int ai_runs,
            count(*) FILTER(WHERE feature='feed' AND engaged AND evidence='canonical_client_action')::int feed_actions,
            count(*) FILTER(WHERE feature='system_design' AND engaged)::int design_actions
            FROM facts WHERE feature NOT IN ('session','auth','acquisition','diagnostics') GROUP BY user_id), records AS (
              SELECT p.id user_id,p.display_name name,p.email,p.created_at,u.last_activity,u.active_days,
                u.engaged,u.features,u.mobile,u.last_feature,u.last_platform,
                {"coalesce(u.official_solves,0)" if self.available["jobs"] else "NULL::int"} official_solves,{"coalesce(u.ai_runs,0)" if self.available["ai"] else "NULL::int"} ai_runs,{"coalesce(u.feed_actions,0)" if self.available["feed"] else "NULL::int"} feed_actions,{"coalesce(u.design_actions,0)" if self.available["events"] else "NULL::int"} design_actions,
                {session_sql},{class_sql},{acquisition_sql}
              FROM profiles p LEFT JOIN usage u ON u.user_id=p.id {session_join} {class_join} {acquisition_join}
              WHERE p.created_at<=:until
            ), filtered AS (SELECT * FROM records WHERE ({condition})
              AND (NOT :exclude_internal OR classification='Unknown')
              AND (coalesce(name,'') ILIKE :search ESCAPE '\\' OR coalesce(email,'') ILIKE :search ESCAPE '\\'))
          SELECT (SELECT count(*) FROM filtered)::int total,
            coalesce((SELECT jsonb_agg(x) FROM (SELECT * FROM filtered
              ORDER BY last_activity DESC NULLS LAST,created_at DESC,user_id LIMIT :limit OFFSET :offset)x),'[]') items
        """
                    ),
                    {
                        "since": coverage.since,
                        "until": coverage.until,
                        "user": None,
                        "exclude_internal": exclude,
                        "search": "%"
                        + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                        + "%",
                        "limit": limit,
                        "offset": offset,
                    },
                )
            )
            .mappings()
            .one()
        )
        return {"coverage": coverage.model_dump(mode="json"), **dict(result)}

    async def funnels(
        self, days: int, user: UUID | None = None, exclude: bool = False
    ) -> dict[str, Any]:
        await self.inspect()
        coverage = self.coverage(days)
        # Only observed journey IDs may establish cross-step conversion. Canonical
        # totals are displayed separately; unrelated historical actions are not a funnel.
        result: dict[str, Any] = {
            "coverage": coverage.model_dump(mode="json"),
            "items": [],
            "definition": "Same authenticated user/journey, ordered steps within 24 hours. DSA Run-to-Submit also requires the same recorded problem. Client evidence only; official outcomes remain canonical.",
        }
        params = {
            "since": coverage.since,
            "until": coverage.until,
            "user": user,
            "exclude_internal": exclude,
        }
        # These are bounded observations, not inferred lifetime behavior. In
        # particular, an earlier unobserved action cannot become a first action.
        summary = (
            (
                await self.session.execute(
                    text(
                        self.facts()
                        + """
          , first_actions AS (
            SELECT f.user_id,min(f.at) first_at FROM facts f JOIN profiles p ON p.id=f.user_id
            WHERE f.engaged AND p.created_at>=:since AND f.at>=p.created_at
              AND f.evidence<>'authoritative_transition' GROUP BY f.user_id
          ) SELECT count(*)::int observed_new_users,
            avg(extract(epoch FROM a.first_at-p.created_at))::float first_meaningful_seconds
          FROM first_actions a JOIN profiles p ON p.id=a.user_id
        """
                    ),
                    params,
                )
            )
            .mappings()
            .one()
        )
        result["first_action"] = [
            {
                **dict(summary),
                "definition": "New profiles with meaningful evidence in this window; mean seconds from signup to first observed action. Partial history, not proof of lifetime first action.",
            }
        ]
        if self.available["jobs"]:
            conversion = (
                (
                    await self.session.execute(
                        text(
                            self.facts()
                            + """
              SELECT count(*)::int submitted,
                count(*) FILTER(WHERE properties->>'official'='true' AND properties->>'status'='completed')::int official_decided,
                count(*) FILTER(WHERE properties->>'accepted'='true')::int accepted
              FROM facts WHERE name='dsa.submit_recorded'
            """
                        ),
                        params,
                    )
                )
                .mappings()
                .one()
            )
            result["official_conversion"] = [
                {
                    **dict(conversion),
                    "acceptance_rate": conversion["accepted"] / conversion["official_decided"]
                    if conversion["official_decided"]
                    else None,
                    "definition": "Canonical Submit records created in window; accepted / completed official Submits. Pending and provisional attempts remain separate.",
                }
            ]
        if not self.available["events"]:
            result["status"] = "not_tracked"
            return result
        navigation = (
            (
                await self.session.execute(
                    text(f"""
          WITH visits AS (
            SELECT user_id,session_id,effective_at,event_id,properties->>'feature' feature,
              lag(properties->>'feature') OVER(PARTITION BY user_id,session_id ORDER BY effective_at,event_id) previous
            FROM telemetry_private.product_events
            WHERE event_name='navigation.feature_entered' AND clock_quality='plausible'
              AND properties->>'feature' IN ('dsa','feed','ai','system_design','collaboration')
              AND effective_at BETWEEN :since AND :until
              AND (CAST(:user AS uuid) IS NULL OR user_id=:user)
              AND {self.internal_predicate("product_events.user_id")}
          ), revisits AS (
            SELECT feature,user_id,count(DISTINCT session_id) sessions FROM visits GROUP BY feature,user_id
          ) SELECT 'transition' kind,previous from_feature,feature to_feature,count(*)::int observations,
              count(DISTINCT user_id)::int users,NULL::int revisiting_users,NULL::float revisit_rate
            FROM visits WHERE previous IS NOT NULL AND previous<>feature GROUP BY previous,feature
          UNION ALL SELECT 'revisit',NULL,feature,sum(sessions)::int,count(*)::int,
              count(*) FILTER(WHERE sessions>1)::int,
              (count(*) FILTER(WHERE sessions>1))::float/nullif(count(*),0)
            FROM revisits GROUP BY feature ORDER BY kind,to_feature,from_feature LIMIT 64
        """),
                    params,
                )
            )
            .mappings()
            .all()
        )
        result["feature_journeys"] = [dict(row) for row in navigation]
        result["journey_definition"] = (
            "Transitions are consecutive recorded feature entries within one session. Revisit means the same feature in multiple observed sessions in the window. Missing or invalid-clock navigation is excluded."
        )
        if self.available["sessions"]:
            engagement = (
                (
                    await self.session.execute(
                        text(f"""
              WITH observed AS (
                SELECT s.user_id,s.session_id,{self.returning_predicate("s")} is_returning
                FROM telemetry_private.user_sessions s WHERE s.started_at BETWEEN :since AND :until
                  AND (CAST(:user AS uuid) IS NULL OR s.user_id=:user)
                  AND {self.internal_predicate("s.user_id")}
                  AND EXISTS(SELECT 1 FROM telemetry_private.product_events e
                    WHERE e.user_id=s.user_id AND e.session_id=s.session_id AND e.engaged)
              ), accounts AS (SELECT user_id,bool_or(is_returning) is_returning,count(*) sessions FROM observed GROUP BY user_id)
              SELECT CASE WHEN is_returning THEN 'returning' ELSE 'first_observed' END segment,
                count(*)::int engaged_users,sum(sessions)::int engaged_sessions,
                avg(sessions)::float sessions_per_engaged_user FROM accounts GROUP BY is_returning ORDER BY is_returning
            """),
                        params,
                    )
                )
                .mappings()
                .all()
            )
            result["engagement"] = [dict(row) for row in engagement]
            result["engagement_definition"] = (
                "Accounts with meaningful observed sessions; returning requires an earlier qualifying session, including before this window. First observed does not imply first lifetime visit."
            )
        rows = (
            (
                await self.session.execute(
                    text(f"""
          WITH starts AS (
            SELECT user_id,journey_id,entity_id,event_name,min(effective_at) at
            FROM telemetry_private.product_events WHERE journey_id IS NOT NULL
              AND {self.internal_predicate("product_events.user_id")}
              AND effective_at BETWEEN :since AND :until AND (CAST(:user AS uuid) IS NULL OR user_id=:user)
              AND event_name IN ('dsa.local_run_started','feed.opened','system_design.editing_started')
            GROUP BY user_id,journey_id,entity_id,event_name
          ) SELECT s.event_name step,count(*)::int journeys,count(*) FILTER(WHERE EXISTS(
            SELECT 1 FROM telemetry_private.product_events e WHERE e.user_id=s.user_id AND e.journey_id=s.journey_id
              AND (s.event_name<>'dsa.local_run_started' OR (s.entity_id IS NOT NULL AND e.entity_id=s.entity_id))
              AND e.effective_at BETWEEN s.at AND least(s.at+interval '24 hours',:until)
              AND e.event_name=CASE s.event_name WHEN 'dsa.local_run_started' THEN 'dsa.submit_initiated'
                WHEN 'feed.opened' THEN 'feed.ask_invoked' ELSE 'system_design.save_succeeded' END
          ))::int converted FROM starts s GROUP BY s.event_name
        """),
                    params,
                )
            )
            .mappings()
            .all()
        )
        result.update(items=[dict(r) for r in rows], status="partial_history")
        return result

    async def cohorts(self, days: int, exclude: bool = False) -> dict[str, Any]:
        await self.inspect()
        coverage = self.coverage(days)
        result: dict[str, Any] = {
            "coverage": coverage.model_dump(mode="json"),
            "items": [],
            "definition": "D1/D7/D30 = at least one meaningful observed event on exactly that UTC day after signup; only signups after instrumentation began with an observed initial session, mature UTC days. Partial client coverage.",
        }
        if not self.installed_at:
            result["status"] = "not_tracked"
            return result
        rows = (
            (
                await self.session.execute(
                    text(f"""
          SELECT (p.created_at AT TIME ZONE 'UTC')::date cohort,d.day,
            count(*)::int eligible,count(*) FILTER(WHERE EXISTS(
              SELECT 1 FROM telemetry_private.product_events e WHERE e.user_id=p.id AND e.engaged
              AND (e.effective_at AT TIME ZONE 'UTC')::date=(p.created_at AT TIME ZONE 'UTC')::date+d.day
              AND e.clock_quality='plausible'
            ))::int retained
          FROM profiles p CROSS JOIN (VALUES(1),(7),(30)) d(day)
          WHERE p.created_at>=greatest(:since,:installed) AND p.created_at<=:until
            AND {self.internal_predicate("p.id")}
            AND EXISTS(SELECT 1 FROM telemetry_private.product_events baseline
              WHERE baseline.user_id=p.id AND baseline.event_name='session.started'
                AND baseline.clock_quality='plausible'
                AND baseline.effective_at BETWEEN p.created_at AND least(p.created_at+interval '1 day',:until))
            AND (p.created_at AT TIME ZONE 'UTC')::date+d.day<(:until AT TIME ZONE 'UTC')::date
          GROUP BY 1,2 ORDER BY 1,2 LIMIT 270
        """),
                    {
                        "since": coverage.since,
                        "until": coverage.until,
                        "installed": self.installed_at,
                        "exclude_internal": exclude,
                    },
                )
            )
            .mappings()
            .all()
        )
        result.update(items=[dict(r) for r in rows], status="partial_history")
        return result
