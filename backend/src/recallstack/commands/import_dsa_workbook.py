import argparse
import asyncio
import json
from pathlib import Path
from uuid import UUID

from recallstack.composition.admin_content_uow import SqlAlchemyAdminContentUnitOfWork
from recallstack.composition.dsa_import import SqlAlchemyDsaImportStateReader
from recallstack.modules.admin.application.content_management import AdminContentService
from recallstack.modules.admin.application.dsa_import import DsaWorkbookImporter
from recallstack.modules.admin.infrastructure.dsa_workbook import XlsxDsaWorkbookReader
from recallstack.shared.config import get_settings
from recallstack.shared.database import Database
from recallstack.shared.database.event_loop import configure_psycopg_event_loop
from recallstack.shared.events import InProcessEventPublisher


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate or import the approved Ultimate DSA XLSX workbook."
    )
    parser.add_argument("workbook", type=Path)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write through admin content workflows; the default is a read-only dry run.",
    )
    parser.add_argument(
        "--actor-profile-id",
        type=UUID,
        help="Active admin profile used for authorship and publication (required with --apply).",
    )
    parser.add_argument("--report", type=Path, help="Optional path for the JSON report.")
    return parser.parse_args()


async def _run(arguments: argparse.Namespace) -> int:
    if arguments.apply and arguments.actor_profile_id is None:
        raise ValueError("--actor-profile-id is required with --apply")
    settings = get_settings()
    database = Database(settings)
    try:
        importer = DsaWorkbookImporter(
            workbook_reader=XlsxDsaWorkbookReader(),
            state_reader=SqlAlchemyDsaImportStateReader(database.session_factory),
            content_service=AdminContentService(
                lambda: SqlAlchemyAdminContentUnitOfWork(
                    database.session_factory,
                    sync_retention_days=settings.sync_retention_days,
                ),
                InProcessEventPublisher(),
            ),
        )
        report = await importer.run(
            source_path=arguments.workbook,
            apply=arguments.apply,
            actor_id=arguments.actor_profile_id,
        )
        serialized = json.dumps(report.as_dict(), indent=2, sort_keys=True)
        print(serialized)
        if arguments.report:
            arguments.report.parent.mkdir(parents=True, exist_ok=True)
            arguments.report.write_text(serialized + "\n", encoding="utf-8")
        return 1 if report.failed else 0
    finally:
        await database.close()


def main() -> None:
    configure_psycopg_event_loop()
    arguments = _arguments()
    try:
        exit_code = asyncio.run(_run(arguments))
    except (OSError, ValueError) as exc:
        print(f"DSA import failed: {exc}")
        raise SystemExit(2) from None
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
