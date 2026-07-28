from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy import Connection, create_engine, text

from recallstack.modules.admin.application.analytics import AdminAnalyticsService
from recallstack.modules.admin.infrastructure.analytics_repository import (
    SqlAlchemyAdminAnalyticsRepository,
)
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from tests.integration.test_published_study_note_repository import add_content

pytestmark = pytest.mark.integration


def _add_user(
    connection: Connection, *, user_id: UUID, name: str, email: str, created_at: datetime
) -> None:
    connection.execute(
        text("INSERT INTO auth.users (id,email) VALUES (:id,:email)"),
        {"id": user_id, "email": email},
    )
    connection.execute(
        text(
            "INSERT INTO profiles (id,display_name,created_at,updated_at) "
            "VALUES (:id,:name,:created_at,:created_at)"
        ),
        {"id": user_id, "name": name, "created_at": created_at},
    )


def _add_catalog(connection: Connection) -> tuple[UUID, UUID, int]:
    domain_id, category_id = uuid4(), uuid4()
    connection.execute(
        text("INSERT INTO domains (id,slug,name) VALUES (:id,:slug,'Admin analytics')"),
        {"id": domain_id, "slug": f"admin-analytics-{domain_id.hex[:8]}"},
    )
    connection.execute(
        text(
            "INSERT INTO categories (id,domain_id,slug,name) VALUES (:id,:domain,'arrays','Arrays')"
        ),
        {"id": category_id, "domain": domain_id},
    )
    provider_id = connection.execute(
        text(
            "INSERT INTO practice_providers (slug,name) VALUES (:slug,'Admin analytics') "
            "RETURNING id"
        ),
        {"slug": f"admin-analytics-{uuid4().hex[:8]}"},
    ).scalar_one()
    return domain_id, category_id, provider_id


