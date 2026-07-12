from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.content.infrastructure.sqlalchemy_models import (
    ContentItemCategoryModel,
    ContentItemModel,
    ContentVersionModel,
    PublicationStatus,
)


class SqlAlchemyPublishedCategoryContentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def by_category(self, category_ids: tuple[UUID, ...]) -> dict[UUID, frozenset[UUID]]:
        result: dict[UUID, set[UUID]] = {category_id: set() for category_id in category_ids}
        if not category_ids:
            return {key: frozenset(value) for key, value in result.items()}
        statement = (
            select(
                ContentItemCategoryModel.category_id,
                ContentItemCategoryModel.content_item_id,
            )
            .join(
                ContentItemModel,
                ContentItemModel.id == ContentItemCategoryModel.content_item_id,
            )
            .join(
                ContentVersionModel,
                ContentVersionModel.id == ContentItemModel.current_published_version_id,
            )
            .where(
                ContentItemCategoryModel.category_id.in_(category_ids),
                ContentItemModel.archived_at.is_(None),
                ContentVersionModel.status == PublicationStatus.PUBLISHED,
                ContentVersionModel.published_at.is_not(None),
            )
        )
        for category_id, content_item_id in await self._session.execute(statement):
            result[category_id].add(content_item_id)
        return {key: frozenset(value) for key, value in result.items()}
