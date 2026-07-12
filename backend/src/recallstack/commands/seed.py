import asyncio

from sqlalchemy import select

from recallstack.modules.catalog.infrastructure.sqlalchemy_models import CategoryModel, DomainModel
from recallstack.modules.identity.infrastructure.sqlalchemy_models import RoleModel
from recallstack.modules.practice.infrastructure.sqlalchemy_models import PracticeProviderModel
from recallstack.shared.config import get_settings
from recallstack.shared.database import Database
from recallstack.shared.database.event_loop import configure_psycopg_event_loop

DSA_CATEGORIES = (
    ("arrays", "Arrays"),
    ("strings", "Strings"),
    ("2d-arrays", "2D Arrays"),
    ("searching-sorting", "Searching & Sorting"),
    ("backtracking", "Backtracking"),
    ("linked-list", "Linked List"),
    ("stacks-queues", "Stacks & Queues"),
    ("greedy", "Greedy"),
    ("binary-trees", "Binary Trees"),
    ("binary-search-trees", "Binary Search Trees"),
    ("heaps-hashing", "Heaps & Hashing"),
    ("graphs", "Graphs"),
    ("tries", "Tries"),
    ("dynamic-programming", "DP"),
    ("bit-manipulation", "Bit Manipulation"),
    ("segment-trees", "Segment Trees"),
)


async def seed() -> None:
    database = Database(get_settings())
    try:
        async with database.session_factory.create_session() as session, session.begin():
            for code, description in (
                ("user", "Standard learner"),
                ("admin", "Platform administrator"),
                ("content_editor", "Content author and editor"),
            ):
                role = await session.scalar(select(RoleModel).where(RoleModel.code == code))
                if role is None:
                    session.add(RoleModel(code=code, description=description))
                else:
                    role.description = description

            domain = await session.scalar(select(DomainModel).where(DomainModel.slug == "dsa"))
            if domain is None:
                domain = DomainModel(
                    slug="dsa",
                    name="Data Structures and Algorithms",
                    description="Data structures, algorithms, and problem-solving patterns.",
                    sort_order=0,
                    is_active=True,
                )
                session.add(domain)
                await session.flush()

            existing_categories = {
                category.slug: category
                for category in await session.scalars(
                    select(CategoryModel).where(CategoryModel.domain_id == domain.id)
                )
            }
            for sort_order, (slug, name) in enumerate(DSA_CATEGORIES):
                category = existing_categories.get(slug)
                if category is None:
                    session.add(
                        CategoryModel(
                            domain_id=domain.id,
                            slug=slug,
                            name=name,
                            sort_order=sort_order,
                            is_active=True,
                        )
                    )
                else:
                    category.name = name
                    category.sort_order = sort_order

            for slug, name, base_url in (
                ("leetcode", "LeetCode", "https://leetcode.com"),
                ("geeksforgeeks", "GeeksForGeeks", "https://www.geeksforgeeks.org"),
            ):
                provider = await session.scalar(
                    select(PracticeProviderModel).where(PracticeProviderModel.slug == slug)
                )
                if provider is None:
                    session.add(
                        PracticeProviderModel(
                            slug=slug, name=name, base_url=base_url, is_active=True
                        )
                    )
                else:
                    provider.name = name
                    provider.base_url = base_url
                    provider.is_active = True
    finally:
        await database.close()


def main() -> None:
    configure_psycopg_event_loop()
    asyncio.run(seed())


if __name__ == "__main__":
    main()
