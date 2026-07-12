from uuid import uuid4

import pytest

from recallstack.modules.identity.presentation.dependencies import require_admin
from recallstack.shared.auth import CurrentUser
from recallstack.shared.errors import AuthorizationError


async def test_normal_user_is_denied_by_admin_dependency() -> None:
    subject = uuid4()
    with pytest.raises(AuthorizationError):
        await require_admin(CurrentUser(subject, subject, frozenset({"user"})))


async def test_admin_is_accepted_by_admin_dependency() -> None:
    subject = uuid4()
    current_user = CurrentUser(subject, subject, frozenset({"user", "admin"}))
    assert await require_admin(current_user) == current_user
