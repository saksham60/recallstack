from typing import Annotated, cast

from fastapi import APIRouter, Path, Request, Response

from recallstack.modules.content.application.published_study_note import (
    PublishedStudyNoteService,
)
from recallstack.modules.content.presentation.study_note_schemas import PublishedStudyNoteResponse
from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency

router = APIRouter(prefix="/content", tags=["content"])


@router.get(
    "/{slug}",
    response_model=PublishedStudyNoteResponse,
    operation_id="getPublishedStudyNote",
)
async def get_published_study_note(
    slug: Annotated[str, Path(min_length=1, max_length=160)],
    current_user: CurrentUserDependency,
    request: Request,
    response: Response,
) -> PublishedStudyNoteResponse:
    service = cast(PublishedStudyNoteService, request.app.state.published_study_note_service)
    note = await service.query(slug=slug, profile_id=current_user.profile_id)
    response.headers["ETag"] = (
        f'W/"content-{note.content_item_id}-version-{note.published_version_number}"'
    )
    response.headers["Cache-Control"] = "private, no-cache"
    return PublishedStudyNoteResponse.model_validate(note, from_attributes=True)
