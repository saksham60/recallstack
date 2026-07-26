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
    FullResyncAck,
    FullResyncSnapshot,
    MutationCommand,
    MutationConflict,
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
        if commands[0].entity_type == "note":
            command = commands[0]
            conflict = MutationConflict(
                "note",
                command.entity_id,
                cast(int, command.base_row_version),
                4,
                {
                    "id": str(command.entity_id),
                    "body": "Current server note",
                    "row_version": 4,
                },
            )
            return (
                MutationResult(
                    command.mutation_id,
                    "conflict",
                    False,
                    None,
                    "note",
                    command.entity_id,
                    "update",
                    None,
                    "stale-note-version",
                    None,
                    conflict,
                ),
            )
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

    async def catalog_full_resync(self, **kwargs: object) -> FullResyncSnapshot:
        assert kwargs["profile_id"] == self.profile_id
        domain_id = cast(UUID, kwargs["domain_id"])
        now = datetime.now(UTC)
        return FullResyncSnapshot(
            uuid4(),
            "catalog",
            domain_id,
            "dsa",
            12,
            now,
            now,
            {
                "categories": [],
                "content_items": [],
                "content_documents": [],
            },
        )

    async def user_full_resync(self, **kwargs: object) -> FullResyncSnapshot:
        assert kwargs["profile_id"] == self.profile_id
        now = datetime.now(UTC)
        return FullResyncSnapshot(
            uuid4(),
            "user",
            None,
            None,
            20,
            now,
            now,
            {
                "progress": [],
                "bookmarks": [],
                "notes": [],
                "review_cards": [],
            },
        )

    async def acknowledge_full_resync(self, **kwargs: object) -> FullResyncAck:
        assert kwargs["profile_id"] == self.profile_id
        return FullResyncAck(True, cast(int, kwargs["snapshot_cursor"]))


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


async def test_full_resync_routes_return_bound_snapshots_and_acknowledge() -> None:
    profile_id, domain_id, device_id, snapshot_id = (
        uuid4(),
        uuid4(),
        uuid4(),
        uuid4(),
    )
    app = _app(profile_id)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            catalog = await client.post(
                f"/api/v1/sync/catalog/{domain_id}/full-resync",
                json={"device_id": str(device_id)},
            )
            catalog_ack = await client.post(
                f"/api/v1/sync/catalog/{domain_id}/full-resync/ack",
                json={
                    "device_id": str(device_id),
                    "snapshot_id": str(snapshot_id),
                    "snapshot_cursor": 12,
                },
            )
            user = await client.post(
                "/api/v1/sync/user/full-resync",
                json={"device_id": str(device_id)},
            )
            user_ack = await client.post(
                "/api/v1/sync/user/full-resync/ack",
                json={
                    "device_id": str(device_id),
                    "snapshot_id": str(snapshot_id),
                    "snapshot_cursor": 20,
                },
            )
    assert catalog.status_code == 200
    assert catalog.json()["snapshot_cursor"] == 12
    assert catalog.json()["domain_id"] == str(domain_id)
    assert catalog_ack.json() == {"acknowledged": True, "snapshot_cursor": 12}
    assert user.status_code == 200
    assert user.json()["snapshot_cursor"] == 20
    assert user_ack.json() == {"acknowledged": True, "snapshot_cursor": 20}


async def test_batch_conflict_response_contains_structured_server_state() -> None:
    profile_id, device_id, note_id = uuid4(), uuid4(), uuid4()
    app = _app(profile_id)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/sync/mutations/batch",
                json={
                    "device_id": str(device_id),
                    "mutations": [
                        {
                            "mutation_id": str(uuid4()),
                            "entity_type": "note",
                            "entity_id": str(note_id),
                            "operation": "update",
                            "base_row_version": 2,
                            "payload": {"body": "Client edit"},
                        }
                    ],
                },
            )
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["status"] == "conflict"
    assert result["error_code"] == "stale-note-version"
    assert result["conflict"] == {
        "entity_type": "note",
        "entity_id": str(note_id),
        "expected_row_version": 2,
        "current_row_version": 4,
        "server_entity": {
            "id": str(note_id),
            "body": "Current server note",
            "row_version": 4,
        },
    }
