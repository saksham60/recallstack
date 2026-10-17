import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, insert, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from recallstack.modules.catalog.infrastructure.sqlalchemy_models import (
    CategoryModel,
    DomainModel,
    TopicModel,
)
from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemModel,
    ContentVersionTopicModel,
)
from recallstack.modules.dsa.infrastructure.sqlalchemy_models import (
    DefinitionModel,
    DsaReadBase,
    SuiteModel,
    VersionModel,
)
from recallstack.modules.dsa.infrastructure.sqlalchemy_models import (
    TestCaseModel as Case,
)
from recallstack.modules.practice.infrastructure.sqlalchemy_models import (
    PracticeProviderModel,
    PracticeResourceModel,
)
from tests.conftest import TEST_PUBLISHER_PROFILE_ID
from tests.integration.test_category_content_read_repository import add_content


@pytest.fixture(scope="session")
def dsa_engine(postgres_url):
    # DDL reconciliation is test-only and deliberately rejects production/remote URLs.
    base_url = make_url(postgres_url.replace("postgresql+psycopg2://", "postgresql+psycopg://"))
    assert base_url.host in {"localhost", "127.0.0.1", "::1"}
    name = f"dsa_api_test_{uuid4().hex}"
    admin = create_engine(base_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'CREATE DATABASE "{name}"'))
    isolated_url = base_url.set(database=name).render_as_string(hide_password=False)
    engine = create_engine(isolated_url)
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE SCHEMA auth"))
            connection.execute(text("CREATE TABLE auth.users (id uuid PRIMARY KEY, email text)"))
        environment = {**os.environ, "DATABASE_URL": isolated_url}
        # Trusted test command; migrations run in a child process, never changing
        # the parent process's database settings or the shared integration database.
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            env=environment,
            check=True,
            capture_output=True,
        )
        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": TEST_PUBLISHER_PROFILE_ID}
            )
            connection.execute(
                text("INSERT INTO profiles (id) VALUES (:id)"), {"id": TEST_PUBLISHER_PROFILE_ID}
            )
        DsaReadBase.metadata.create_all(engine)
        yield engine
    finally:
        engine.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin.dispose()


@pytest.fixture
def dataset(dsa_engine):
    token = uuid4().hex
    owner, other = uuid4(), uuid4()
    with dsa_engine.begin() as connection:
        connection.execute(
            text("INSERT INTO auth.users (id) VALUES (:a), (:b)"), {"a": owner, "b": other}
        )
        connection.execute(
            text("INSERT INTO profiles (id) VALUES (:a), (:b)"), {"a": owner, "b": other}
        )
        domain = connection.scalar(select(DomainModel.id).where(DomainModel.slug == "dsa"))
        if domain is None:
            domain = connection.scalar(
                insert(DomainModel).values(slug="dsa", name="DSA").returning(DomainModel.id)
            )
        other_domain = connection.scalar(
            insert(DomainModel)
            .values(slug=f"other-{token}", name="Other")
            .returning(DomainModel.id)
        )
        category = connection.scalar(
            insert(CategoryModel)
            .values(domain_id=domain, slug=f"cat-{token}", name=f"Category {token}")
            .returning(CategoryModel.id)
        )
        other_category = connection.scalar(
            insert(CategoryModel)
            .values(domain_id=other_domain, slug=f"cat-{token}", name="Other category")
            .returning(CategoryModel.id)
        )
        topic = connection.scalar(
            insert(TopicModel)
            .values(domain_id=domain, slug=f"topic-{token}", name=f"Topic {token}")
            .returning(TopicModel.id)
        )
        provider = connection.scalar(
            insert(PracticeProviderModel)
            .values(slug=f"provider-{token}", name="Test provider")
            .returning(PracticeProviderModel.id)
        )

        def add(title, *, approved=True, published=True, is_dsa=True):
            item = add_content(
                connection,
                domain_id=domain if is_dsa else other_domain,
                category_id=category if is_dsa else other_category,
                slug=f"item-{uuid4().hex}",
                title=title,
                difficulty="easy",
                category_sort_order=0,
            )
            base_version = connection.scalar(
                select(ContentItemModel.current_published_version_id).where(
                    ContentItemModel.id == item
                )
            )
            if is_dsa:
                connection.execute(
                    insert(ContentVersionTopicModel).values(
                        content_version_id=base_version,
                        content_item_id=item,
                        domain_id=domain,
                        topic_id=topic,
                        is_primary=True,
                    )
                )
            url = f"https://example.com/{item}"
            resource = connection.scalar(
                insert(PracticeResourceModel)
                .values(
                    content_item_id=item,
                    provider_id=provider,
                    url=url,
                    url_hash=hashlib.sha256(url.encode()).hexdigest(),
                    is_primary=True,
                )
                .returning(PracticeResourceModel.id)
            )
            definition = connection.scalar(
                insert(DefinitionModel)
                .values(
                    content_item_id=item,
                    practice_resource_id=resource,
                )
                .returning(DefinitionModel.id)
            )
            version = connection.scalar(
                insert(VersionModel)
                .values(
                    definition_id=definition,
                    version_number=2,
                    status="published" if published else "needs_review",
                    specification={
                        "title": title,
                        "problem_statement": "Find a pair",
                        "function_contract": {
                            "function": "solve",
                            "input": {"nums": "int[]"},
                            "output": "int",
                            "implementation": "SECRET",
                        },
                        "constraints": ["nonempty"],
                        "examples": [{"input": {"nums": [1]}, "output": 1}],
                        "review_notes": "SECRET",
                        "supported_languages": ["python"],
                    },
                    provenance={
                        "quality_review_20261015": {"publish_approved": approved},
                        "reference_solution_python": "SECRET",
                    },
                )
                .returning(VersionModel.id)
            )
            if published:
                connection.execute(
                    update(DefinitionModel)
                    .where(DefinitionModel.id == definition)
                    .values(current_version_id=version)
                )
            suite = connection.scalar(
                insert(SuiteModel)
                .values(
                    problem_version_id=version,
                    suite_version=1,
                    status="published" if published else "needs_review",
                    oracle_metadata={"reference_solution_python": "SECRET"},
                )
                .returning(SuiteModel.id)
            )
            return {
                "id": item,
                "version": version,
                "definition": definition,
                "suite": suite,
                "resource": resource,
                "title": title,
            }

        rows = {
            "a": add(f"{token} Alpha"),
            "b": add(f"{token} Alpha"),
            "z": add(f"{token} Zebra"),
            "draft": add(f"{token} Draft", published=False),
            "unapproved": add(f"{token} Unapproved", approved=False),
            "string_approval": add(f"{token} String approval", approved="true"),
            "other": add(f"{token} Other", is_dsa=False),
        }
    yield {
        "rows": rows,
        "owner": owner,
        "other": other,
        "domain": domain,
        "category": category,
        "topic": topic,
        "provider": provider,
        "token": token,
        "engine": dsa_engine,
    }
    # Keep cleanup scoped to data created by this fixture. Foreign-key order matters.
    with Session(dsa_engine) as session:
        for row in rows.values():
            session.execute(
                update(DefinitionModel)
                .where(DefinitionModel.id == row["definition"])
                .values(current_version_id=None)
            )
        # These records live only for this disposable cluster; other tests may inspect
        # them. Random identifiers and per-test filters prevent cross-test coupling.
        session.commit()


