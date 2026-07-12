from typing import cast

from fastapi import APIRouter, Request

from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency
from recallstack.modules.practice.application.attempt_submission import (
    PracticeAttemptService,
    SubmitPracticeAttempt,
)
from recallstack.modules.practice.presentation.schemas import (
    PracticeAttemptRequest,
    PracticeAttemptResponse,
)

router = APIRouter(prefix="/practice", tags=["practice"])


@router.post(
    "/attempts",
    response_model=PracticeAttemptResponse,
    operation_id="submitPracticeAttempt",
)
async def submit_practice_attempt(
    payload: PracticeAttemptRequest,
    current_user: CurrentUserDependency,
    request: Request,
) -> PracticeAttemptResponse:
    service = cast(PracticeAttemptService, request.app.state.practice_attempt_service)
    result = await service.submit(
        profile_id=current_user.profile_id,
        command=SubmitPracticeAttempt(
            attempt_event_id=payload.attempt_event_id,
            content_item_id=payload.content_item_id,
            practice_resource_id=payload.practice_resource_id,
            outcome=payload.outcome,
            duration_seconds=payload.duration_seconds,
            hint_used=payload.hint_used,
            confidence_before=payload.confidence_before,
            confidence_after=payload.confidence_after,
            attempted_at=payload.attempted_at,
        ),
    )
    return PracticeAttemptResponse.model_validate(result, from_attributes=True)
