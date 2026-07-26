from math import ceil
from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Request

from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency
from recallstack.modules.sync.application.sync_service import (
    ChangeFeed,
    FullResyncSnapshot,
    MutationCommand,
    MutationResult,
    SyncService,
)
from recallstack.modules.sync.presentation.schemas import (
    CatalogFullResyncResponse,
    ChangeFeedResponse,
    ChangeResponse,
    DeviceListResponse,
    DeviceRegisterRequest,
    DeviceResponse,
    FullResyncAckRequest,
    FullResyncAckResponse,
    FullResyncRequest,
    MutationBatchRequest,
    MutationBatchResponse,
    MutationEnvelope,
    MutationRequest,
    MutationResponse,
    PaginationResponse,
    UserFullResyncResponse,
)

router = APIRouter(tags=["sync"])


def get_sync_service(request: Request) -> SyncService:
    return cast(SyncService, request.app.state.sync_service)


SyncServiceDependency = Annotated[SyncService, Depends(get_sync_service)]


def _command(device_id: UUID, item: MutationRequest) -> MutationCommand:
    return MutationCommand(
        item.mutation_id,
        device_id,
        item.entity_type,
        item.entity_id,
        item.operation,
        item.base_row_version,
        item.payload,
    )


def _mutation_response(result: MutationResult) -> MutationResponse:
    return MutationResponse.model_validate(result, from_attributes=True)


def _catalog_snapshot_response(snapshot: FullResyncSnapshot) -> CatalogFullResyncResponse:
    data = snapshot
    return CatalogFullResyncResponse(
        snapshot_id=data.snapshot_id,
        domain_id=cast(UUID, data.domain_id),
        domain_slug=cast(str, data.domain_slug),
        snapshot_cursor=data.snapshot_cursor,
        generated_at=data.generated_at,
        expires_at=data.expires_at,
        categories=cast(list[dict[str, object]], data.payload["categories"]),
        content_items=cast(list[dict[str, object]], data.payload["content_items"]),
        content_documents=cast(list[dict[str, object]], data.payload["content_documents"]),
    )


def _user_snapshot_response(snapshot: FullResyncSnapshot) -> UserFullResyncResponse:
    data = snapshot
    return UserFullResyncResponse(
        snapshot_id=data.snapshot_id,
        snapshot_cursor=data.snapshot_cursor,
        generated_at=data.generated_at,
        expires_at=data.expires_at,
        progress=cast(list[dict[str, object]], data.payload["progress"]),
        bookmarks=cast(list[dict[str, object]], data.payload["bookmarks"]),
        notes=cast(list[dict[str, object]], data.payload["notes"]),
        review_cards=cast(list[dict[str, object]], data.payload["review_cards"]),
    )


def _feed_response(feed: ChangeFeed) -> ChangeFeedResponse:
    return ChangeFeedResponse(
        changes=[
            ChangeResponse.model_validate(item, from_attributes=True) for item in feed.changes
        ],
        after=feed.after,
        next_cursor=feed.next_cursor,
        has_more=feed.has_more,
        full_resync_required=feed.full_resync_required,
    )


@router.post("/devices/register", response_model=DeviceResponse, operation_id="registerDevice")
async def register_device(
    payload: DeviceRegisterRequest,
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
) -> DeviceResponse:
    device = await service.register_device(
        profile_id=current_user.profile_id,
        device_name=payload.device_name,
        platform=payload.platform,
        app_version=payload.app_version,
    )
    return DeviceResponse.model_validate(device, from_attributes=True)


