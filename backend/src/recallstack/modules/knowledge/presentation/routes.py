from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request

from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency
from recallstack.modules.knowledge.application.events import EventService
from recallstack.modules.knowledge.application.feed import FeedService
from recallstack.modules.knowledge.application.preferences import PreferenceService
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
    StoryResponse,
)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("/feed", response_model=FeedResponse, operation_id="getKnowledgeFeed")
async def feed(
    request: Request,
    current_user: CurrentUserDependency,
    limit: Annotated[int | None, Query(ge=1, le=50)] = None,
    cursor: Annotated[str | None, Query(min_length=1, max_length=2048)] = None,
    topic: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
) -> FeedResponse:
    service = cast(FeedService, request.app.state.knowledge_feed_service)
    result = await service.query(current_user.profile_id, limit=limit, cursor=cursor, topic=topic)
    return FeedResponse.model_validate(result)


@router.get("/stories/{storyId}", response_model=StoryResponse, operation_id="getKnowledgeStory")
async def story(
    story_id: Annotated[UUID, Path(alias="storyId")],
    request: Request,
    current_user: CurrentUserDependency,
) -> StoryResponse:
    service = cast(FeedService, request.app.state.knowledge_feed_service)
    return StoryResponse.model_validate(await service.story(story_id))


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
