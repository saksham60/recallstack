from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text

from recallstack.modules.admin.infrastructure.analytics_repository import (
    SqlAlchemyAdminAnalyticsRepository,
)
from recallstack.shared.config import Settings
from recallstack.shared.database import Database
from tests.integration.test_published_study_note_repository import add_content

pytestmark = pytest.mark.integration


async def test_admin_problem_aggregates_deduplicate_reattempts_and_rank_first_attempt(
    migrated_database_url: str,
) -> None:
    engine = create_engine(migrated_database_url)
    user_id, domain_id, category_id = uuid4(), uuid4(), uuid4()
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": user_id})
        connection.execute(
            text("INSERT INTO profiles (id, display_name, email) VALUES (:id, 'Analyst', :email)"),
            {"id": user_id, "email": f"{user_id}@example.test"},
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
        problem_id, _ = add_content(
            connection,
            domain_id=domain_id,
            category_id=category_id,
            slug=f"analytics-problem-{uuid4().hex[:8]}",
            title="Analytics Problem",
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

        async with database.session_factory.create_session() as session:
            repository = SqlAlchemyAdminAnalyticsRepository(session)
            after = await repository.overview()
            detail = await repository.problem_detail(problem_id)

        assert after["problems"]["total_attempts"] - before["problems"]["total_attempts"] == 3
        assert after["problems"]["accepted_attempts"] - before["problems"]["accepted_attempts"] == 2
        assert (
            after["problems"]["unique_user_problem_attempts"]
            - before["problems"]["unique_user_problem_attempts"]
            == 1
        )
        assert (
            after["problems"]["unique_user_problem_completions"]
            - before["problems"]["unique_user_problem_completions"]
            == 1
        )
        assert detail is not None
        assert detail["analytics"]["unique_users_attempted"] == 1
        assert detail["analytics"]["unique_users_completed"] == 1
        assert detail["analytics"]["first_attempt_success_rate"] == 0.0
        assert detail["analytics"]["average_attempts_before_completion"] == 2.0
    finally:
        await database.close()
        engine.dispose()
