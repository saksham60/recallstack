from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import httpx
from fastapi import FastAPI

from recallstack.main import create_app
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.modules.sync.application.sync_service import (
    ChangeFeed,
    Device,
    DevicePage,
    MutationCommand,
    MutationResult,
)
from recallstack.modules.sync.presentation.routes import get_sync_service
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings


class StubSyncService:
    def __init__(self, profile_id: UUID) -> None:
        self.profile_id = profile_id
        self.device_id = uuid4()

    def _device(self, *, revoked: bool = False) -> Device:
        now = datetime.now(UTC)
        return Device(
            self.device_id,
            "Phone",
            "android",
            "1.0",
            now,
            now,
            now if revoked else None,
        )

    async def register_device(self, **kwargs: object) -> Device:
        assert kwargs["profile_id"] == self.profile_id
        return self._device()

    async def list_devices(self, **kwargs: object) -> DevicePage:
        assert kwargs["profile_id"] == self.profile_id
        return DevicePage((self._device(),), 1, 25, 1)

    async def revoke_device(self, **kwargs: object) -> Device:
        assert kwargs["profile_id"] == self.profile_id
        return self._device(revoked=True)

    async def process_mutation(self, **kwargs: object) -> MutationResult:
        assert kwargs["profile_id"] == self.profile_id
        command = cast(MutationCommand, kwargs["command"])
        return MutationResult(
            command.mutation_id,
            "applied",
            False,
            1,
            command.entity_type,
            command.entity_id,
            "upsert",
            1,
            None,
            {"row_version": 1},
        )

    async def process_batch(self, **kwargs: object) -> tuple[MutationResult, ...]:
        assert kwargs["profile_id"] == self.profile_id
        commands = cast(tuple[MutationCommand, ...], kwargs["commands"])
        return tuple(
            MutationResult(
                item.mutation_id,
                "applied" if index == 0 else "rejected",
                False,
                1 if index == 0 else None,
                item.entity_type,
                item.entity_id,
                "upsert",
                1 if index == 0 else None,
                None if index == 0 else "stale-progress-version",
                {} if index == 0 else None,
            )
            for index, item in enumerate(commands)
        )

    async def user_changes(self, **kwargs: object) -> ChangeFeed:
        assert kwargs["profile_id"] == self.profile_id
        return ChangeFeed((), 0, 0, False, False)

    async def catalog_changes(self, **kwargs: object) -> ChangeFeed:
        assert kwargs["profile_id"] == self.profile_id
        return ChangeFeed((), 0, 0, False, False)


def _app(profile_id: UUID, *, authenticated: bool = True) -> FastAPI:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    if authenticated:
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            profile_id, profile_id, frozenset({"user"})
        )
    app.dependency_overrides[get_sync_service] = lambda: StubSyncService(profile_id)
    return app


async def test_device_endpoints_require_authentication_and_derive_owner() -> None:
    profile_id = uuid4()
    unauthenticated = _app(profile_id, authenticated=False)
    async with unauthenticated.router.lifespan_context(unauthenticated):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=unauthenticated), base_url="http://test"
        ) as client:
            denied = await client.get("/api/v1/me/devices")
    assert denied.status_code == 401

    app = _app(profile_id)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            registered = await client.post(
                "/api/v1/devices/register",
                json={"device_name": "Phone", "platform": "android", "app_version": "1.0"},
            )
            injected = await client.post(
                "/api/v1/devices/register",
                json={
                    "device_name": "Phone",
                    "platform": "android",
                    "app_version": "1.0",
                    "user_id": str(uuid4()),
                },
            )
    assert registered.status_code == 200
    assert "user_id" not in registered.text
    assert injected.status_code == 422


async def test_mutation_contract_validation_and_batch_partial_result() -> None:
    profile_id, device_id, content_id = uuid4(), uuid4(), uuid4()
    app = _app(profile_id)
    valid = {
        "mutation_id": str(uuid4()),
        "entity_type": "progress",
        "entity_id": str(content_id),
        "operation": "insert",
        "payload": {"status": "learning", "confidence": 25},
    }
    stale = {
        "mutation_id": str(uuid4()),
        "entity_type": "progress",
        "entity_id": str(content_id),
        "operation": "update",
        "base_row_version": 4,
        "payload": {"status": "confident", "confidence": 75},
    }
    invalid = {**stale, "base_row_version": None}
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            invalid_response = await client.post(
                "/api/v1/sync/mutations",
                json={"device_id": str(device_id), "mutation": invalid},
            )
            batch = await client.post(
                "/api/v1/sync/mutations/batch",
                json={"device_id": str(device_id), "mutations": [valid, stale]},
            )
    assert invalid_response.status_code == 422
    assert batch.status_code == 200
    assert batch.json()["applied_count"] == 1
    assert batch.json()["rejected_count"] == 1
