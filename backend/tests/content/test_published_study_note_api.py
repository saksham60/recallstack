from datetime import UTC, datetime
from uuid import uuid4

import httpx

from recallstack.main import create_app
from recallstack.modules.content.application.published_study_note import (
    PublishedStudyNote,
    StudyNoteDomain,
    StudyNoteUserProgress,
)
from recallstack.modules.identity.presentation.dependencies import get_current_user
from recallstack.modules.learning.domain.enums import LearningStatus
from recallstack.shared.auth import CurrentUser
from recallstack.shared.config import Settings


class FakeStudyNoteService:
    async def query(self, *, slug: str, profile_id: object) -> PublishedStudyNote:
        return PublishedStudyNote(
            content_item_id=uuid4(),
            slug=slug,
            domain=StudyNoteDomain(uuid4(), "dsa", "DSA"),
            categories=(),
            topics=(),
            primary_topic=None,
            type="problem",
            difficulty="easy",
            published_version_number=4,
            title="Two Sum",
            summary=None,
            blocks=(),
            related_content=(),
            prerequisites=(),
            practice_resources=(),
            user_progress=StudyNoteUserProgress(LearningStatus.NEW, 0, datetime.now(UTC)),
            is_bookmarked=False,
            review_card=None,
        )


async def test_published_study_note_requires_authentication() -> None:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/content/two-sum")
    assert response.status_code == 401


async def test_published_study_note_exposes_published_version_etag() -> None:
    app = create_app(Settings(supabase_project_url="https://example.supabase.co", app_env="test"))
    subject = uuid4()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        subject, subject, frozenset({"user"})
    )
    async with app.router.lifespan_context(app):
        app.state.published_study_note_service = FakeStudyNoteService()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/content/two-sum")
    assert response.status_code == 200
    assert response.json()["published_version_number"] == 4
    assert response.headers["etag"].startswith('W/"content-')
    assert response.headers["cache-control"] == "private, no-cache"
