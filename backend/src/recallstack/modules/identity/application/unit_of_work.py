from types import TracebackType
from typing import Protocol, Self

from recallstack.modules.identity.domain.repository_ports import ProfileRepository, RoleRepository


class IdentityUnitOfWork(Protocol):
    profiles: ProfileRepository
    roles: RoleRepository

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None: ...

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...
