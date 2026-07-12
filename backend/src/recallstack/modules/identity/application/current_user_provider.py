from recallstack.modules.identity.application.services import IdentityService
from recallstack.shared.auth.current_user import CurrentUser
from recallstack.shared.auth.ports import IdentityTokenVerifier


class ApplicationCurrentUserProvider:
    def __init__(self, verifier: IdentityTokenVerifier, identities: IdentityService) -> None:
        self._verifier = verifier
        self._identities = identities

    async def from_access_token(self, token: str) -> CurrentUser:
        auth_subject = await self._verifier.verify(token)
        current_user, _ = await self._identities.load_current_user(auth_subject)
        return current_user
