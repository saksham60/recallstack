from copy import deepcopy
from typing import Any
from uuid import UUID, uuid4

from recallstack.modules.diagrams.infrastructure.repository import SqlAlchemyDiagramRepository
from recallstack.modules.diagrams.infrastructure.sqlalchemy_models import DiagramModel
from recallstack.shared.database import DatabaseSessionFactory
from recallstack.shared.errors import AppError


class DiagramService:
    def __init__(self, session_factory: DatabaseSessionFactory[Any]) -> None:
        self._session_factory = session_factory

    @staticmethod
    def _not_found() -> AppError:
        return AppError(
            error_type="diagram-not-found",
            title="Diagram not found",
            status=404,
            detail="The requested diagram was not found",
        )

    @staticmethod
    def _conflict(current_revision: int) -> AppError:
        return AppError(
            error_type="diagram-revision-conflict",
            title="Diagram changed elsewhere",
            status=409,
            detail=f"The diagram is now at revision {current_revision}; reload or save a copy.",
        )

    @staticmethod
    def _validate_document(
        diagram_id: UUID, schema_version: int, document_json: dict[str, Any]
    ) -> dict[str, Any]:
        document = deepcopy(document_json)
        if document.get("id") != str(diagram_id):
            raise AppError(
                error_type="diagram-document-id-mismatch",
                title="Invalid diagram document",
                status=422,
                detail="The document ID must match the diagram resource ID",
            )
        if document.get("schemaVersion") != schema_version:
            raise AppError(
                error_type="diagram-schema-version-mismatch",
                title="Invalid diagram document",
                status=422,
                detail="schema_version must match document_json.schemaVersion",
            )
        return document

    async def list(self, owner_id: UUID) -> list[DiagramModel]:
        session = self._session_factory.create_session()
        try:
            return list(await SqlAlchemyDiagramRepository(session).list_owned(owner_id))
        finally:
            await session.close()

    async def get(self, diagram_id: UUID, owner_id: UUID) -> DiagramModel:
        session = self._session_factory.create_session()
        try:
            model = await SqlAlchemyDiagramRepository(session).get_owned(diagram_id, owner_id)
            if model is None:
                raise self._not_found()
            return model
        finally:
            await session.close()

    async def create(
        self,
        *,
        diagram_id: UUID,
        owner_id: UUID,
        title: str,
        schema_version: int,
        document_json: dict[str, Any],
    ) -> DiagramModel:
        session = self._session_factory.create_session()
        try:
            repository = SqlAlchemyDiagramRepository(session)
            existing = await repository.get_owned(diagram_id, owner_id)
            if existing is not None:
                raise AppError(
                    error_type="diagram-id-conflict",
                    title="Diagram already exists",
                    status=409,
                    detail="A diagram with this ID already exists",
                )
            model = repository.add(
                diagram_id=diagram_id,
                owner_id=owner_id,
                title=title,
                schema_version=schema_version,
                document_json=self._validate_document(diagram_id, schema_version, document_json),
            )
            await session.commit()
            await session.refresh(model)
            return model
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def update(
        self,
        *,
        diagram_id: UUID,
        owner_id: UUID,
        title: str,
        schema_version: int,
        document_json: dict[str, Any],
        expected_revision: int,
    ) -> DiagramModel:
        session = self._session_factory.create_session()
        try:
            model = await SqlAlchemyDiagramRepository(session).get_owned(
                diagram_id, owner_id, for_update=True
            )
            if model is None:
                raise self._not_found()
            if model.revision != expected_revision:
                raise self._conflict(model.revision)
            model.title = title
            model.schema_version = schema_version
            model.document_json = self._validate_document(diagram_id, schema_version, document_json)
            model.revision += 1
            await session.commit()
            await session.refresh(model)
            return model
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async def rename(
        self,
        *,
        diagram_id: UUID,
        owner_id: UUID,
        title: str,
        expected_revision: int,
    ) -> DiagramModel:
        model = await self.get(diagram_id, owner_id)
        document = deepcopy(model.document_json)
        document["title"] = title
        return await self.update(
            diagram_id=diagram_id,
            owner_id=owner_id,
            title=title,
            schema_version=model.schema_version,
            document_json=document,
            expected_revision=expected_revision,
        )

    async def duplicate(
        self, *, diagram_id: UUID, owner_id: UUID, title: str | None
    ) -> DiagramModel:
        source = await self.get(diagram_id, owner_id)
        next_id = uuid4()
        next_title = title.strip() if title and title.strip() else f"{source.title} Copy"
        document = deepcopy(source.document_json)
        document["id"] = str(next_id)
        document["title"] = next_title
        document["revision"] = 0
        return await self.create(
            diagram_id=next_id,
            owner_id=owner_id,
            title=next_title,
            schema_version=source.schema_version,
            document_json=document,
        )

    async def delete(self, diagram_id: UUID, owner_id: UUID) -> None:
        session = self._session_factory.create_session()
        try:
            removed = await SqlAlchemyDiagramRepository(session).delete_owned(diagram_id, owner_id)
            if not removed:
                raise self._not_found()
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
