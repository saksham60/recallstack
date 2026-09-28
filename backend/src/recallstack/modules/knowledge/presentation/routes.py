from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request

from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency
from recallstack.modules.knowledge.application.events import EventService
from recallstack.modules.knowledge.application.feed import FeedService
from recallstack.modules.knowledge.application.preferences import PreferenceService
from recallstack.modules.knowledge.application.refresh import RefreshRun, RefreshService
from recallstack.modules.knowledge.domain.entities import (
    PreferencePatch,
    SourcePreference,
    StoryEvent,
    TopicPreference,
)
from recallstack.modules.knowledge.presentation.schemas import (
    EventBatch,
    EventResult,
    FeedResponse,
    PreferencesPatch,
    PreferencesResponse,
    RefreshRunResponse,
    StoryResponse,
)
from recallstack.shared.errors import AppError

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


def _refresh_service(request: Request) -> RefreshService:
    service = cast(RefreshService | None, request.app.state.knowledge_refresh_service)
    if service is None:
        raise AppError(
            error_type="knowledge-refresh-unavailable",
            title="Refresh unavailable",
            status=503,
            detail="New story requests are not configured yet",
        )
    return service


def _refresh_response(service: RefreshService, run: RefreshRun) -> RefreshRunResponse:
    return RefreshRunResponse(
        run_id=run.id,
        status=run.status,
        requested_at=run.requested_at,
        next_allowed_at=run.requested_at + service.cooldown,
    )


@router.get("/feed", response_model=FeedResponse, operation_id="getKnowledgeFeed")
async def feed(
    request: Request,
    current_user: CurrentUserDependency,
    limit: Annotated[int | None, Query(ge=1, le=50)] = None,
    cursor: Annotated[str | None, Query(min_length=1, max_length=2048)] = None,
    topic: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    source: Annotated[
        str | None,
        Query(min_length=1, max_length=80, pattern=r"^[a-z0-9][a-z0-9_-]{0,79}$"),
    ] = None,
) -> FeedResponse:
    service = cast(FeedService, request.app.state.knowledge_feed_service)
    result = await service.query(
        current_user.profile_id,
        limit=limit,
        cursor=cursor,
        topic=topic,
        source=source,
    )
    return FeedResponse.model_validate(result)


@router.get("/stories/{storyId}", response_model=StoryResponse, operation_id="getKnowledgeStory")
async def story(
    story_id: Annotated[UUID, Path(alias="storyId")],
    request: Request,
    current_user: CurrentUserDependency,
) -> StoryResponse:
    service = cast(FeedService, request.app.state.knowledge_feed_service)
    return StoryResponse.model_validate(
        await service.story(story_id, profile_id=current_user.profile_id)
    )


@router.get(
    "/preferences", response_model=PreferencesResponse, operation_id="getKnowledgePreferences"
)
async def preferences(request: Request, current_user: CurrentUserDependency) -> PreferencesResponse:
    service = cast(PreferenceService, request.app.state.knowledge_preference_service)
    return PreferencesResponse.model_validate(await service.get(current_user.profile_id))


@router.patch(
    "/preferences", response_model=PreferencesResponse, operation_id="patchKnowledgePreferences"
)
async def patch_preferences(
    body: PreferencesPatch,
    request: Request,
    current_user: CurrentUserDependency,
) -> PreferencesResponse:
    service = cast(PreferenceService, request.app.state.knowledge_preference_service)
    patch = PreferencePatch(
        body.minimum_importance,
        tuple(TopicPreference(t.topic, t.weight, t.blocked) for t in body.topics)
        if body.topics is not None
        else None,
        tuple(SourcePreference(s.key, s.enabled, s.weight) for s in body.sources)
        if body.sources is not None
        else None,
    )
    return PreferencesResponse.model_validate(await service.patch(current_user.profile_id, patch))


@router.post("/events/batch", response_model=EventResult, operation_id="recordKnowledgeEvents")
async def events(
    body: EventBatch,
    request: Request,
    current_user: CurrentUserDependency,
) -> EventResult:
    service = cast(EventService, request.app.state.knowledge_event_service)
    accepted = await service.record(
        current_user.profile_id,
        tuple(
            StoryEvent(event.event_id, event.story_id, event.type, event.occurred_at)
            for event in body.events
        ),
    )
    return EventResult(accepted=accepted, duplicates=len(body.events) - accepted)


@router.post(
    "/refresh-runs", response_model=RefreshRunResponse, operation_id="startKnowledgeRefresh"
)
async def start_refresh(
    request: Request, current_user: CurrentUserDependency
) -> RefreshRunResponse:
    service = _refresh_service(request)
    run = await service.start(current_user.profile_id)
    return _refresh_response(service, run)


@router.get("/refresh-runs", operation_id="getKnowledgeRefreshAvailability")
async def refresh_availability(
    request: Request, current_user: CurrentUserDependency
) -> dict[str, bool]:
    return {"available": request.app.state.knowledge_refresh_service is not None}


@router.get(
    "/refresh-runs/{runId}", response_model=RefreshRunResponse, operation_id="getKnowledgeRefresh"
)
async def refresh_status(
    run_id: Annotated[UUID, Path(alias="runId")],
    request: Request,
    current_user: CurrentUserDependency,
) -> RefreshRunResponse:
    service = _refresh_service(request)
    return _refresh_response(service, await service.status(run_id))
