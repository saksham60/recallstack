import asyncio
from datetime import UTC, datetime

from recallstack.composition.sync_uow import SqlAlchemySyncUnitOfWork
from recallstack.modules.sync.application.sync_service import SyncService
from recallstack.shared.config import get_settings
from recallstack.shared.database import Database
from recallstack.shared.database.event_loop import configure_psycopg_event_loop


async def compact() -> None:
    settings = get_settings()
    database = Database(settings)
    try:
        service = SyncService(
            lambda: SqlAlchemySyncUnitOfWork(database.session_factory),
            retention_days=settings.sync_retention_days,
        )
        result = await service.compact(now=datetime.now(UTC))
        print(
            "sync_compaction_completed "
            f"mutations_deleted={result.mutations_deleted} "
            f"user_changes_deleted={result.user_changes_deleted} "
            f"catalog_changes_deleted={result.catalog_changes_deleted} "
            f"user_devices_marked={result.user_devices_marked_for_resync} "
            f"catalog_devices_marked={result.catalog_devices_marked_for_resync}"
        )
    finally:
        await database.close()


def main() -> None:
    configure_psycopg_event_loop()
    asyncio.run(compact())


if __name__ == "__main__":
    main()
