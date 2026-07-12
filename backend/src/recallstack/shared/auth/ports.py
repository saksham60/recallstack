from typing import Protocol
from uuid import UUID

from recallstack.shared.auth.current_user import CurrentUser


class IdentityTokenVerifier(Protocol):
    async def verify(self, token: str) -> UUID: ...


class CurrentUserProvider(Protocol):
    async def from_access_token(self, token: str) -> CurrentUser: ...
