from datetime import UTC, datetime, timedelta
from typing import Never, cast

import pytest

from recallstack.modules.admin.application.user_inspection import (
    AdminUserService,
    AdminUserUnitOfWorkFactory,
    UserFilters,
)
from recallstack.shared.errors import AppError


def _unused_uow() -> Never:
    raise AssertionError("invalid input must be rejected before opening a unit of work")


async def test_invalid_activity_range_is_rejected() -> None:
    now = datetime.now(UTC)
    service = AdminUserService(cast(AdminUserUnitOfWorkFactory, _unused_uow))

    with pytest.raises(AppError) as exc_info:
        await service.list_users(
            filters=UserFilters(
                activity_from=now,
                activity_to=now - timedelta(seconds=1),
            ),
            page=1,
            page_size=25,
        )

    assert exc_info.value.status == 422
    assert exc_info.value.error_type == "invalid-date-range"
