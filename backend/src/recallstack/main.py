from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from recallstack.composition.admin_content_uow import SqlAlchemyAdminContentUnitOfWork
from recallstack.composition.admin_user_uow import SqlAlchemyAdminUserUnitOfWork
from recallstack.composition.category_content_list_uow import (
    SqlAlchemyCategoryContentReadUnitOfWork,
)
from recallstack.composition.category_dashboard_uow import SqlAlchemyCategoryDashboardUnitOfWork
from recallstack.composition.learning_uow import SqlAlchemyLearningUnitOfWork
from recallstack.composition.practice_attempt_uow import SqlAlchemyPracticeAttemptUnitOfWork
from recallstack.composition.published_study_note_uow import SqlAlchemyPublishedStudyNoteUnitOfWork
from recallstack.composition.recall_uow import SqlAlchemyRecallUnitOfWork
from recallstack.composition.search_uow import SqlAlchemySearchUnitOfWork
from recallstack.composition.sync_uow import SqlAlchemySyncUnitOfWork
from recallstack.health import ReadinessProbe
from recallstack.health import router as health_router
from recallstack.modules.admin.application.content_management import AdminContentService
from recallstack.modules.admin.application.user_inspection import AdminUserService
from recallstack.modules.admin.presentation.routes import router as admin_content_router
from recallstack.modules.admin.presentation.user_routes import router as admin_user_router
from recallstack.modules.catalog.application.category_dashboard import CategoryDashboardService
from recallstack.modules.catalog.application.search import SearchService
from recallstack.modules.catalog.presentation.routes import router as catalog_router
from recallstack.modules.catalog.presentation.search_routes import router as search_router
from recallstack.modules.content.application.category_content_list import CategoryContentListService
from recallstack.modules.content.application.published_study_note import PublishedStudyNoteService
from recallstack.modules.content.presentation.routes import router as content_router
from recallstack.modules.content.presentation.study_note_routes import router as study_note_router
from recallstack.modules.identity.application.current_user_provider import (
    ApplicationCurrentUserProvider,
)
from recallstack.modules.identity.application.services import IdentityService
from recallstack.modules.identity.application.unit_of_work import IdentityUnitOfWork
from recallstack.modules.identity.infrastructure.unit_of_work import SqlAlchemyIdentityUnitOfWork
from recallstack.modules.identity.presentation.routes import router as identity_router
from recallstack.modules.learning.application.learning_state import LearningService
from recallstack.modules.learning.infrastructure.activity_event_recorder import (
    SqlAlchemyActivityEventRecorder,
)
from recallstack.modules.learning.presentation.routes import router as learning_router
from recallstack.modules.practice.application.attempt_submission import (
    DeterministicInitialReviewScheduler,
    PracticeAttemptService,
)
from recallstack.modules.practice.presentation.routes import router as practice_router
from recallstack.modules.recall.application.review_submission import (
    DeterministicReviewScheduler,
    RecallService,
)
from recallstack.modules.recall.presentation.routes import router as recall_router
from recallstack.modules.sync.application.sync_service import SyncService
from recallstack.modules.sync.presentation.routes import router as sync_router
from recallstack.shared.auth.jwt_verifier import SupabaseJwtVerifier
from recallstack.shared.config import Settings, get_settings
from recallstack.shared.database import Database
from recallstack.shared.database.event_loop import configure_psycopg_event_loop
from recallstack.shared.errors.handlers import install_error_handlers
from recallstack.shared.events import InProcessEventPublisher
from recallstack.shared.logging import configure_logging
from recallstack.shared.observability.middleware import (
    BodySizeLimitMiddleware,
    RequestContextMiddleware,
)

configure_psycopg_event_loop()


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    configure_logging(resolved.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        database = Database(resolved)
        http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(5.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        app.state.database = database

        def identity_uow() -> IdentityUnitOfWork:
            return SqlAlchemyIdentityUnitOfWork(database.session_factory)

        app.state.identity_service = IdentityService(identity_uow)
        app.state.category_dashboard_service = CategoryDashboardService(
            lambda: SqlAlchemyCategoryDashboardUnitOfWork(database.session_factory)
        )
        app.state.category_content_list_service = CategoryContentListService(
            lambda: SqlAlchemyCategoryContentReadUnitOfWork(database.session_factory)
        )
        app.state.learning_service = LearningService(
            lambda: SqlAlchemyLearningUnitOfWork(database.session_factory)
        )
        app.state.event_publisher = InProcessEventPublisher()
        app.state.admin_content_service = AdminContentService(
            lambda: SqlAlchemyAdminContentUnitOfWork(
                database.session_factory, sync_retention_days=resolved.sync_retention_days
            ),
            app.state.event_publisher,
        )
        app.state.admin_user_service = AdminUserService(
            lambda: SqlAlchemyAdminUserUnitOfWork(database.session_factory)
        )
        app.state.practice_attempt_service = PracticeAttemptService(
            lambda: SqlAlchemyPracticeAttemptUnitOfWork(database.session_factory),
            DeterministicInitialReviewScheduler(),
            app.state.event_publisher,
        )
        app.state.recall_service = RecallService(
            lambda: SqlAlchemyRecallUnitOfWork(database.session_factory),
            DeterministicReviewScheduler(),
            app.state.event_publisher,
        )
        app.state.search_service = SearchService(
            lambda: SqlAlchemySearchUnitOfWork(database.session_factory)
        )
        app.state.sync_service = SyncService(
            lambda: SqlAlchemySyncUnitOfWork(database.session_factory),
            retention_days=resolved.sync_retention_days,
        )
        app.state.published_study_note_service = PublishedStudyNoteService(
            lambda: SqlAlchemyPublishedStudyNoteUnitOfWork(database.session_factory),
            SqlAlchemyActivityEventRecorder(database.session_factory, app.state.event_publisher),
        )
        verifier = SupabaseJwtVerifier(
            issuer=resolved.supabase_jwt_issuer,
            audience=resolved.supabase_jwt_audience,
            jwks_url=resolved.supabase_jwks_url,
            cache_seconds=resolved.jwks_cache_seconds,
            client=http_client,
        )
        app.state.current_user_provider = ApplicationCurrentUserProvider(
            verifier, app.state.identity_service
        )
        app.state.readiness_probe = ReadinessProbe(
            database, cache_seconds=resolved.readiness_cache_seconds
        )
        yield
        await http_client.aclose()
        await database.close()

    app = FastAPI(
        title=resolved.app_name,
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if resolved.app_env != "production" else None,
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=resolved.request_body_max_bytes)
    app.add_middleware(RequestContextMiddleware)
    install_error_handlers(app)
    app.include_router(health_router)
    app.include_router(identity_router, prefix="/api/v1")
    app.include_router(catalog_router, prefix="/api/v1")
    app.include_router(content_router, prefix="/api/v1")
    app.include_router(study_note_router, prefix="/api/v1")
    app.include_router(learning_router, prefix="/api/v1")
    app.include_router(practice_router, prefix="/api/v1")
    app.include_router(recall_router, prefix="/api/v1")
    app.include_router(search_router, prefix="/api/v1")
    app.include_router(admin_content_router, prefix="/api/v1")
    app.include_router(admin_user_router, prefix="/api/v1")
    app.include_router(sync_router, prefix="/api/v1")
    return app


app = create_app()
