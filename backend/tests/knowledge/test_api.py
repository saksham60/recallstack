from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import httpx
import pytest

from recallstack.main import create_app
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.modules.knowledge.application.cursor import CursorCodec
from recallstack.modules.knowledge.application.events import EventService
from recallstack.modules.knowledge.application.feed import FeedService
from recallstack.modules.knowledge.application.ports import RankedStory
from recallstack.modules.knowledge.application.preferences import PreferenceService
from recallstack.modules.knowledge.domain.entities import Preferences
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings
from tests.knowledge.fakes import SOURCE, story


class FakeRepository:
    def __init__(self):
        self.prefs = {}
        self.events = {}
        self.rows = tuple(
            sorted(
                (RankedStory(story(i), Decimal("0.8")) for i in range(5)),
                key=lambda r: (r.score, r.story.published_at, r.story.id),
                reverse=True,
            )
        )
        self.feed_calls = []

    async def sources(self):
        return (SOURCE,)

    async def preferences(self, profile_id):
        return self.prefs.get(profile_id, Preferences())

    async def patch_preferences(self, profile_id, patch):
        previous = await self.preferences(profile_id)
        result = replace(
            previous,
            **{
                key: getattr(patch, key)
                for key in ("minimum_importance", "topics", "sources")
                if getattr(patch, key) is not None
            },
        )
        self.prefs[profile_id] = result
        return result

    async def feed(self, **kwargs):
        self.feed_calls.append(kwargs)
        after = kwargs["after"]
        return tuple(
            row
            for row in self.rows
            if after is None
            or (row.score, row.story.published_at, row.story.id)
            < (after.score, after.published_at, after.story_id)
        )[: kwargs["limit"]]

    async def story(self, story_id, now):
        return next((row.story for row in self.rows if row.story.id == story_id), None)

    async def record_events(self, profile_id, events, now):
        count = 0
        for event in events:
            key = (profile_id, event.event_id)
            if key not in self.events:
                count += 1
                self.events[key] = event
        return count


class FakeUow:
    def __init__(self, repository):
        self.repository = repository
        self.commits = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def commit(self):
        self.commits += 1


@pytest.fixture
async def api():
    app = create_app(
        Settings(
            _env_file=None,
            supabase_project_url="https://example.supabase.co",
            app_env="test",
            knowledge_enabled=True,
            knowledge_cursor_secret="test-cursor-signing-key-long-enough",
        )
    )
    user = uuid4()
    repo = FakeRepository()
    uow = FakeUow(repo)
    async with app.router.lifespan_context(app):
        app.state.knowledge_feed_service = FeedService(
            lambda: uow,
            CursorCodec("test-cursor-signing-key-long-enough"),
        )
        app.state.knowledge_preference_service = PreferenceService(lambda: uow)
        app.state.knowledge_event_service = EventService(lambda: uow)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="https://test"
        ) as client:
            yield app, client, user, repo, uow


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("GET", "/feed", None),
        ("GET", f"/stories/{uuid4()}", None),
        ("GET", "/preferences", None),
        ("PATCH", "/preferences", {}),
        ("POST", "/events/batch", {"events": []}),
    ],
)
async def test_all_routes_require_auth(api, method, path, payload):
    _, client, _, _, _ = api
    response = await client.request(method, "/api/v1/knowledge" + path, json=payload)
    assert response.status_code == 401


def authenticate(app, user):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user, user, frozenset({"user"})
    )


async def test_feed_serialization_and_stable_pagination(api):
    app, client, user, repo, _ = api
    authenticate(app, user)
    ids = []
    cursor = None
    while True:
        response = await client.get(
            "/api/v1/knowledge/feed",
            params={
                "limit": 2,
                **({"cursor": cursor} if cursor else {}),
            },
        )
        assert response.status_code == 200, response.text
        data = response.json()
        ids.extend(item["id"] for item in data["items"])
        first = data["items"][0]
        assert "imageKey" not in first and "sourceUrl" in first and "whyItMatters" in first
        assert isinstance(first["qualityScore"], float)
        if not data["hasMore"]:
            break
        cursor = data["nextCursor"]
    assert len(ids) == len(set(ids)) == 5
    assert all(call["anchor"] == repo.feed_calls[0]["anchor"] for call in repo.feed_calls)


@pytest.mark.parametrize(
    "params",
    [{"limit": 0}, {"limit": 51}, {"cursor": "bad"}, {"cursor": "x" * 2049}, {"topic": "!bad"}],
)
async def test_bad_feed_parameters(api, params):
    app, client, user, _, _ = api
    authenticate(app, user)
    assert (await client.get("/api/v1/knowledge/feed", params=params)).status_code == 422


async def test_preferences_replacement_block_unblock_and_user_isolation(api):
    app, client, user, _, _ = api
    authenticate(app, user)
    patch = {
        "topics": [{"topic": "AI Agents", "blocked": True}],
        "sources": [{"key": "web", "enabled": False}],
    }
    result = await client.patch("/api/v1/knowledge/preferences", json=patch)
    assert result.status_code == 200, result.text
    assert result.json()["topics"][0]["topic"] == "ai-agents"
    assert not result.json()["sources"][0]["enabled"]
    authenticate(app, uuid4())
    assert (await client.get("/api/v1/knowledge/preferences")).json()["topics"] == []
    authenticate(app, user)
    result = await client.patch("/api/v1/knowledge/preferences", json={"topics": []})
    assert result.json()["topics"] == [] and len(result.json()["sources"]) == 1


@pytest.mark.parametrize(
    "payload",
    [
        {"sources": [{"key": "unknown"}]},
        {"topics": [{"topic": "!bad"}]},
        {"topics": [{"topic": "AI"}, {"topic": "ai"}]},
        {"topics": None},
        {"minimumImportance": 1.1},
        {"profileId": str(uuid4())},
    ],
)
async def test_invalid_preferences(api, payload):
    app, client, user, _, _ = api
    authenticate(app, user)
    assert (await client.patch("/api/v1/knowledge/preferences", json=payload)).status_code == 422


async def test_event_batch_is_authenticated_bounded_and_idempotent(api):
    app, client, user, repo, uow = api
    authenticate(app, user)
    event = {
        "eventId": str(uuid4()),
        "storyId": str(repo.rows[0].story.id),
        "type": "VIEW",
        "occurredAt": datetime.now(UTC).isoformat(),
    }
    for accepted in (1, 0):
        response = await client.post("/api/v1/knowledge/events/batch", json={"events": [event]})
        assert response.status_code == 200 and response.json()["accepted"] == accepted
    assert uow.commits == 2 and len(repo.events) == 1
    assert next(iter(repo.events))[0] == user
    for payload in (
        {"events": [event] * 101},
        {"events": [{**event, "type": "INVALID"}]},
        {"events": [{**event, "storyId": "bad"}]},
        {"events": [event], "profileId": str(uuid4())},
    ):
        assert (
            await client.post("/api/v1/knowledge/events/batch", json=payload)
        ).status_code == 422


async def test_missing_story_returns_404(api):
    app, client, user, _, _ = api
    authenticate(app, user)
    assert (await client.get(f"/api/v1/knowledge/stories/{uuid4()}")).status_code == 404
