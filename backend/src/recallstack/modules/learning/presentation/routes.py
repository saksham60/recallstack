from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, Response, status

from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency
from recallstack.modules.learning.application.learning_state import LearningService, Page
from recallstack.modules.learning.presentation.schemas import (
    BookmarkListResponse,
    BookmarkResponse,
    NoteCreateRequest,
    NoteDeleteRequest,
    NoteListResponse,
    NotePatchRequest,
    NoteResponse,
    PaginationResponse,
    ProgressListResponse,
    ProgressPutRequest,
    ProgressResponse,
)

router = APIRouter(prefix="/me", tags=["learning"])


def _service(request: Request) -> LearningService:
    return cast(LearningService, request.app.state.learning_service)


def _pagination[T](page: Page[T]) -> PaginationResponse:
    return PaginationResponse(
        page=page.page,
        page_size=page.page_size,
        total_items=page.total_items,
        total_pages=page.total_pages,
    )


@router.get("/progress", response_model=ProgressListResponse, operation_id="listMyProgress")
async def list_progress(
    current_user: CurrentUserDependency,
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ProgressListResponse:
    result = await _service(request).list_progress(
        profile_id=current_user.profile_id, page=page, page_size=page_size
    )
    return ProgressListResponse(
        items=[
            ProgressResponse.model_validate(item, from_attributes=True) for item in result.items
        ],
        pagination=_pagination(result),
    )


@router.get("/progress/{contentId}", response_model=ProgressResponse, operation_id="getMyProgress")
async def get_progress(
    content_id: Annotated[UUID, Path(alias="contentId")],
    current_user: CurrentUserDependency,
    request: Request,
) -> ProgressResponse:
    result = await _service(request).get_progress(
        profile_id=current_user.profile_id, content_item_id=content_id
    )
    return ProgressResponse.model_validate(result, from_attributes=True)


@router.put("/progress/{contentId}", response_model=ProgressResponse, operation_id="putMyProgress")
async def put_progress(
    content_id: Annotated[UUID, Path(alias="contentId")],
    payload: ProgressPutRequest,
    current_user: CurrentUserDependency,
    request: Request,
) -> ProgressResponse:
    result = await _service(request).save_progress(
        profile_id=current_user.profile_id,
        content_item_id=content_id,
        status=payload.status,
        confidence=payload.confidence,
        expected_row_version=payload.row_version,
    )
    return ProgressResponse.model_validate(result, from_attributes=True)


@router.get("/bookmarks", response_model=BookmarkListResponse, operation_id="listMyBookmarks")
async def list_bookmarks(
    current_user: CurrentUserDependency,
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> BookmarkListResponse:
    result = await _service(request).list_bookmarks(
        profile_id=current_user.profile_id, page=page, page_size=page_size
    )
    return BookmarkListResponse(
        items=[
            BookmarkResponse.model_validate(item, from_attributes=True) for item in result.items
        ],
        pagination=_pagination(result),
    )


@router.put("/bookmarks/{contentId}", status_code=status.HTTP_204_NO_CONTENT)
async def put_bookmark(
    content_id: Annotated[UUID, Path(alias="contentId")],
    current_user: CurrentUserDependency,
    request: Request,
) -> Response:
    await _service(request).add_bookmark(
        profile_id=current_user.profile_id, content_item_id=content_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/bookmarks/{contentId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bookmark(
    content_id: Annotated[UUID, Path(alias="contentId")],
    current_user: CurrentUserDependency,
    request: Request,
) -> Response:
    await _service(request).remove_bookmark(
        profile_id=current_user.profile_id, content_item_id=content_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/notes", response_model=NoteListResponse, operation_id="listMyNotes")
async def list_notes(
    current_user: CurrentUserDependency,
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> NoteListResponse:
    result = await _service(request).list_notes(
        profile_id=current_user.profile_id, content_item_id=None, page=page, page_size=page_size
    )
    return NoteListResponse(
        items=[NoteResponse.model_validate(item, from_attributes=True) for item in result.items],
        pagination=_pagination(result),
    )


@router.get(
    "/content/{contentId}/notes",
    response_model=NoteListResponse,
    operation_id="listMyContentNotes",
)
async def list_content_notes(
    content_id: Annotated[UUID, Path(alias="contentId")],
    current_user: CurrentUserDependency,
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> NoteListResponse:
    result = await _service(request).list_notes(
        profile_id=current_user.profile_id,
        content_item_id=content_id,
        page=page,
        page_size=page_size,
    )
    return NoteListResponse(
        items=[NoteResponse.model_validate(item, from_attributes=True) for item in result.items],
        pagination=_pagination(result),
    )


@router.post("/notes", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: NoteCreateRequest,
    current_user: CurrentUserDependency,
    request: Request,
) -> NoteResponse:
    result = await _service(request).create_note(
        profile_id=current_user.profile_id,
        content_item_id=payload.content_item_id,
        kind=payload.kind,
        title=payload.title,
        body=payload.body,
    )
    return NoteResponse.model_validate(result, from_attributes=True)


@router.patch("/notes/{noteId}", response_model=NoteResponse)
async def patch_note(
    note_id: Annotated[UUID, Path(alias="noteId")],
    payload: NotePatchRequest,
    current_user: CurrentUserDependency,
    request: Request,
) -> NoteResponse:
    result = await _service(request).update_note(
        profile_id=current_user.profile_id,
        note_id=note_id,
        kind=payload.kind if "kind" in payload.model_fields_set else None,
        title=payload.title,
        title_is_set="title" in payload.model_fields_set,
        body=payload.body if "body" in payload.model_fields_set else None,
        expected_row_version=payload.row_version,
    )
    return NoteResponse.model_validate(result, from_attributes=True)


@router.delete("/notes/{noteId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: Annotated[UUID, Path(alias="noteId")],
    payload: NoteDeleteRequest,
    current_user: CurrentUserDependency,
    request: Request,
) -> Response:
    await _service(request).delete_note(
        profile_id=current_user.profile_id,
        note_id=note_id,
        expected_row_version=payload.row_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
