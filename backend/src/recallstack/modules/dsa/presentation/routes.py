from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Query, Response
from pydantic import AwareDatetime

from recallstack.modules.content.infrastructure.sqlalchemy_models import DifficultyLevel
from recallstack.modules.dsa.application.cursor import invalid_request
from recallstack.modules.dsa.presentation.dependencies import DsaRoute, Learning, Preview, Service
from recallstack.modules.dsa.presentation.schemas import (
    BookmarkCreate,
    BookmarkWriteResponse,
    CapabilitiesResponse,
    CatalogResponse,
    DsaNoteResponse,
    DsaProgressResponse,
    NoteCreate,
    PracticeHistoryResponse,
    ProblemDetail,
    ProblemError,
    ProgressPatch,
    StatisticsResponse,
    TaxonomyResponse,
    TestCasesResponse,
)
from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency
from recallstack.modules.learning.presentation.routes import _pagination
from recallstack.modules.learning.presentation.schemas import (
    BookmarkListResponse,
    BookmarkResponse,
    NoteDeleteRequest,
    NoteListResponse,
    NotePatchRequest,
    NoteResponse,
    ProgressListResponse,
    ProgressResponse,
)

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    code: {
        "description": description,
        "content": {"application/problem+json": {"schema": ProblemError.model_json_schema()}},
    }
    for code, description in {
        401: "Authentication required",
        403: "Preview role required",
        404: "Resource not accessible",
        409: "Stale learner state",
        422: "Invalid request or progress transition",
        500: "Internal error",
        503: "Data dependency unavailable or timed out",
    }.items()
}
router = APIRouter(prefix="/dsa", tags=["dsa"], route_class=DsaRoute, responses=ERROR_RESPONSES)
Limit = Annotated[int, Query(ge=1, le=50)]
Cursor = Annotated[str | None, Query(max_length=2048)]
Page = Annotated[int, Query(ge=1, le=1000)]


@router.get("/problems", response_model=CatalogResponse, operation_id="listDsaProblems")
async def catalog(
    service: Service,
    preview: Preview,
    search: Annotated[str | None, Query(max_length=200)] = None,
    difficulty: DifficultyLevel | None = None,
    category: UUID | None = None,
    topic: UUID | None = None,
    cursor: Cursor = None,
    limit: Limit = 20,
    sort: Literal["title_asc"] = "title_asc",
) -> CatalogResponse:
    filters = {
        "search": (search.strip().lower() or None) if search else None,
        "difficulty": difficulty.value if difficulty else None,
        "category": str(category) if category else None,
        "topic": str(topic) if topic else None,
        "sort": sort,
    }
    return CatalogResponse.model_validate(await service.catalog(filters, cursor, limit, preview))


@router.get(
    "/problems/{problem_id}",
    response_model=ProblemDetail,
    response_model_exclude_unset=True,
    operation_id="getDsaProblem",
)
async def detail(
    problem_id: UUID,
    service: Service,
    preview: Preview,
    problem_version_id: UUID | None = None,
) -> ProblemDetail:
    return ProblemDetail.model_validate(
        await service.detail(problem_id, preview, problem_version_id)
    )


@router.get(
    "/problems/{problem_id}/test-cases",
    response_model=TestCasesResponse,
    operation_id="listDsaPublicTestCases",
)
async def test_cases(
    problem_id: UUID,
    service: Service,
    preview: Preview,
    problem_version_id: UUID | None = None,
    cursor: Cursor = None,
    limit: Limit = 20,
) -> TestCasesResponse:
    return TestCasesResponse.model_validate(
        await service.tests(problem_id, preview, problem_version_id, cursor, limit)
    )


@router.get("/categories", response_model=TaxonomyResponse, operation_id="listDsaCategories")
async def categories(service: Service, preview: Preview) -> TaxonomyResponse:
    return TaxonomyResponse.model_validate(await service.metadata("categories", preview))


@router.get("/topics", response_model=TaxonomyResponse, operation_id="listDsaTopics")
async def topics(service: Service, preview: Preview) -> TaxonomyResponse:
    return TaxonomyResponse.model_validate(await service.metadata("topics", preview))


@router.get("/capabilities", response_model=CapabilitiesResponse, operation_id="getDsaCapabilities")
async def capabilities(service: Service) -> CapabilitiesResponse:
    return CapabilitiesResponse.model_validate(await service.capabilities())


@router.get("/me/progress", response_model=ProgressListResponse, operation_id="listMyDsaProgress")
async def list_progress(
    user: CurrentUserDependency,
    learning: Learning,
    page: Page = 1,
    page_size: Limit = 20,
) -> ProgressListResponse:
    result = await learning.list_progress(
        profile_id=user.profile_id, page=page, page_size=page_size
    )
    return ProgressListResponse(
        items=[ProgressResponse.model_validate(r, from_attributes=True) for r in result.items],
        pagination=_pagination(result),
    )


@router.get(
    "/me/problems/{problem_id}/progress",
    response_model=DsaProgressResponse,
    operation_id="getMyDsaProgress",
)
async def get_progress(
    problem_id: UUID,
    user: CurrentUserDependency,
    learning: Learning,
) -> DsaProgressResponse:
    result = await learning.get_progress(profile_id=user.profile_id, content_item_id=problem_id)
    return DsaProgressResponse.model_validate(result, from_attributes=True)


