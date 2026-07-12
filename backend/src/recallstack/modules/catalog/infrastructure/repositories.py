from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from recallstack.modules.catalog.domain.entities import Category
from recallstack.modules.catalog.infrastructure.mappers import category_to_domain
from recallstack.modules.catalog.infrastructure.sqlalchemy_models import CategoryModel, DomainModel


class SqlAlchemyCatalogCategoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def active_for_domain(self, domain_slug: str) -> tuple[Category, ...] | None:
        statement = (
            select(DomainModel.id, CategoryModel)
            .outerjoin(
                CategoryModel,
                and_(
                    CategoryModel.domain_id == DomainModel.id,
                    CategoryModel.is_active.is_(True),
                ),
            )
            .where(DomainModel.slug == domain_slug, DomainModel.is_active.is_(True))
            .order_by(CategoryModel.sort_order.asc(), CategoryModel.name.asc())
        )
        rows = (await self._session.execute(statement)).all()
        if not rows:
            return None
        return tuple(category_to_domain(category) for _, category in rows if category is not None)
