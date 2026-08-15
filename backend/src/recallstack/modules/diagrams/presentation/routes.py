from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status

from recallstack.modules.diagrams.application import DiagramService
from recallstack.modules.identity.presentation.dependencies import CurrentUserDependency

from .schemas import (
    DiagramCreateRequest,
    DiagramDuplicateRequest,
    DiagramRenameRequest,
    DiagramResponse,
    DiagramSummaryResponse,
    DiagramUpdateRequest,
)

router = APIRouter(prefix="/diagrams", tags=["diagrams"])


def get_diagram_service(request: Request) -> DiagramService:
    return cast(DiagramService, request.app.state.diagram_service)


DiagramServiceDependency = Annotated[DiagramService, Depends(get_diagram_service)]


@router.get("", response_model=list[DiagramSummaryResponse], operation_id="listDiagrams")
async def list_diagrams(
    current_user: CurrentUserDependency, service: DiagramServiceDependency
) -> list[DiagramSummaryResponse]:
    return [
        DiagramSummaryResponse.from_model(model)
        for model in await service.list(current_user.profile_id)
    ]


@router.post(
    "",
    response_model=DiagramResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="createDiagram",
)
async def create_diagram(
    payload: DiagramCreateRequest,
    current_user: CurrentUserDependency,
    service: DiagramServiceDependency,
) -> DiagramResponse:
    model = await service.create(
        diagram_id=payload.id,
        owner_id=current_user.profile_id,
        title=payload.title,
        schema_version=payload.schema_version,
        document_json=payload.document_json,
    )
    return DiagramResponse.from_model(model)


@router.get("/{diagram_id}", response_model=DiagramResponse, operation_id="getDiagram")
async def get_diagram(
    diagram_id: UUID,
    current_user: CurrentUserDependency,
    service: DiagramServiceDependency,
) -> DiagramResponse:
    return DiagramResponse.from_model(await service.get(diagram_id, current_user.profile_id))


@router.put("/{diagram_id}", response_model=DiagramResponse, operation_id="updateDiagram")
async def update_diagram(
    diagram_id: UUID,
    payload: DiagramUpdateRequest,
    current_user: CurrentUserDependency,
    service: DiagramServiceDependency,
) -> DiagramResponse:
    model = await service.update(
        diagram_id=diagram_id,
        owner_id=current_user.profile_id,
        title=payload.title,
        schema_version=payload.schema_version,
        document_json=payload.document_json,
        expected_revision=payload.expected_revision,
    )
    return DiagramResponse.from_model(model)


@router.patch("/{diagram_id}", response_model=DiagramResponse, operation_id="renameDiagram")
async def rename_diagram(
    diagram_id: UUID,
    payload: DiagramRenameRequest,
    current_user: CurrentUserDependency,
    service: DiagramServiceDependency,
) -> DiagramResponse:
    return DiagramResponse.from_model(
        await service.rename(
            diagram_id=diagram_id,
            owner_id=current_user.profile_id,
            title=payload.title,
            expected_revision=payload.expected_revision,
        )
    )


@router.post(
    "/{diagram_id}/duplicate",
    response_model=DiagramResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="duplicateDiagram",
)
async def duplicate_diagram(
    diagram_id: UUID,
    payload: DiagramDuplicateRequest,
    current_user: CurrentUserDependency,
    service: DiagramServiceDependency,
) -> DiagramResponse:
    return DiagramResponse.from_model(
        await service.duplicate(
            diagram_id=diagram_id, owner_id=current_user.profile_id, title=payload.title
        )
    )


@router.delete(
    "/{diagram_id}", status_code=status.HTTP_204_NO_CONTENT, operation_id="deleteDiagram"
)
async def delete_diagram(
    diagram_id: UUID,
    current_user: CurrentUserDependency,
    service: DiagramServiceDependency,
) -> Response:
    await service.delete(diagram_id, current_user.profile_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
