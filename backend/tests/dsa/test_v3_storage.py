"""Proposed V3 migration verification in a disposable, loopback-only database."""

import json
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

pytestmark = pytest.mark.integration


@pytest.fixture(scope="session")
def board_schema(dsa_engine):
    assert dsa_engine.url.host in {"localhost", "127.0.0.1", "::1"}
    assert dsa_engine.url.database.startswith("dsa_api_test_")
    migration = (
        Path(__file__).resolve().parents[3]
        / "web/supabase/migrations/20261016084605_dsa_v3_personal_boards_companies.sql"
    )
    with dsa_engine.begin() as connection:
        connection.exec_driver_sql("""
          do $$ begin
            if not exists(select 1 from pg_roles where rolname='anon') then
              create role anon; end if;
            if not exists(select 1 from pg_roles where rolname='authenticated') then
              create role authenticated; end if;
            if not exists(select 1 from pg_roles where rolname='service_role') then
              create role service_role bypassrls; end if;
          end $$;
          create function auth.uid() returns uuid language sql stable as
            $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
          grant usage on schema public, auth to authenticated;
          grant execute on function auth.uid() to authenticated;
        """)
        connection.connection.driver_connection.execute(migration.read_text(encoding="utf-8"))
    return dsa_engine


def as_user(connection, user):
    connection.execute(
        text("select set_config('request.jwt.claim.sub', :id, true)"), {"id": str(user)}
    )
    connection.exec_driver_sql("set local role authenticated")


def layout():
    return json.dumps(
        {"schema": 1, "lanes": {"easy": [], "medium": [], "hard": []}, "collections": []}
    )


def test_board_ownership_and_compare_and_swap(board_schema, dataset):
    engine = board_schema
    with engine.begin() as connection:
        as_user(connection, dataset["owner"])
        connection.execute(
            text(
                "insert into dsa_personal_boards(user_id,category_id,layout) values "
                "(:u,:c,cast(:l as jsonb))"
            ),
            {"u": dataset["owner"], "c": dataset["category"], "l": layout()},
        )
        assert connection.scalar(text("select count(*) from dsa_personal_boards")) == 1
        result = connection.execute(
            text(
                "update dsa_personal_boards set row_version=2 where user_id=:u and "
                "category_id=:c and row_version=1 returning row_version"
            ),
            {"u": dataset["owner"], "c": dataset["category"]},
        )
        assert result.scalar_one() == 2
        result = connection.execute(
            text(
                "update dsa_personal_boards set row_version=2 where user_id=:u and "
                "category_id=:c and row_version=1 returning row_version"
            ),
            {"u": dataset["owner"], "c": dataset["category"]},
        )
        assert result.first() is None
    with engine.begin() as connection:
        as_user(connection, dataset["other"])
        assert connection.scalar(text("select count(*) from dsa_personal_boards")) == 0
        assert (
            connection.execute(text("delete from dsa_personal_boards returning user_id")).first()
            is None
        )
    with pytest.raises(DBAPIError), engine.begin() as connection:
        as_user(connection, dataset["other"])
        connection.execute(
            text(
                "insert into dsa_personal_boards(user_id,category_id,layout) values "
                "(:u,:c,cast(:l as jsonb))"
            ),
            {"u": dataset["owner"], "c": dataset["category"], "l": layout()},
        )
    with pytest.raises(DBAPIError), engine.begin() as connection:
        as_user(connection, dataset["owner"])
        connection.execute(
            text("update dsa_personal_boards set user_id=:other,row_version=3"),
            {"other": dataset["other"]},
        )


def test_company_projection_does_not_expose_unpublished_versions_or_review_material(
    board_schema, dataset
):
    company = uuid4()
    with board_schema.begin() as connection:
        connection.execute(
            text("insert into dsa_companies(id,slug,name) values(:id,:slug,'Reviewed Company')"),
            {"id": company, "slug": f"company-{company.hex}"},
        )
        for kind in ("a", "unapproved"):
            connection.execute(
                text(
                    "insert into "
                    "dsa_problem_company_tags(problem_version_id,company_id,reviewed,"
                    "reviewed_by,reviewed_at,source_url) "
                    "values(:v,:c,true,:u,now(),'https://example.com/review')"
                ),
                {"v": dataset["rows"][kind]["version"], "c": company, "u": dataset["owner"]},
            )
    with board_schema.begin() as connection:
        as_user(connection, dataset["owner"])
        versions = (
            connection.execute(
                text("select problem_version_id from dsa_problem_company_tags where company_id=:c"),
                {"c": company},
            )
            .scalars()
            .all()
        )
        assert versions == [dataset["rows"]["a"]["version"]]
        assert not connection.scalar(
            text(
                "select has_table_privilege('authenticated','public.dsa_problem_versions','SELECT')"
            )
        )
    with pytest.raises(DBAPIError), board_schema.begin() as connection:
        as_user(connection, dataset["owner"])
        connection.execute(text("select source_url from dsa_problem_company_tags"))
    with board_schema.begin() as connection:
        assert not connection.scalar(
            text("select has_table_privilege('anon','public.dsa_personal_boards','SELECT')")
        )