async def test_admin_problem_aggregates_deduplicate_reattempts_and_rank_first_attempt(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    user_id, incomplete_user_id, domain_id, category_id = uuid4(), uuid4(), uuid4(), uuid4()
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": user_id})
        connection.execute(
            text("INSERT INTO profiles (id, display_name, email) VALUES (:id, 'Analyst', :email)"),
            {"id": user_id, "email": f"{user_id}@example.test"},
        )
        connection.execute(
            text("INSERT INTO auth.users (id,email) VALUES (:id,:email)"),
            {"id": incomplete_user_id, "email": f"{incomplete_user_id}@example.test"},
        )
        connection.execute(
            text("INSERT INTO profiles (id,display_name) VALUES (:id,'Incomplete')"),
            {"id": incomplete_user_id},
        )
        connection.execute(
            text("INSERT INTO domains (id, slug, name) VALUES (:id, :slug, 'Analytics')"),
            {"id": domain_id, "slug": f"analytics-{domain_id.hex[:8]}"},
        )
        connection.execute(
            text(
                "INSERT INTO categories (id, domain_id, slug, name) "
                "VALUES (:id, :domain, 'arrays', 'Arrays')"
            ),
            {"id": category_id, "domain": domain_id},
        )
        problem_id, version_id = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"analytics-problem-{uuid4().hex[:8]}",
            title="Analytics Problem",
        )
        topic_id = uuid4()
        connection.execute(
            text(
                "INSERT INTO topics (id,domain_id,slug,name) "
                "VALUES (:id,:domain,:slug,'Analytics topic')"
            ),
            {
                "id": topic_id,
                "domain": domain_id,
                "slug": f"analytics-topic-{topic_id.hex[:8]}",
            },
        )
        connection.execute(
            text(
                "INSERT INTO content_version_topics "
                "(content_version_id,content_item_id,domain_id,topic_id,is_primary) "
                "VALUES (:version,:item,:domain,:topic,true)"
            ),
            {
                "version": version_id,
                "item": problem_id,
                "domain": domain_id,
                "topic": topic_id,
            },
        )
        provider_id = connection.execute(
            text(
                "INSERT INTO practice_providers (slug, name) VALUES (:slug, 'Analytics Provider') "
                "RETURNING id"
            ),
            {"slug": f"analytics-{uuid4().hex[:8]}"},
        ).scalar_one()

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    try:
        async with database.session_factory.create_session() as session:
            repository = SqlAlchemyAdminAnalyticsRepository(session)
            before = await repository.overview()

        attempted_at = datetime.now(UTC)
        with engine.begin() as connection:
            for index, outcome in enumerate(
                ("solved_with_hint", "solved_independently", "solved_independently")
            ):
                connection.execute(
                    text(
                        "INSERT INTO practice_attempts "
                        "(attempt_event_id,user_id,content_item_id,provider_id,outcome,"
                        "hint_used,attempted_at) "
                        "VALUES (:event,:user,:problem,:provider,"
                        "CAST(:outcome AS practice_outcome),false,:attempted_at)"
                    ),
                    {
                        "event": uuid4(),
                        "user": user_id,
                        "problem": problem_id,
                        "provider": provider_id,
                        "outcome": outcome,
                        "attempted_at": attempted_at + timedelta(minutes=index),
                    },
                )
            connection.execute(
                text(
                    "INSERT INTO practice_attempts "
                    "(attempt_event_id,user_id,content_item_id,provider_id,outcome,"
                    "hint_used,attempted_at) VALUES "
                    "(:event,:user,:problem,:provider,'skipped',false,:attempted_at)"
                ),
                {
                    "event": uuid4(),
                    "user": incomplete_user_id,
                    "problem": problem_id,
                    "provider": provider_id,
                    "attempted_at": attempted_at + timedelta(seconds=30),
                },
            )

        async with database.session_factory.create_session() as session:
            repository = SqlAlchemyAdminAnalyticsRepository(session)
            after = await repository.overview()
            detail = await repository.problem_detail(problem_id)
            filtered_total, filtered = await repository.list_problems(
                filters={
                    "search": "analytics PROBLEM",
                    "topic_id": topic_id,
                    "difficulty": "easy",
                    "publication_status": "published",
                },
                offset=0,
                limit=1,
                sort_by="attempts",
                descending=True,
            )
            for sort_by in (
                "attempts",
                "unique_users_attempted",
                "unique_users_completed",
                "solve_rate",
                "first_attempt_success_rate",
                "title",
                "created_at",
            ):
                sorted_total, sorted_items = await repository.list_problems(
                    filters={
                        "search": "analytics PROBLEM",
                        "topic_id": None,
                        "difficulty": None,
                        "publication_status": None,
                    },
                    offset=0,
                    limit=25,
                    sort_by=sort_by,
                    descending=False,
                )
                assert sorted_total == 1
                assert sorted_items[0]["problem_id"] == problem_id

        assert after["problems"]["total_attempts"] - before["problems"]["total_attempts"] == 4
        assert after["problems"]["accepted_attempts"] - before["problems"]["accepted_attempts"] == 2
        assert (
            after["problems"]["unique_user_problem_attempts"]
            - before["problems"]["unique_user_problem_attempts"]
            == 2
        )
        assert (
            after["problems"]["unique_user_problem_completions"]
            - before["problems"]["unique_user_problem_completions"]
            == 1
        )
        assert detail is not None
        assert detail["analytics"]["unique_users_attempted"] == 2
        assert detail["analytics"]["unique_users_completed"] == 1
        assert detail["analytics"]["solve_rate"] == 0.5
        assert detail["analytics"]["first_attempt_success_rate"] == 0.0
        assert detail["analytics"]["average_attempts_before_completion"] == 2.0
        assert detail["analytics"]["average_solve_time_seconds"] is None
        assert detail["analytics"]["hint_usage_count"] is None
        assert len(detail["recent_attempts"]) == 4
        assert [item["attempted_at"] for item in detail["recent_attempts"]] == sorted(
            (item["attempted_at"] for item in detail["recent_attempts"]), reverse=True
        )
        assert filtered_total == 1
        assert filtered[0]["problem_id"] == problem_id
        assert "source_code" not in str(detail).lower()
    finally:
        await database.close()
        engine.dispose()