@router.patch(
    "/me/problems/{problem_id}/progress",
    response_model=DsaProgressResponse,
    operation_id="patchMyDsaProgress",
)
async def patch_progress(
    problem_id: UUID,
    payload: ProgressPatch,
    user: CurrentUserDependency,
    learning: Learning,
) -> DsaProgressResponse:
    current = await learning.get_progress(profile_id=user.profile_id, content_item_id=problem_id)
    result = await learning.save_progress(
        profile_id=user.profile_id,
        content_item_id=problem_id,
        status=payload.status if payload.status is not None else current.status,
        confidence=payload.confidence if payload.confidence is not None else current.confidence,
        expected_row_version=payload.row_version,
    )
    return DsaProgressResponse.model_validate(result, from_attributes=True)


@router.get("/me/bookmarks", response_model=BookmarkListResponse, operation_id="listMyDsaBookmarks")
async def list_bookmarks(
    user: CurrentUserDependency,
    learning: Learning,
    page: Page = 1,
    page_size: Limit = 20,
) -> BookmarkListResponse:
    result = await learning.list_bookmarks(
        profile_id=user.profile_id, page=page, page_size=page_size
    )
    return BookmarkListResponse(
        items=[BookmarkResponse.model_validate(r, from_attributes=True) for r in result.items],
        pagination=_pagination(result),
    )


@router.post(
    "/me/bookmarks", response_model=BookmarkWriteResponse, operation_id="createMyDsaBookmark"
)
async def create_bookmark(
    payload: BookmarkCreate,
    user: CurrentUserDependency,
    learning: Learning,
) -> BookmarkWriteResponse:
    result = await learning.add_bookmark(
        profile_id=user.profile_id, content_item_id=payload.problem_id
    )
    return BookmarkWriteResponse.model_validate(result, from_attributes=True)


@router.delete("/me/bookmarks/{problem_id}", status_code=204, operation_id="deleteMyDsaBookmark")
async def delete_bookmark(
    problem_id: UUID,
    user: CurrentUserDependency,
    learning: Learning,
) -> Response:
    # remove_bookmark deliberately has no content gate in the shared service.
    # The scoped read prevents this wrapper from deleting another domain's state.
    await learning.get_progress(profile_id=user.profile_id, content_item_id=problem_id)
    result = await learning.remove_bookmark(profile_id=user.profile_id, content_item_id=problem_id)
    return Response(
        status_code=204,
        headers={"X-Sync-Cursor": str(result.sync_cursor)}
        if result.sync_cursor is not None
        else {},
    )


@router.get(
    "/me/problems/{problem_id}/notes",
    response_model=NoteListResponse,
    operation_id="listMyDsaProblemNotes",
)
async def list_notes(
    problem_id: UUID,
    user: CurrentUserDependency,
    learning: Learning,
    page: Page = 1,
    page_size: Limit = 20,
) -> NoteListResponse:
    result = await learning.list_notes(
        profile_id=user.profile_id, content_item_id=problem_id, page=page, page_size=page_size
    )
    return NoteListResponse(
        items=[NoteResponse.model_validate(r, from_attributes=True) for r in result.items],
        pagination=_pagination(result),
    )


@router.post(
    "/me/problems/{problem_id}/notes",
    response_model=DsaNoteResponse,
    status_code=201,
    operation_id="createMyDsaProblemNote",
)
async def create_note(
    problem_id: UUID,
    payload: NoteCreate,
    user: CurrentUserDependency,
    learning: Learning,
) -> DsaNoteResponse:
    result = await learning.create_note(
        profile_id=user.profile_id,
        content_item_id=problem_id,
        kind=payload.kind,
        title=payload.title,
        body=payload.body,
    )
    return DsaNoteResponse.model_validate(result, from_attributes=True)


@router.patch("/me/notes/{note_id}", response_model=DsaNoteResponse, operation_id="patchMyDsaNote")
async def patch_note(
    note_id: UUID,
    payload: NotePatchRequest,
    user: CurrentUserDependency,
    learning: Learning,
) -> DsaNoteResponse:
    if ("kind" in payload.model_fields_set and payload.kind is None) or (
        "body" in payload.model_fields_set and payload.body is None
    ):
        raise invalid_request("kind and body cannot be null")
    result = await learning.update_note(
        profile_id=user.profile_id,
        note_id=note_id,
        kind=payload.kind,
        title=payload.title,
        title_is_set="title" in payload.model_fields_set,
        body=payload.body,
        expected_row_version=payload.row_version,
    )
    return DsaNoteResponse.model_validate(result, from_attributes=True)


@router.delete("/me/notes/{note_id}", status_code=204, operation_id="deleteMyDsaNote")
async def delete_note(
    note_id: UUID,
    payload: NoteDeleteRequest,
    user: CurrentUserDependency,
    learning: Learning,
) -> Response:
    result = await learning.delete_note(
        profile_id=user.profile_id, note_id=note_id, expected_row_version=payload.row_version
    )
    return Response(
        status_code=204,
        headers={
            "X-Sync-Cursor": str(result.sync_cursor),
            "X-Row-Version": str(result.row_version),
        },
    )


@router.get(
    "/me/practice-history",
    response_model=PracticeHistoryResponse,
    operation_id="listMyDsaPracticeHistory",
)
async def history(
    user: CurrentUserDependency,
    service: Service,
    cursor: Cursor = None,
    limit: Limit = 20,
    start_at: AwareDatetime | None = None,
    end_at: AwareDatetime | None = None,
) -> PracticeHistoryResponse:
    return PracticeHistoryResponse.model_validate(
        await service.history(user.profile_id, start_at, end_at, cursor, limit)
    )


@router.get("/me/statistics", response_model=StatisticsResponse, operation_id="getMyDsaStatistics")
async def statistics(user: CurrentUserDependency, service: Service) -> StatisticsResponse:
    return StatisticsResponse.model_validate(await service.statistics(user.profile_id))
