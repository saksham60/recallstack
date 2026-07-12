import argparse
import asyncio
from uuid import UUID

from sqlalchemy import select

from recallstack.modules.identity.infrastructure.sqlalchemy_models import (
    ProfileModel,
    ProfileRoleGrantModel,
    RoleModel,
)
from recallstack.shared.config import get_settings
from recallstack.shared.database import Database
from recallstack.shared.database.event_loop import configure_psycopg_event_loop


async def grant_role(profile_id: UUID, role_code: str) -> None:
    database = Database(get_settings())
    try:
        async with database.session_factory.create_session() as session, session.begin():
            profile = await session.get(ProfileModel, profile_id)
            if profile is None:
                raise ValueError("Profile does not exist; the user must authenticate once first")
            role = await session.scalar(select(RoleModel).where(RoleModel.code == role_code))
            if role is None:
                raise ValueError(f"Unknown role: {role_code}")
            existing = await session.scalar(
                select(ProfileRoleGrantModel).where(
                    ProfileRoleGrantModel.profile_id == profile_id,
                    ProfileRoleGrantModel.role_id == role.id,
                    ProfileRoleGrantModel.revoked_at.is_(None),
                )
            )
            if existing is None:
                session.add(
                    ProfileRoleGrantModel(
                        profile_id=profile_id,
                        role_id=role.id,
                        granted_by=None,
                    )
                )
    finally:
        await database.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Grant an application role to a profile")
    parser.add_argument("profile_id", type=UUID)
    parser.add_argument("role_code")
    arguments = parser.parse_args()
    configure_psycopg_event_loop()
    asyncio.run(grant_role(arguments.profile_id, arguments.role_code))


if __name__ == "__main__":
    main()
