from datetime import UTC, datetime
from uuid import uuid4

import pytest

from recallstack.modules.identity.domain.entities import Profile


def test_profile_rejects_unknown_timezone() -> None:
    now = datetime.now(UTC)
    with pytest.raises(ValueError, match="Unknown IANA timezone"):
        Profile(uuid4(), None, None, "Mars/Olympus_Mons", now, now)
