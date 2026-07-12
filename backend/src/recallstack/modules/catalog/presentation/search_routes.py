from typing import Annotated, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from recallstack.modules.catalog.application.search import SearchFilters, SearchService
from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency

router = APIRouter(tags=["search"])


class SearchItem(BaseModel):
    content_item_id: UUID
    slug: str
    title: str
    summary_excerpt: str | None
    type: str
    difficulty: str | None
    matched_topic: str | None
    matched_category: str | None
    user_progress: dict[str, object]
    rank: float


class SearchResponse(BaseModel):
    items: list[SearchItem]
    pagination: dict[str, int]


@router.get("/search", response_model=SearchResponse, operation_id="searchCatalog")
async def search_catalog(
    current_user: CurrentUserDependency,
    request: Request,
    q: Annotated[str, Query(max_length=240)] = "",
    domain: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=120)] = None,
    topic: Annotated[str | None, Query(max_length=120)] = None,
    content_type: Annotated[
        Literal["problem", "concept", "pattern", "article", "architecture", "case_study"] | None,
        Query(alias="type"),
    ] = None,
    difficulty: Annotated[Literal["easy", "medium", "hard"] | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> SearchResponse:
    service = cast(SearchService, request.app.state.search_service)
    result = await service.query(
        profile_id=current_user.profile_id,
        filters=SearchFilters(
            q, domain, category, topic, content_type, difficulty, page, page_size
        ),
    )
    return SearchResponse(
        items=[
            SearchItem(
                content_item_id=item.content_item_id,
                slug=item.slug,
                title=item.title,
                summary_excerpt=item.summary_excerpt,
                type=item.content_type,
                difficulty=item.difficulty,
                matched_topic=item.matched_topic,
                matched_category=item.matched_category,
                user_progress={
                    "status": item.progress_status,
                    "confidence": item.progress_confidence,
                },
                rank=item.rank,
            )
            for item in result.items
        ],
        pagination={
            "page": result.page,
            "page_size": result.page_size,
            "total_items": result.total_items,
            "total_pages": result.total_pages,
        },
    )
