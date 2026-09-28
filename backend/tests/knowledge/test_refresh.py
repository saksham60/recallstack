from uuid import uuid4

import httpx

from recallstack.modules.knowledge.application.refresh import RefreshRun, RefreshService
from recallstack.modules.knowledge.infrastructure.cloud_run_refresh import CloudRunRefreshRunner


async def test_cloud_run_refresh_uses_service_identity_and_tracks_completion():
    requests = []
    operation = "projects/example/locations/us-central1/operations/operation-1"

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "metadata.google.internal":
            assert request.headers["Metadata-Flavor"] == "Google"
            return httpx.Response(200, json={"access_token": "test-token", "expires_in": 3600})
        assert request.headers["Authorization"] == "Bearer test-token"
        if request.method == "POST":
            assert request.url.path.endswith("/jobs/knowledge-refresh:run")
            return httpx.Response(200, json={"name": operation})
        return httpx.Response(200, json={"done": len(requests) >= 4})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        runner = CloudRunRefreshRunner(client, "example", "us-central1", "knowledge-refresh")
        assert await runner.start() == operation
        assert await runner.status(operation) == "running"
        assert await runner.status(operation) == "succeeded"
    assert sum(request.url.host == "metadata.google.internal" for request in requests) == 1


async def test_refresh_service_reuses_running_run_and_observes_failure():
    class Store:
        run: RefreshRun | None = None
        reservations = 0

        async def reserve(self, profile_id, now, cooldown):
            if self.run and now - self.run.requested_at < cooldown:
                return self.run, False
            self.reservations += 1
            self.run = RefreshRun(uuid4(), now, "starting")
            return self.run, True

        async def get(self, run_id):
            return self.run if self.run and self.run.id == run_id else None

        async def update(self, run_id, status, *, operation_name=None, checked_at=None):
            assert self.run and self.run.id == run_id
            self.run = RefreshRun(
                run_id,
                self.run.requested_at,
                status,
                operation_name or self.run.operation_name,
                checked_at,
            )
            return self.run

    class Runner:
        starts = 0

        async def start(self):
            self.starts += 1
            return "operation-1"

        async def status(self, operation_name):
            assert operation_name == "operation-1"
            return "failed"

    store, runner = Store(), Runner()
    service = RefreshService(store, runner, 30)
    first = await service.start(uuid4())
    second = await service.start(uuid4())
    assert first.id == second.id
    assert store.reservations == runner.starts == 1
    assert (await service.status(first.id)).status == "failed"
