from copy import deepcopy
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
from fastapi import FastAPI

from recallstack.main import create_app
from recallstack.modules.diagrams.infrastructure.sqlalchemy_models import DiagramModel
from recallstack.modules.diagrams.presentation.routes import get_diagram_service
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings
from recallstack.shared.errors import AppError


class StubDiagramService:
    def __init__(self) -> None:
        self.values: dict[tuple[UUID, UUID], DiagramModel] = {}

    @staticmethod
    def _missing() -> AppError:
        return AppError(
            error_type="diagram-not-found",
            title="Diagram not found",
            status=404,
            detail="The requested diagram was not found",
        )

    async def list(self, owner_id: UUID) -> list[DiagramModel]:
        return [model for (owner, _), model in self.values.items() if owner == owner_id]

    async def get(self, diagram_id: UUID, owner_id: UUID) -> DiagramModel:
        try:
            return self.values[(owner_id, diagram_id)]
        except KeyError as error:
            raise self._missing() from error

    async def create(self, **values: object) -> DiagramModel:
        now = datetime.now(UTC)
        model = DiagramModel(
            id=values["diagram_id"],
            owner_id=values["owner_id"],
            title=values["title"],
            schema_version=values["schema_version"],
            document_json=deepcopy(values["document_json"]),
            revision=1,
            created_at=now,
            updated_at=now,
        )
        self.values[(model.owner_id, model.id)] = model
        return model

    async def update(self, **values: object) -> DiagramModel:
        model = await self.get(values["diagram_id"], values["owner_id"])
        expected = values["expected_revision"]
        if model.revision != expected:
            raise AppError(
                error_type="diagram-revision-conflict",
                title="Diagram changed elsewhere",
                status=409,
                detail=f"The diagram is now at revision {model.revision}; reload or save a copy.",
            )
        model.title = str(values["title"])
        model.schema_version = int(values["schema_version"])
        model.document_json = deepcopy(values["document_json"])
        model.revision += 1
        model.updated_at = datetime.now(UTC)
        return model

    async def rename(self, **values: object) -> DiagramModel:
        model = await self.get(values["diagram_id"], values["owner_id"])
        document = deepcopy(model.document_json)
        document["title"] = values["title"]
        return await self.update(
            diagram_id=model.id,
            owner_id=model.owner_id,
            title=values["title"],
            schema_version=model.schema_version,
            document_json=document,
            expected_revision=values["expected_revision"],
        )

    async def duplicate(self, **values: object) -> DiagramModel:
        source = await self.get(values["diagram_id"], values["owner_id"])
        diagram_id = uuid4()
        document = deepcopy(source.document_json)
        document["id"] = str(diagram_id)
        document["title"] = values.get("title") or f"{source.title} Copy"
        return await self.create(
            diagram_id=diagram_id,
            owner_id=source.owner_id,
            title=document["title"],
            schema_version=source.schema_version,
            document_json=document,
        )

    async def delete(self, diagram_id: UUID, owner_id: UUID) -> None:
        if self.values.pop((owner_id, diagram_id), None) is None:
            raise self._missing()


def document(diagram_id: UUID, title: str = "Payment Platform") -> dict[str, object]:
    now = datetime.now(UTC).isoformat()
    return {
        "schemaVersion": 2,
        "id": str(diagram_id),
        "title": title,
        "revision": 0,
        "enabledPackIds": ["generic", "system-design"],
        "rootPageId": "root",
        "pageOrder": ["root"],
        "pages": {
            "root": {
                "id": "root",
                "name": "Page 1",
                "elements": [],
                "viewport": {"x": 0, "y": 0, "zoom": 1},
            }
        },
        "createdAt": now,
        "updatedAt": now,
    }


def app_for(user: CurrentUser, service: StubDiagramService) -> FastAPI:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_diagram_service] = lambda: service
    return app


async def test_diagram_crud_duplicate_and_optimistic_revision() -> None:
    owner_id = uuid4()
    diagram_id = uuid4()
    service = StubDiagramService()
    app = app_for(CurrentUser(owner_id, owner_id, frozenset({"admin"})), service)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            created = await client.post(
                "/api/v1/diagrams",
                json={
                    "id": str(diagram_id),
                    "title": "Payment Platform",
                    "schema_version": 2,
                    "document_json": document(diagram_id),
                },
            )
            assert created.status_code == 201
            assert created.json()["revision"] == 1
            listed = await client.get("/api/v1/diagrams")
            assert listed.json()[0]["page_count"] == 1
            payload = document(diagram_id, "Payment Platform v2")
            updated = await client.put(
                f"/api/v1/diagrams/{diagram_id}",
                json={
                    "title": "Payment Platform v2",
                    "schema_version": 2,
                    "document_json": payload,
                    "expected_revision": 1,
                },
            )
            assert updated.status_code == 200
            assert updated.json()["revision"] == 2
            stale = await client.put(
                f"/api/v1/diagrams/{diagram_id}",
                json={
                    "title": "Stale",
                    "schema_version": 2,
                    "document_json": payload,
                    "expected_revision": 1,
                },
            )
            assert stale.status_code == 409
            duplicated = await client.post(f"/api/v1/diagrams/{diagram_id}/duplicate", json={})
            assert duplicated.status_code == 201
            assert duplicated.json()["id"] != str(diagram_id)
            deleted = await client.delete(f"/api/v1/diagrams/{duplicated.json()['id']}")
            assert deleted.status_code == 204


async def test_diagram_ownership_is_private_and_indistinguishable_from_missing() -> None:
    owner_id = uuid4()
    stranger_id = uuid4()
    diagram_id = uuid4()
    service = StubDiagramService()
    await service.create(
        diagram_id=diagram_id,
        owner_id=owner_id,
        title="Private",
        schema_version=2,
        document_json=document(diagram_id, "Private"),
    )
    app = app_for(CurrentUser(stranger_id, stranger_id, frozenset({"admin"})), service)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get(f"/api/v1/diagrams/{diagram_id}")
            assert response.status_code == 404
            assert (await client.get("/api/v1/diagrams")).json() == []
