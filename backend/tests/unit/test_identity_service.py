from uuid import uuid4

import pytest

from recallstack.modules.identity.application.commands import UpdateProfile
from recallstack.modules.identity.application.services import IdentityService
from recallstack.shared.auth import CurrentUser
from tests.fakes import FakeProfileRepository, FakeRoleRepository, FakeUowFactory


async def test_load_current_user_provisions_profile_and_loads_active_roles() -> None:
    subject = uuid4()
    repository = FakeProfileRepository()
    roles = FakeRoleRepository()
    roles.roles[subject] = frozenset({"reviewer", "content_editor"})
    factory = FakeUowFactory(repository, roles)

    current_user, profile = await IdentityService(factory).load_current_user(subject)

    assert profile.id == subject
    assert current_user.profile_id == subject
    assert current_user.auth_subject == subject
    assert current_user.roles == frozenset({"reviewer", "content_editor"})
    assert factory.instances[0].committed


async def test_profile_patch_preserves_fields_that_were_not_supplied() -> None:
    subject = uuid4()
    repository = FakeProfileRepository()
    original = await repository.provision(subject)
    await repository.update(
        subject,
        display_name="Original",
        avatar_url="https://example.com/avatar.png",
        timezone=original.timezone,
    )
    service = IdentityService(FakeUowFactory(repository))

    updated = await service.update_profile(
        CurrentUser(subject, subject, frozenset()), UpdateProfile(timezone="Asia/Kolkata")
    )

    assert updated.display_name == "Original"
    assert updated.avatar_url == "https://example.com/avatar.png"
    assert updated.timezone == "Asia/Kolkata"


async def test_failed_update_rolls_back_unit_of_work() -> None:
    subject = uuid4()
    repository = FakeProfileRepository()
    await repository.provision(subject)
    repository.fail_updates = True
    factory = FakeUowFactory(repository)

    with pytest.raises(RuntimeError, match="simulated write failure"):
        await IdentityService(factory).update_profile(
            CurrentUser(subject, subject, frozenset()), UpdateProfile(display_name="New name")
        )

    assert factory.instances[0].rolled_back
    assert not factory.instances[0].committed
