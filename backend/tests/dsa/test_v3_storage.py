"""Proposed V3 migration verification in a disposable, loopback-only database."""

import json
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

pytestmark = pytest.mark.integration


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
            text(
                "insert into dsa_companies(id,slug,canonical_name,review_status) "
                "values(:id,:slug,'Legacy Company','approved')"
            ),
            {"id": company, "slug": f"company-{company.hex}"},
        )
        for kind in ("a", "unapproved", "b"):
            source = uuid4()
            connection.execute(
                text(
                    "insert into "
                    "dsa_problem_companies(definition_id,company_id,source_block_id,match_method) "
                    "values(:d,:c,:s,'exact')"
                ),
                {"d": dataset["rows"][kind]["definition"], "c": company, "s": source},
            )
            connection.execute(
                text(
                    "insert into "
                    "dsa_problem_company_sources(definition_id,source_block_id,"
                    "review_status,raw_companies) values(:d,:s,:status,'PRIVATE raw source')"
                ),
                {
                    "d": dataset["rows"][kind]["definition"],
                    "s": source,
                    "status": "needs_review" if kind == "b" else "auto_exact",
                },
            )
    with board_schema.begin() as connection:
        as_user(connection, dataset["owner"])
        versions = (
            connection.execute(
                text("select problem_version_id from dsa_v3_board_companies(:versions,0)"),
                {"versions": [row["version"] for row in dataset["rows"].values()]},
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
        connection.execute(text("select raw_companies from dsa_problem_company_sources"))
    with board_schema.begin() as connection:
        assert not connection.scalar(
            text("select has_table_privilege('anon','public.dsa_personal_boards','SELECT')")
        )
