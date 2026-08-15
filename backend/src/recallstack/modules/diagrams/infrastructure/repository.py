from collections.abc import Sequence
from typing import Any, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .sqlalchemy_models import DiagramModel


class SqlAlchemyDiagramRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_owned(self, owner_id: UUID) -> Sequence[DiagramModel]:
        return (
            await self._session.scalars(
                select(DiagramModel)
                .where(DiagramModel.owner_id == owner_id)
                .order_by(DiagramModel.updated_at.desc(), DiagramModel.id)
            )
        ).all()

    async def get_owned(
        self, diagram_id: UUID, owner_id: UUID, *, for_update: bool = False
    ) -> DiagramModel | None:
        query = select(DiagramModel).where(
            DiagramModel.id == diagram_id, DiagramModel.owner_id == owner_id
        )
        if for_update:
            query = query.with_for_update()
        return cast(DiagramModel | None, await self._session.scalar(query))

    def add(
        self,
        *,
        diagram_id: UUID,
        owner_id: UUID,
        title: str,
        schema_version: int,
        document_json: dict[str, Any],
    ) -> DiagramModel:
        model = DiagramModel(
            id=diagram_id,
            owner_id=owner_id,
            title=title,
            schema_version=schema_version,
            document_json=document_json,
            revision=1,
        )
        self._session.add(model)
        return model

    async def delete_owned(self, diagram_id: UUID, owner_id: UUID) -> bool:
        model = await self.get_owned(diagram_id, owner_id, for_update=True)
        if model is None:
            return False
        await self._session.delete(model)
        return True
