from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request, status

from recallstack.modules.admin.application.content_management import (
    AdminContentService,
    CreateContent,
    DocumentBlock,
    PracticeResourceInput,
    TopicAssignment,
    UpdateDocument,
)
from recallstack.modules.admin.presentation.schemas import (
    ArchivedContentResponse,
    ArchiveRequest,
    CreateContentRequest,
    CreatedContentResponse,
    CreatedDraftResponse,
    DocumentUpdateRequest,
    PaginationResponse,
    PracticeResourceResponse,
    PracticeResourceSetResponse,
    PublishedVersionResponse,
    PublishRequest,
    ReplacePracticeResourcesRequest,
    RequiredReasonTransitionRequest,
    TransitionRequest,
    VersionListResponse,
    VersionResponse,
)
from recallstack.modules.identity.presentation.dependencies import (
    AdminUserDependency,
    ContentEditorDependency,
)

router = APIRouter(prefix="/admin", tags=["admin-content"])


def get_admin_content_service(request: Request) -> AdminContentService:
    return cast(AdminContentService, request.app.state.admin_content_service)


AdminContentServiceDependency = Annotated[AdminContentService, Depends(get_admin_content_service)]


@router.post(
    "/content",
    response_model=CreatedContentResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="adminCreateContent",
)
async def create_content(
    payload: CreateContentRequest,
    current_user: ContentEditorDependency,
    service: AdminContentServiceDependency,
) -> CreatedContentResponse:
    result = await service.create_content(
        actor_id=current_user.profile_id,
        command=CreateContent(payload.domain_id, payload.slug, payload.type, payload.difficulty),
    )
    return CreatedContentResponse(
        content_item_id=result.content_item_id,
        draft_version_id=result.draft_version_id,
        domain_id=result.domain_id,
        slug=result.slug,
        type=result.content_type,
        difficulty=result.difficulty,
        version_number=result.version_number,
        version_status=result.version_status,
    )


@router.get(
    "/content/{contentId}/versions",
    response_model=VersionListResponse,
    operation_id="adminListContentVersions",
)
async def list_versions(
    content_id: Annotated[UUID, Path(alias="contentId")],
    current_user: ContentEditorDependency,
    service: AdminContentServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> VersionListResponse:
    del current_user
    result = await service.list_versions(content_item_id=content_id, page=page, page_size=page_size)
    return VersionListResponse(
        items=[VersionResponse.model_validate(item, from_attributes=True) for item in result.items],
        pagination=PaginationResponse.create(
            page=result.page, page_size=result.page_size, total_items=result.total_items
        ),
    )


@router.post(
    "/content/{contentId}/versions",
    response_model=CreatedDraftResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="adminCreateContentVersion",
)
async def create_version(
    content_id: Annotated[UUID, Path(alias="contentId")],
    current_user: ContentEditorDependency,
    service: AdminContentServiceDependency,
) -> CreatedDraftResponse:
    result = await service.create_draft(
        content_item_id=content_id, actor_id=current_user.profile_id
    )
    return CreatedDraftResponse.model_validate(result, from_attributes=True)


@router.put(
    "/content-versions/{versionId}/document",
    response_model=VersionResponse,
    operation_id="adminUpdateContentDocument",
)
async def update_document(
    version_id: Annotated[UUID, Path(alias="versionId")],
    payload: DocumentUpdateRequest,
    current_user: ContentEditorDependency,
    service: AdminContentServiceDependency,
) -> VersionResponse:
    result = await service.update_document(
        version_id=version_id,
        actor_id=current_user.profile_id,
        command=UpdateDocument(
            payload.expected_row_version,
            payload.title,
            payload.summary,
            tuple(
                DocumentBlock(block.type, block.heading, block.payload) for block in payload.blocks
            ),
            tuple(payload.category_ids),
            tuple(
                TopicAssignment(topic.topic_id, topic.is_primary, topic.sort_order)
                for topic in payload.topics
            ),
        ),
    )
    return VersionResponse.model_validate(result, from_attributes=True)


@router.put(
    "/content/{contentId}/practice-resources",
    response_model=PracticeResourceSetResponse,
    operation_id="adminReplacePracticeResources",
)
async def replace_practice_resources(
    content_id: Annotated[UUID, Path(alias="contentId")],
    payload: ReplacePracticeResourcesRequest,
    current_user: ContentEditorDependency,
    service: AdminContentServiceDependency,
) -> PracticeResourceSetResponse:
    result = await service.replace_practice_resources(
        content_item_id=content_id,
        actor_id=current_user.profile_id,
        expected_revision=payload.expected_revision,
        resources=tuple(
            PracticeResourceInput(
                resource.id,
                resource.provider_id,
                resource.external_key,
                str(resource.url),
                resource.title,
                resource.is_primary,
                resource.sort_order,
            )
            for resource in payload.resources
        ),
    )
    return PracticeResourceSetResponse(
        content_item_id=result.content_item_id,
        revision=result.revision,
        resources=[
            PracticeResourceResponse.model_validate(resource, from_attributes=True)
            for resource in result.resources
        ],
    )


@router.post(
    "/content-versions/{versionId}/submit-review",
    response_model=VersionResponse,
    operation_id="adminSubmitContentReview",
)
async def submit_review(
    version_id: Annotated[UUID, Path(alias="versionId")],
    payload: TransitionRequest,
    current_user: ContentEditorDependency,
    service: AdminContentServiceDependency,
) -> VersionResponse:
    result = await service.submit_review(
        version_id=version_id,
        actor_id=current_user.profile_id,
        expected_row_version=payload.expected_row_version,
        reason=payload.reason,
    )
    return VersionResponse.model_validate(result, from_attributes=True)


@router.post(
    "/content-versions/{versionId}/return-draft",
    response_model=VersionResponse,
    operation_id="adminReturnContentToDraft",
)
async def return_to_draft(
    version_id: Annotated[UUID, Path(alias="versionId")],
    payload: RequiredReasonTransitionRequest,
    current_user: AdminUserDependency,
    service: AdminContentServiceDependency,
) -> VersionResponse:
    result = await service.return_to_draft(
        version_id=version_id,
        actor_id=current_user.profile_id,
        expected_row_version=payload.expected_row_version,
        reason=payload.reason,
    )
    return VersionResponse.model_validate(result, from_attributes=True)


@router.post(
    "/content-versions/{versionId}/publish",
    response_model=PublishedVersionResponse,
    operation_id="adminPublishContentVersion",
)
async def publish_version(
    version_id: Annotated[UUID, Path(alias="versionId")],
    payload: PublishRequest,
    current_user: AdminUserDependency,
    service: AdminContentServiceDependency,
) -> PublishedVersionResponse:
    result = await service.publish(
        version_id=version_id,
        actor_id=current_user.profile_id,
        expected_row_version=payload.expected_row_version,
        reason=payload.reason,
    )
    return PublishedVersionResponse.model_validate(result, from_attributes=True)


@router.post(
    "/content/{contentId}/archive",
    response_model=ArchivedContentResponse,
    operation_id="adminArchiveContent",
)
async def archive_content(
    content_id: Annotated[UUID, Path(alias="contentId")],
    payload: ArchiveRequest,
    current_user: AdminUserDependency,
    service: AdminContentServiceDependency,
) -> ArchivedContentResponse:
    result = await service.archive(
        content_item_id=content_id,
        actor_id=current_user.profile_id,
        reason=payload.reason,
    )
    return ArchivedContentResponse.model_validate(result, from_attributes=True)
