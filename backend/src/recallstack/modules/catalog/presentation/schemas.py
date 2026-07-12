from uuid import UUID

from pydantic import BaseModel


class CategoryDashboardResponse(BaseModel):
    id: UUID
    slug: str
    name: str
    description: str | None
    sort_order: int
    total_content_items: int
    not_started_count: int
    learning_count: int
    attempted_count: int
    confident_count: int
    mastered_count: int
    progress_percentage: float
