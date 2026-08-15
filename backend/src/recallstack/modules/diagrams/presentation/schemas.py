from copy import deepcopy
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from recallstack.modules.diagrams.infrastructure.sqlalchemy_models import DiagramModel


class DiagramCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    title: str = Field(min_length=1, max_length=300)
    schema_version: int = Field(ge=1)
    document_json: dict[str, Any]


class DiagramUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=300)
    schema_version: int = Field(ge=1)
    document_json: dict[str, Any]
    expected_revision: int = Field(ge=1)


class DiagramRenameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=300)
    expected_revision: int = Field(ge=1)


class DiagramDuplicateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=300)


class DiagramSummaryResponse(BaseModel):
    id: UUID
    title: str
    schema_version: int
    revision: int
    page_count: int
    element_count: int
    enabled_pack_ids: list[str]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, model: DiagramModel) -> "DiagramSummaryResponse":
        pages = model.document_json.get("pages")
        page_values = list(pages.values()) if isinstance(pages, dict) else []
        return cls(
            id=model.id,
            title=model.title,
            schema_version=model.schema_version,
            revision=model.revision,
            page_count=len(page_values),
            element_count=sum(
                len(page.get("elements", [])) for page in page_values if isinstance(page, dict)
            ),
            enabled_pack_ids=[
                value
                for value in model.document_json.get("enabledPackIds", [])
                if isinstance(value, str)
            ],
            created_at=model.created_at,
            updated_at=model.updated_at,
        )


class DiagramResponse(BaseModel):
    id: UUID
    title: str
    schema_version: int
    document_json: dict[str, Any]
    revision: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, model: DiagramModel) -> "DiagramResponse":
        document = deepcopy(model.document_json)
        document["revision"] = model.revision
        document["title"] = model.title
        document["updatedAt"] = model.updated_at.isoformat()
        document["createdAt"] = model.created_at.isoformat()
        return cls(
            id=model.id,
            title=model.title,
            schema_version=model.schema_version,
            document_json=document,
            revision=model.revision,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
