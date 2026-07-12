import asyncio
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from recallstack.modules.identity.application.services import IdentityService
from recallstack.modules.identity.application.unit_of_work import IdentityUnitOfWork
from recallstack.modules.identity.infrastructure.unit_of_work import SqlAlchemyIdentityUnitOfWork
from recallstack.shared.config import Settings
from recallstack.shared.database import Database

pytestmark = pytest.mark.integration


async def test_profile_repository_provisions_updates_and_loads_roles(
    migrated_database_url: str,
) -> None:
    subject = UUID("00000000-0000-0000-0000-000000000001")
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    async with SqlAlchemyIdentityUnitOfWork(database.session_factory) as uow:
        profile = await uow.profiles.provision(subject)
        updated = await uow.profiles.update(
            subject,
            display_name="Integration User",
            avatar_url="https://example.com/avatar.png",
            timezone="UTC",
        )
        await uow.commit()
    assert profile.id == subject
    assert updated.display_name == "Integration User"
    await database.close()


async def test_profile_foreign_key_rejects_unknown_auth_user(
    migrated_database_url: str,
) -> None:
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )
    with pytest.raises(IntegrityError):
        async with SqlAlchemyIdentityUnitOfWork(database.session_factory) as uow:
            await uow.profiles.provision(uuid4())
            await uow.commit()
    await database.close()


async def test_concurrent_first_login_provisions_one_profile(
    migrated_database_url: str,
) -> None:
    subject = uuid4()
    engine = create_engine(migrated_database_url)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO auth.users (id) VALUES (:id)"), {"id": subject})
    engine.dispose()
    database = Database(
        Settings(
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            database_url=migrated_database_url,
        )
    )

    def unit_of_work() -> IdentityUnitOfWork:
        return SqlAlchemyIdentityUnitOfWork(database.session_factory)

    service = IdentityService(unit_of_work)
    users = await asyncio.gather(*(service.load_current_user(subject) for _ in range(5)))
    assert {user.profile_id for user, _ in users} == {subject}
    engine = create_engine(migrated_database_url)
    with engine.connect() as connection:
        count = connection.execute(
            text("SELECT count(*) FROM profiles WHERE id = :id"), {"id": subject}
        ).scalar_one()
    engine.dispose()
    assert count == 1
    await database.close()
