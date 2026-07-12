import logging
import time
from collections.abc import AsyncIterator

from sqlalchemy import event, text
from sqlalchemy.engine import Connection, ExceptionContext, ExecutionContext
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from recallstack.shared.config import Settings
from recallstack.shared.database.ports import DatabaseSessionFactory
from recallstack.shared.observability.context import request_id_context, trace_id_context

logger = logging.getLogger("recallstack.database")


class SqlAlchemySessionFactory(DatabaseSessionFactory[AsyncSession]):
    def __init__(self, factory: async_sessionmaker[AsyncSession]) -> None:
        self._factory = factory

    def create_session(self) -> AsyncSession:
        return self._factory()


class UnavailableSessionFactory(DatabaseSessionFactory[AsyncSession]):
    def create_session(self) -> AsyncSession:
        raise RuntimeError("DATABASE_URL is not configured")


class Database:
    """Owns the process-wide engine; sessions remain request scoped."""

    def __init__(self, settings: Settings) -> None:
        self._engine: AsyncEngine | None = None
        self._session_factory: DatabaseSessionFactory[AsyncSession] = UnavailableSessionFactory()
        if settings.database_url is not None:
            self._engine = create_async_engine(
                settings.database_url,
                pool_pre_ping=settings.database_pool_pre_ping,
                pool_size=settings.database_pool_size,
                max_overflow=settings.database_max_overflow,
                pool_timeout=settings.database_pool_timeout,
                pool_recycle=settings.database_pool_recycle,
            )
            self._session_factory = SqlAlchemySessionFactory(
                async_sessionmaker(self._engine, expire_on_commit=False, autoflush=False)
            )
            self._install_timing_instrumentation(self._engine)

    @staticmethod
    def _install_timing_instrumentation(engine: AsyncEngine) -> None:
        @event.listens_for(engine.sync_engine, "before_cursor_execute")
        def before_cursor_execute(
            connection: Connection,
            cursor: object,
            statement: str,
            parameters: object,
            context: ExecutionContext,
            executemany: bool,
        ) -> None:
            connection.info.setdefault("query_started_at", []).append(time.perf_counter())

        @event.listens_for(engine.sync_engine, "after_cursor_execute")
        def after_cursor_execute(
            connection: Connection,
            cursor: object,
            statement: str,
            parameters: object,
            context: ExecutionContext,
            executemany: bool,
        ) -> None:
            started = connection.info["query_started_at"].pop()
            logger.info(
                "database_query_completed",
                extra={
                    "request_id": request_id_context.get(),
                    "trace_id": trace_id_context.get(),
                    "db_operation": statement.lstrip().split(maxsplit=1)[0].upper(),
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )

        @event.listens_for(engine.sync_engine, "handle_error")
        def handle_error(context: ExceptionContext) -> None:
            if context.connection is None:
                return
            starts = context.connection.info.get("query_started_at", [])
            if starts:
                starts.pop()

    @property
    def configured(self) -> bool:
        return self._engine is not None

    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self._session_factory.create_session() as session:
            yield session

    @property
    def session_factory(self) -> DatabaseSessionFactory[AsyncSession]:
        return self._session_factory

    async def ping(self) -> bool:
        if self._engine is None:
            return False
        try:
            async with self._engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        except (OSError, TimeoutError, SQLAlchemyError):
            return False
        return True

    async def close(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()