@router.get("/me/devices", response_model=DeviceListResponse, operation_id="listDevices")
async def list_devices(
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> DeviceListResponse:
    result = await service.list_devices(
        profile_id=current_user.profile_id, page=page, page_size=page_size
    )
    return DeviceListResponse(
        items=[DeviceResponse.model_validate(item, from_attributes=True) for item in result.items],
        pagination=PaginationResponse(
            page=result.page,
            page_size=result.page_size,
            total_items=result.total_items,
            total_pages=ceil(result.total_items / result.page_size) if result.total_items else 0,
        ),
    )


@router.post(
    "/devices/{deviceId}/revoke", response_model=DeviceResponse, operation_id="revokeDevice"
)
async def revoke_device(
    device_id: Annotated[UUID, Path(alias="deviceId")],
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
) -> DeviceResponse:
    device = await service.revoke_device(profile_id=current_user.profile_id, device_id=device_id)
    return DeviceResponse.model_validate(device, from_attributes=True)


@router.post("/sync/mutations", response_model=MutationResponse, operation_id="applySyncMutation")
async def apply_mutation(
    payload: MutationEnvelope,
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
) -> MutationResponse:
    result = await service.process_mutation(
        profile_id=current_user.profile_id,
        command=_command(payload.device_id, payload.mutation),
    )
    return _mutation_response(result)


@router.post(
    "/sync/mutations/batch",
    response_model=MutationBatchResponse,
    operation_id="applySyncMutationBatch",
)
async def apply_mutation_batch(
    payload: MutationBatchRequest,
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
) -> MutationBatchResponse:
    results = await service.process_batch(
        profile_id=current_user.profile_id,
        commands=tuple(_command(payload.device_id, item) for item in payload.mutations),
    )
    return MutationBatchResponse(
        results=[_mutation_response(item) for item in results],
        applied_count=sum(item.status == "applied" for item in results),
        rejected_count=sum(item.status == "rejected" for item in results),
        duplicate_count=sum(item.status == "duplicate" for item in results),
        conflict_count=sum(item.status == "conflict" for item in results),
    )


@router.get("/sync/user", response_model=ChangeFeedResponse, operation_id="pullUserChanges")
async def pull_user_changes(
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
    device_id: Annotated[UUID, Query()],
    after: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> ChangeFeedResponse:
    return _feed_response(
        await service.user_changes(
            profile_id=current_user.profile_id,
            device_id=device_id,
            after=after,
            limit=limit,
        )
    )


@router.get(
    "/sync/catalog/{domainId}",
    response_model=ChangeFeedResponse,
    operation_id="pullCatalogChanges",
)
async def pull_catalog_changes(
    domain_id: Annotated[UUID, Path(alias="domainId")],
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
    device_id: Annotated[UUID, Query()],
    after: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> ChangeFeedResponse:
    return _feed_response(
        await service.catalog_changes(
            profile_id=current_user.profile_id,
            device_id=device_id,
            domain_id=domain_id,
            after=after,
            limit=limit,
        )
    )


@router.post(
    "/sync/catalog/{domainId}/full-resync",
    response_model=CatalogFullResyncResponse,
    operation_id="createCatalogFullResync",
)
async def create_catalog_full_resync(
    domain_id: Annotated[UUID, Path(alias="domainId")],
    payload: FullResyncRequest,
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
) -> CatalogFullResyncResponse:
    return _catalog_snapshot_response(
        await service.catalog_full_resync(
            profile_id=current_user.profile_id,
            device_id=payload.device_id,
            domain_id=domain_id,
        )
    )


@router.post(
    "/sync/catalog/{domainId}/full-resync/ack",
    response_model=FullResyncAckResponse,
    operation_id="acknowledgeCatalogFullResync",
)
async def acknowledge_catalog_full_resync(
    domain_id: Annotated[UUID, Path(alias="domainId")],
    payload: FullResyncAckRequest,
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
) -> FullResyncAckResponse:
    result = await service.acknowledge_full_resync(
        profile_id=current_user.profile_id,
        device_id=payload.device_id,
        snapshot_id=payload.snapshot_id,
        snapshot_cursor=payload.snapshot_cursor,
        stream_type="catalog",
        domain_id=domain_id,
    )
    return FullResyncAckResponse.model_validate(result, from_attributes=True)


@router.post(
    "/sync/user/full-resync",
    response_model=UserFullResyncResponse,
    operation_id="createUserFullResync",
)
async def create_user_full_resync(
    payload: FullResyncRequest,
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
) -> UserFullResyncResponse:
    return _user_snapshot_response(
        await service.user_full_resync(
            profile_id=current_user.profile_id,
            device_id=payload.device_id,
        )
    )


@router.post(
    "/sync/user/full-resync/ack",
    response_model=FullResyncAckResponse,
    operation_id="acknowledgeUserFullResync",
)
async def acknowledge_user_full_resync(
    payload: FullResyncAckRequest,
    current_user: CurrentUserDependency,
    service: SyncServiceDependency,
) -> FullResyncAckResponse:
    result = await service.acknowledge_full_resync(
        profile_id=current_user.profile_id,
        device_id=payload.device_id,
        snapshot_id=payload.snapshot_id,
        snapshot_cursor=payload.snapshot_cursor,
        stream_type="user",
    )
    return FullResyncAckResponse.model_validate(result, from_attributes=True)
