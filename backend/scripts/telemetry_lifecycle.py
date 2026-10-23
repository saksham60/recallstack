"""Read-only reconciliation by default; bounded retention cleanup only with --apply.

Never reads .env automatically. Supply TELEMETRY_DATABASE_URL explicitly.
Remote mutations are deliberately refused by this local preparation tool.
Canonical records are projected live, so backfill needs no duplicate event inserts.
"""

# Identifiers are from the fixed retention allowlist, never CLI input.
# ruff: noqa: S608, E501
import argparse
import json
import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

TABLES = {
    "dsa_job_transitions": ("id", "occurred_at", "events_days"),
    "deleted_story_actions": ("id", "occurred_at", "events_days"),
    "ai_run_measurements": ("run_id", "received_at", "events_days"),
    "product_events": ("event_id", "received_at", "events_days"),
    "user_sessions": ("session_id", "last_received_at", "sessions_days"),
    "ingestion_quotas": ("user_id", "minute", "quota_days"),
    "ingestion_health": ("day", "day", "aggregate_days"),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--events-days", type=int, default=90)
    parser.add_argument("--sessions-days", type=int, default=30)
    parser.add_argument("--aggregate-days", type=int, default=730)
    parser.add_argument("--quota-days", type=int, default=2)
    args = parser.parse_args()
    for key in ("events_days", "sessions_days", "aggregate_days", "quota_days"):
        if not 1 <= getattr(args, key) <= 1095:
            parser.error("Retention must be 1..1095 days")
    url = make_url(os.environ["TELEMETRY_DATABASE_URL"])
    if args.apply and url.host not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("Remote mutation requires a separately reviewed production runbook")
    engine = create_engine(url)
    report = {
        "mode": "local_cleanup" if args.apply else "dry_run",
        "at": datetime.now(UTC).isoformat(),
        "reconstruction": "Live canonical projection; zero synthetic navigation/session events.",
        "retention": {},
        "canonical_counts": {},
    }
    with engine.begin() as connection:
        if not args.apply:
            connection.execute(text("SET TRANSACTION READ ONLY"))
        for name, (_, clock, setting) in TABLES.items():
            cutoff = datetime.now(UTC) - timedelta(days=getattr(args, setting))
            if name == "ingestion_health":
                cutoff = cutoff.date()
            if connection.scalar(
                text("SELECT to_regclass(:name)"), {"name": f"telemetry_private.{name}"}
            ):
                count = connection.scalar(
                    text(f"SELECT count(*) FROM telemetry_private.{name} WHERE {clock}<:cutoff"),
                    {"cutoff": cutoff},
                )
                deleted = 0
                if args.apply:
                    result = connection.execute(
                        text(
                            f"DELETE FROM telemetry_private.{name} WHERE ctid IN "
                            f"(SELECT ctid FROM telemetry_private.{name} WHERE {clock}<:cutoff LIMIT 10000)"
                        ),
                        {"cutoff": cutoff},
                    )
                    deleted = result.rowcount
                report["retention"][name] = {"eligible": count, "deleted": deleted}
            else:
                report["retention"][name] = {"status": "not_installed"}
        for name in (
            "profiles",
            "dsa_execution_private.jobs",
            "reasonai_runs",
            "user_story_events",
            "dsa_code_intelligence_reports",
            "diagrams",
        ):
            if connection.scalar(text("SELECT to_regclass(:name)"), {"name": name}):
                report["canonical_counts"][name] = connection.scalar(
                    text(f"SELECT count(*) FROM {name}")
                )
    engine.dispose()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
