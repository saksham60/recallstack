from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class Category:
    id: UUID
    domain_id: UUID
    parent_category_id: UUID | None
    slug: str
    name: str
    description: str | None
    sort_order: int