@pytest.fixture(scope="session")
def execution_schema(dsa_engine):
    migration = (
        Path(__file__).resolve().parents[3]
        / "web/supabase/migrations/20261015172042_dsa_execution_jobs.sql"
    )
    assert dsa_engine.url.host in {"localhost", "127.0.0.1", "::1"}
    assert dsa_engine.url.database.startswith("dsa_api_test_")
    with dsa_engine.begin() as connection:
        connection.exec_driver_sql("""
        do $$ begin
          if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
          if not exists(select 1 from pg_roles where rolname='authenticated') then
            create role authenticated;
          end if;
          if not exists(select 1 from pg_roles where rolname='service_role') then
            create role service_role bypassrls;
          end if;
        end $$;
        create or replace function auth.uid() returns uuid language sql stable as
          $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        grant usage on schema public,auth to authenticated;
        grant execute on function auth.uid() to authenticated;
        """)
        connection.connection.driver_connection.execute(migration.read_text(encoding="utf-8"))
    return dsa_engine


@pytest.fixture
def execution_data(execution_schema, dataset):
    engine, row = execution_schema, dataset["rows"]["a"]
    with engine.begin() as connection:
        for ordinal, visibility in enumerate(("public", "hidden")):
            connection.execute(
                insert(Case).values(
                    suite_id=row["suite"],
                    ordinal=ordinal,
                    category="official",
                    visibility=visibility,
                    validation_status="verified",
                    input_json={"nums": [ordinal + 1]},
                    expected_json=ordinal + 1,
                )
            )
        connection.execute(
            text("""insert into dsa_execution_private.certificates
          (problem_version_id,suite_id,contract,public_run_approved,hidden_submit_approved,certified_by,certified_at)
          values (:version,:suite,cast(:contract as jsonb),true,true,:owner,now())"""),
            {
                "version": row["version"],
                "suite": row["suite"],
                "owner": dataset["owner"],
                "contract": json.dumps(
                    {"entrypoint": "solve", "inputMode": "kwargs", "checker": "exact_json"}
                ),
            },
        )
    yield {**dataset, "row": row}
    with engine.begin() as connection:
        # This database exists exclusively for these tests; no production URLs accepted.
        connection.execute(text("delete from dsa_execution_private.jobs"))


@pytest.fixture(scope="session")
def board_schema(dsa_engine):
    assert dsa_engine.url.host in {"localhost", "127.0.0.1", "::1"}
    assert dsa_engine.url.database.startswith("dsa_api_test_")
    migration = (
        Path(__file__).resolve().parents[3]
        / "web/supabase/migrations/20261017060223_dsa_v3_explorer_projection.sql"
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
          create or replace function auth.uid() returns uuid language sql stable as
            $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
          grant usage on schema public, auth to authenticated;
          grant execute on function auth.uid() to authenticated;
          -- Minimal installed legacy contracts; production owns these tables.
          create table dsa_companies(id uuid primary key,slug text,
            canonical_name text,review_status text);
          create table dsa_problem_companies(definition_id uuid,company_id uuid,
            source_block_id uuid,match_method text);
          create table dsa_problem_company_sources(definition_id uuid,source_block_id uuid,
            review_status text,raw_companies text);
        """)
        installed = migration.with_name(
            "20261016073209_dsa_explorer_company_metadata_and_boards.sql"
        ).read_text(encoding="utf-8")
        # Use the exact installed board table/index, followed by its owner policies.
        connection.connection.driver_connection.execute(
            installed[
                installed.index("create table public.dsa_explorer_boards") : installed.index(
                    "create table public.dsa_explorer_lanes"
                )
            ]
        )
        connection.exec_driver_sql("""
          alter table public.dsa_explorer_boards enable row level security;
          create policy dsa_boards_own on public.dsa_explorer_boards to authenticated
            using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
          grant select,insert,delete on public.dsa_explorer_boards to authenticated;
          grant update(title,grouping,layout,settings,updated_at)
            on public.dsa_explorer_boards to authenticated;
        """)
        connection.connection.driver_connection.execute(migration.read_text(encoding="utf-8"))
    return dsa_engine
