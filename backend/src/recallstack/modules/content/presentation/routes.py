from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request

from recallstack.modules.content.application.category_content_list import (
    CategoryContentListFilters,
    CategoryContentListService,
)
from recallstack.modules.content.presentation.schemas import (
    CategoryContentListResponse,
    ContentTypeQuery,
    DifficultyQuery,
    SortQuery,
)
from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency
from recallstack.modules.learning.domain.enums import LearningStatus

router = APIRouter(prefix="/categories", tags=["content"])


@router.get(
    "/{categoryId}/content",
    response_model=CategoryContentListResponse,
    operation_id="getCategoryContent",
)
async def get_category_content(
    category_id: Annotated[UUID, Path(alias="categoryId")],
    current_user: CurrentUserDependency,
    request: Request,
    content_type: Annotated[ContentTypeQuery | None, Query(alias="type")] = None,
    difficulty: Annotated[DifficultyQuery | None, Query()] = None,
    status: Annotated[LearningStatus | None, Query()] = None,
    topic: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
    search: Annotated[str | None, Query(min_length=1, max_length=240)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    sort: Annotated[SortQuery, Query()] = "sort_order",
) -> CategoryContentListResponse:
    service = cast(CategoryContentListService, request.app.state.category_content_list_service)
    result = await service.query(
        category_id=category_id,
        profile_id=current_user.profile_id,
        filters=CategoryContentListFilters(
            content_type=content_type,
            difficulty=difficulty,
            status=status,
            topic_slug=topic,
            search=search,
            page=page,
            page_size=page_size,
            sort=sort,
        ),
    )
    return CategoryContentListResponse.model_validate(
        {
            "items": result.items,
            "pagination": {
                "page": result.page,
                "page_size": result.page_size,
                "total_items": result.total_items,
                "total_pages": result.total_pages,
            },
        },
        from_attributes=True,
    )