async def test_activity_union_returns_attempt_revision_and_signup_in_timestamp_order(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    user_id = uuid4()
    base = datetime(2026, 7, 20, 10, tzinfo=UTC)
    with engine.begin() as connection:
        _add_user(
            connection,
            user_id=user_id,
            name="Activity User",
            email="activity@example.test",
            created_at=base,
        )
        domain_id, category_id, provider_id = _add_catalog(connection)
        problem_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"activity-{uuid4().hex[:8]}",
            title="Activity problem",
        )
        connection.execute(
            text(
                "INSERT INTO practice_attempts "
                "(attempt_event_id,user_id,content_item_id,provider_id,outcome,hint_used,"
                "attempted_at) VALUES "
                "(:event,:user,:problem,:provider,'solved_with_hint',true,:at)"
            ),
            {
                "event": uuid4(),
                "user": user_id,
                "problem": problem_id,
                "provider": provider_id,
                "at": base + timedelta(hours=1),
            },
        )
        card_id = uuid4()
        connection.execute(
            text(
                "INSERT INTO review_cards (id,user_id,content_item_id,due_at) "
                "VALUES (:id,:user,:problem,:due)"
            ),
            {
                "id": card_id,
                "user": user_id,
                "problem": problem_id,
                "due": base + timedelta(hours=2),
            },
        )
        connection.execute(
            text(
                "INSERT INTO review_history "
                "(review_event_id,review_card_id,user_id,rating,reviewed_at,next_due_at,"
                "scheduler_name,scheduler_version) VALUES "
                "(:event,:card,:user,'good',:at,:next_due,'simple','1')"
            ),
            {
                "event": uuid4(),
                "card": card_id,
                "user": user_id,
                "at": base + timedelta(hours=2),
                "next_due": base + timedelta(days=1),
            },
        )

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    try:
        async with database.session_factory.create_session() as session:
            repository = SqlAlchemyAdminAnalyticsRepository(session)
            result = await repository.activity(
                user_id,
                activity_type=None,
                from_date=None,
                to_date=None,
                offset=0,
                limit=25,
            )
            revision_only = await repository.activity(
                user_id,
                activity_type="revision_completed",
                from_date=None,
                to_date=None,
                offset=0,
                limit=25,
            )
            date_filtered = await repository.activity(
                user_id,
                activity_type=None,
                from_date=base + timedelta(minutes=90),
                to_date=base + timedelta(hours=3),
                offset=0,
                limit=25,
            )
            second_page = await repository.activity(
                user_id,
                activity_type=None,
                from_date=None,
                to_date=None,
                offset=1,
                limit=1,
            )
            missing = await repository.activity(
                uuid4(),
                activity_type=None,
                from_date=None,
                to_date=None,
                offset=0,
                limit=25,
            )
            detail = await repository.user_detail(user_id)
        assert result is not None
        total, items = result
        assert total == 3
        assert [item["activity_type"] for item in items] == [
            "revision_completed",
            "problem_attempted",
            "user_signed_up",
        ]
        assert [item["occurred_at"] for item in items] == sorted(
            (item["occurred_at"] for item in items), reverse=True
        )
        assert items[0]["metadata"]["status"] == "good"
        assert items[1]["metadata"]["status"] == "solved_with_hint"
        assert isinstance(items[1]["metadata"]["status"], str)
        assert items[1]["problem"]["problem_id"] == problem_id
        assert items[2]["problem"] is None
        assert revision_only is not None
        assert revision_only[0] == 1
        assert revision_only[1][0]["activity_type"] == "revision_completed"
        assert date_filtered is not None
        assert [item["activity_type"] for item in date_filtered[1]] == ["revision_completed"]
        assert second_page is not None
        assert second_page[0] == 3
        assert second_page[1][0]["activity_type"] == "problem_attempted"
        assert missing is None
        assert detail is not None
        assert detail["revision_summary"]["available"] is True
        assert detail["revision_summary"]["total_revision_items"] == 1
        assert detail["revision_summary"]["completed_revisions"] == 1
        assert detail["revision_summary"]["last_revision_at"] == base + timedelta(hours=2)
    finally:
        await database.close()
        engine.dispose()


