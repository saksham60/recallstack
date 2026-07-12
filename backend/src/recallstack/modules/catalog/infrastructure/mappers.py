from recallstack.modules.catalog.domain.entities import Category
from recallstack.modules.catalog.infrastructure.sqlalchemy_models import CategoryModel


def category_to_domain(model: CategoryModel) -> Category:
    return Category(
        id=model.id,
        domain_id=model.domain_id,
        parent_category_id=model.parent_category_id,
        slug=model.slug,
        name=model.name,
        description=model.description,
        sort_order=model.sort_order,
    )