async def test_user_detail_difficulty_breakdown_has_all_values_and_unique_totals(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    user_id = uuid4()
    base = datetime(2026, 7, 21, 10, tzinfo=UTC)
    with engine.begin() as connection:
        _add_user(
            connection,
            user_id=user_id,
            name="Difficulty User",
            email="difficulty@example.test",
            created_at=base,
        )
        domain_id, category_id, provider_id = _add_catalog(connection)
        problems: dict[str, UUID] = {}
        versions: dict[str, UUID] = {}
        for difficulty in ("beginner", "easy", "medium", "hard", "expert"):
            problem_id, version_id = add_content(
                connection,
                domain_id=domain_id,
                category_id=category_id,
                slug=f"{difficulty}-{uuid4().hex[:8]}",
                title=f"{difficulty.title()} problem",
            )
            connection.execute(
                text(
                    "UPDATE content_items SET difficulty=CAST(:value AS difficulty_level) "
                    "WHERE id=:id"
                ),
                {"value": difficulty, "id": problem_id},
            )
            problems[difficulty] = problem_id
            versions[difficulty] = version_id
        topic_id = uuid4()
        connection.execute(
            text(
                "INSERT INTO topics (id,domain_id,slug,name) "
                "VALUES (:id,:domain,:slug,'Difficulty topic')"
            ),
            {
                "id": topic_id,
                "domain": domain_id,
                "slug": f"difficulty-{topic_id.hex[:8]}",
            },
        )
        for difficulty in ("beginner", "easy", "medium", "hard", "expert"):
            connection.execute(
                text(
                    "INSERT INTO content_version_topics "
                    "(content_version_id,content_item_id,domain_id,topic_id,is_primary) "
                    "VALUES (:version,:item,:domain,:topic,true)"
                ),
                {
                    "version": versions[difficulty],
                    "item": problems[difficulty],
                    "domain": domain_id,
                    "topic": topic_id,
                },
            )
        connection.execute(
            text("UPDATE content_items SET archived_at=:at WHERE id=:id"),
            {"at": base, "id": problems["hard"]},
        )
        attempts = (
            ("beginner", "solved_with_hint"),
            ("beginner", "solved_independently"),
            ("medium", "solved_with_hint"),
            ("expert", "solved_independently"),
        )
        for index, (difficulty, outcome) in enumerate(attempts):
            connection.execute(
                text(
                    "INSERT INTO practice_attempts "
                    "(attempt_event_id,user_id,content_item_id,provider_id,outcome,hint_used,"
                    "attempted_at) VALUES "
                    "(:event,:user,:problem,:provider,CAST(:outcome AS practice_outcome),"
                    "false,:at)"
                ),
                {
                    "event": uuid4(),
                    "user": user_id,
                    "problem": problems[difficulty],
                    "provider": provider_id,
                    "outcome": outcome,
                    "at": base + timedelta(minutes=index),
                },
            )

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    try:
        async with database.session_factory.create_session() as session:
            detail = await SqlAlchemyAdminAnalyticsRepository(session).user_detail(user_id)
        assert detail is not None
        breakdown = detail["difficulty_breakdown"]
        assert [item["difficulty"] for item in breakdown] == [
            "beginner",
            "easy",
            "medium",
            "hard",
            "expert",
        ]
        assert sum(item["attempted"] for item in breakdown) == 3
        assert sum(item["completed"] for item in breakdown) == 2
        assert detail["progress_summary"]["unique_problems_attempted"] == 3
        assert detail["progress_summary"]["unique_problems_completed"] == 2
        assert detail["progress_summary"]["total_attempts"] == 4
        assert detail["progress_summary"]["accepted_attempts"] == 2
        assert detail["progress_summary"]["current_streak"] is None
        assert detail["progress_summary"]["longest_streak"] is None
        assert detail["progress_summary"]["readiness_score"] is None
        assert detail["profile"]["name"] == "Difficulty User"
        assert detail["profile"]["email"] == "difficulty@example.test"
        topic_progress = next(
            item for item in detail["topic_progress"] if item["topic_id"] == topic_id
        )
        assert topic_progress == {
            "topic_id": topic_id,
            "topic_name": "Difficulty topic",
            "available_problems": 4,
            "attempted_problems": 3,
            "completed_problems": 2,
            "completion_percentage": 50.0,
        }
        assert detail["revision_summary"] == {
            "available": True,
            "total_revision_items": 0,
            "completed_revisions": 0,
            "overdue_revisions": 0,
            "last_revision_at": None,
        }
        assert detail["mock_test_summary"] == {
            "available": False,
            "total_attempts": 0,
            "completed_tests": 0,
            "average_score": None,
        }
        for forbidden in ("password", "jwt", "token", "provider_metadata"):
            assert forbidden not in str(detail).lower()
    finally:
        await database.close()
        engine.dispose()


async def test_activity_attempt_classification_prioritizes_completion_for_accepted_reattempt(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    user_id = uuid4()
    base = datetime(2026, 7, 21, 8, tzinfo=UTC)
    with engine.begin() as connection:
        _add_user(
            connection,
            user_id=user_id,
            name="Reattempt User",
            email="reattempt@example.test",
            created_at=base,
        )
        domain_id, category_id, provider_id = _add_catalog(connection)
        problem_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"reattempt-{uuid4().hex[:8]}",
            title="Reattempt problem",
        )
        for index, outcome in enumerate(("solved_with_hint", "skipped", "solved_independently")):
            connection.execute(
                text(
                    "INSERT INTO practice_attempts "
                    "(attempt_event_id,user_id,content_item_id,provider_id,outcome,hint_used,"
                    "attempted_at) VALUES "
                    "(:event,:user,:problem,:provider,CAST(:outcome AS practice_outcome),"
                    "false,:at)"
                ),
                {
                    "event": uuid4(),
                    "user": user_id,
                    "problem": problem_id,
                    "provider": provider_id,
                    "outcome": outcome,
                    "at": base + timedelta(minutes=index + 1),
                },
            )

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    try:
        async with database.session_factory.create_session() as session:
            result = await SqlAlchemyAdminAnalyticsRepository(session).activity(
                user_id,
                activity_type=None,
                from_date=None,
                to_date=None,
                offset=0,
                limit=25,
            )
        assert result is not None
        assert [item["activity_type"] for item in result[1]] == [
            "problem_completed",
            "problem_reattempted",
            "problem_attempted",
            "user_signed_up",
        ]
    finally:
        await database.close()
        engine.dispose()


async def test_user_listing_filters_search_sort_and_eligibility_boundaries(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    domain_id = uuid4()
    marker = uuid4().hex[:10]
    base = datetime(2026, 7, 22, 10, tzinfo=UTC)
    users = [
        (uuid4(), "Ninety Nine", f"u99-{marker}@example.test", 99),
        (uuid4(), "One Hundred", f"u100-{marker}@example.test", 100),
        (uuid4(), r"Literal %_\ User", f"u101-{marker}@example.test", 101),
    ]
    with engine.begin() as connection:
        connection.execute(
            text("INSERT INTO domains (id,slug,name) VALUES (:id,:slug,'Eligibility')"),
            {"id": domain_id, "slug": f"eligibility-{marker}"},
        )
        provider_id = connection.execute(
            text(
                "INSERT INTO practice_providers (slug,name) VALUES (:slug,'Eligibility') "
                "RETURNING id"
            ),
            {"slug": f"eligibility-{marker}"},
        ).scalar_one()
        for index, (user_id, name, email, completion_count) in enumerate(users):
            _add_user(
                connection,
                user_id=user_id,
                name=name,
                email=email,
                created_at=base + timedelta(days=index),
            )
            problem_ids = connection.execute(
                text(
                    "INSERT INTO content_items (id,domain_id,slug,type,difficulty) "
                    "SELECT gen_random_uuid(),:domain,:prefix||value,'problem','easy' "
                    "FROM generate_series(1,:count) value RETURNING id"
                ),
                {
                    "domain": domain_id,
                    "prefix": f"user-{index}-",
                    "count": completion_count,
                },
            ).scalars()
            for attempt_index, problem_id in enumerate(problem_ids):
                connection.execute(
                    text(
                        "INSERT INTO practice_attempts "
                        "(attempt_event_id,user_id,content_item_id,provider_id,outcome,"
                        "hint_used,attempted_at) VALUES "
                        "(:event,:user,:problem,:provider,'solved_independently',false,:at)"
                    ),
                    {
                        "event": uuid4(),
                        "user": user_id,
                        "problem": problem_id,
                        "provider": provider_id,
                        "at": base + timedelta(days=index, minutes=attempt_index),
                    },
                )
            # A repeated accepted attempt must not affect eligibility or unique totals.
            first_problem = connection.execute(
                text("SELECT id FROM content_items WHERE domain_id=:domain AND slug=:slug"),
                {"domain": domain_id, "slug": f"user-{index}-1"},
            ).scalar_one()
            connection.execute(
                text(
                    "INSERT INTO practice_attempts "
                    "(attempt_event_id,user_id,content_item_id,provider_id,outcome,"
                    "hint_used,attempted_at) VALUES "
                    "(:event,:user,:problem,:provider,'solved_independently',false,:at)"
                ),
                {
                    "event": uuid4(),
                    "user": user_id,
                    "problem": first_problem,
                    "provider": provider_id,
                    "at": base + timedelta(days=index, hours=5),
                },
            )

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    empty_filters = {
        "search": None,
        "account_status": None,
        "interview_eligible": None,
        "min_completed": None,
        "max_completed": None,
        "signed_up_from": None,
        "signed_up_to": None,
        "active_from": None,
        "active_to": None,
    }

    async def listed(**changes: object) -> tuple[int, list[dict[str, object]]]:
        filters = {**empty_filters, "search": marker, **changes}
        async with database.session_factory.create_session() as session:
            return await SqlAlchemyAdminAnalyticsRepository(session).list_users(
                filters=filters,
                offset=0,
                limit=100,
                sort_by="unique_problems_completed",
                descending=False,
            )

    try:
        total, items = await listed()
        assert total == 3
        assert [item["unique_problems_completed"] for item in items] == [99, 100, 101]
        assert [item["interview_unlock"]["eligible"] for item in items] == [
            False,
            True,
            True,
        ]

        assert (await listed(min_completed=100))[0] == 2
        assert (await listed(max_completed=99))[0] == 1
        assert (await listed(interview_eligible=True))[0] == 2
        assert (await listed(interview_eligible=False))[0] == 1
        assert (await listed(signed_up_from=base + timedelta(days=1)))[0] == 2
        assert (await listed(signed_up_to=base))[0] == 1
        assert (await listed(active_from=base + timedelta(days=2)))[0] == 1
        assert (await listed(active_to=base + timedelta(days=1, hours=6)))[0] == 2

        async with database.session_factory.create_session() as session:
            repository = SqlAlchemyAdminAnalyticsRepository(session)
            name_total, _ = await repository.list_users(
                filters={**empty_filters, "search": "ninety NINE"},
                offset=0,
                limit=25,
                sort_by="name",
                descending=False,
            )
            email_total, _ = await repository.list_users(
                filters={**empty_filters, "search": f"U100-{marker.upper()}"},
                offset=0,
                limit=25,
                sort_by="email",
                descending=False,
            )
            escaped_total, escaped_items = await repository.list_users(
                filters={**empty_filters, "search": "%_\\"},
                offset=0,
                limit=25,
                sort_by="created_at",
                descending=False,
            )
        assert name_total == 1
        assert email_total == 1
        assert escaped_total == 1
        assert escaped_items[0]["name"] == r"Literal %_\ User"

        for sort_by in (
            "created_at",
            "last_active_at",
            "unique_problems_completed",
            "unique_problems_attempted",
            "name",
            "email",
        ):
            async with database.session_factory.create_session() as session:
                repository = SqlAlchemyAdminAnalyticsRepository(session)
                ascending = await repository.list_users(
                    filters={**empty_filters, "search": marker},
                    offset=0,
                    limit=2,
                    sort_by=sort_by,
                    descending=False,
                )
                descending = await repository.list_users(
                    filters={**empty_filters, "search": marker},
                    offset=0,
                    limit=2,
                    sort_by=sort_by,
                    descending=True,
                )
            assert ascending[0] == 3
            assert descending[0] == 3
            assert len(ascending[1]) == len(descending[1]) == 2
            assert ascending[1][0]["user_id"] != descending[1][0]["user_id"]
    finally:
        await database.close()
        engine.dispose()


async def test_admin_access_auditing_is_sanitized_filterable_and_failure_tolerant(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    admin_id = uuid4()
    marker = uuid4().hex[:10]
    created_at = datetime(2026, 7, 23, 10, tzinfo=UTC)
    with engine.begin() as connection:
        _add_user(
            connection,
            user_id=admin_id,
            name="Audit Admin",
            email=f"audit-{marker}@example.test",
            created_at=created_at,
        )
        domain_id, category_id, _ = _add_catalog(connection)
        problem_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"audit-{marker}",
            title=f"Audit {marker}",
        )

    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    service = AdminAnalyticsService(database.session_factory)

    def audit(action: str, resource_type: str, resource_id: str | None = None) -> dict[str, object]:
        return {
            "admin_user_id": admin_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "request_method": "GET",
            "request_path": f"/api/v1/admin/{marker}",
            "request_id": f"request-{marker}-{action}",
            "metadata": {},
        }

    try:
        await service.overview(audit=audit("admin.overview.viewed", "platform"))
        await service.list_users(
            filters={
                "search": marker,
                "account_status": None,
                "interview_eligible": None,
                "min_completed": None,
                "max_completed": None,
                "signed_up_from": None,
                "signed_up_to": None,
                "active_from": None,
                "active_to": None,
            },
            page=1,
            page_size=25,
            sort_by="created_at",
            descending=True,
            audit={
                **audit("admin.users.list_viewed", "user"),
                "metadata": {"page": 1, "page_size": 25},
            },
        )
        await service.user_detail(
            admin_id,
            audit=audit("admin.user.viewed", "user", str(admin_id)),
        )
        await service.activity(
            admin_id,
            activity_type=None,
            from_date=None,
            to_date=None,
            page=1,
            page_size=25,
            audit=audit("admin.user_activity.viewed", "user", str(admin_id)),
        )
        await service.list_problems(
            filters={
                "search": marker,
                "topic_id": None,
                "difficulty": None,
                "publication_status": None,
            },
            page=1,
            page_size=25,
            sort_by="attempts",
            descending=True,
            audit=audit("admin.problem_analytics.viewed", "problem"),
        )
        await service.problem_detail(
            problem_id,
            audit=audit("admin.problem_analytics.viewed", "problem", str(problem_id)),
        )
        returned_total, returned_logs = await service.audit_logs(
            filters={
                "admin_user_id": admin_id,
                "action": None,
                "resource_type": None,
                "from_date": None,
                "to_date": None,
            },
            page=1,
            page_size=100,
            audit=audit("admin.audit_logs.viewed", "admin_audit_log"),
        )
        # Reads happen before the endpoint's own audit insert, so the self-audit appears
        # deterministically on the next request rather than in this response.
        assert returned_total == 6
        assert all(log["action"] != "admin.audit_logs.viewed" for log in returned_logs)

        async with database.session_factory.create_session() as session:
            repository = SqlAlchemyAdminAnalyticsRepository(session)
            total, logs = await repository.audit_logs(
                filters={
                    "admin_user_id": admin_id,
                    "action": None,
                    "resource_type": None,
                    "from_date": None,
                    "to_date": None,
                },
                offset=0,
                limit=100,
            )
            filtered_total, filtered = await repository.audit_logs(
                filters={
                    "admin_user_id": admin_id,
                    "action": "admin.user.viewed",
                    "resource_type": "user",
                    "from_date": created_at,
                    "to_date": datetime.now(UTC) + timedelta(minutes=1),
                },
                offset=0,
                limit=1,
            )
            paged_total, paged = await repository.audit_logs(
                filters={
                    "admin_user_id": admin_id,
                    "action": None,
                    "resource_type": None,
                    "from_date": None,
                    "to_date": None,
                },
                offset=1,
                limit=2,
            )
        assert total == 7
        assert filtered_total == 1
        assert filtered[0]["resource_id"] == str(admin_id)
        assert paged_total == 7
        assert len(paged) == 2
        assert {log["action"] for log in logs} == {
            "admin.overview.viewed",
            "admin.users.list_viewed",
            "admin.user.viewed",
            "admin.user_activity.viewed",
            "admin.problem_analytics.viewed",
            "admin.audit_logs.viewed",
        }
        serialized = str(logs).lower()
        assert "authorization" not in serialized
        assert "bearer" not in serialized
        assert "token" not in serialized
        list_log = next(log for log in logs if log["action"] == "admin.users.list_viewed")
        assert list_log["metadata_json"] == {"page": 1, "page_size": 25}
        assert all(
            log["metadata_json"] == {} for log in logs if log["action"] != "admin.users.list_viewed"
        )

        with patch.object(
            SqlAlchemyAdminAnalyticsRepository,
            "add_audit",
            side_effect=RuntimeError("simulated audit failure"),
        ):
            result = await service.overview(audit=audit("admin.overview.viewed", "platform"))
        assert "users" in result
    finally:
        await database.close()
        engine.dispose()
