"""Read-only DSA database smoke check using the existing backend configuration.

No authentication/provisioning path is called and all queries use READ ONLY
transactions. --preview checks draft projection through the internal service;
it does not grant any HTTP client preview authorization.
"""

import argparse
import asyncio
import json
from statistics import quantiles
from time import perf_counter

from recallstack.composition.dsa import read_repository
from recallstack.modules.dsa.application.services import DsaService
from recallstack.modules.dsa.presentation.schemas import ProblemDetail
from recallstack.shared.config import get_settings
from recallstack.shared.database import Database
from recallstack.shared.database.event_loop import configure_psycopg_event_loop


async def smoke(samples: int, preview: bool, validate_previews: bool) -> None:
    database = Database(get_settings())
    service = DsaService(lambda: read_repository(database.session_factory))
    filters = {
        "search": None,
        "difficulty": None,
        "category": None,
        "topic": None,
        "sort": "title_asc",
    }
    report = {"read_only": True, "samples_per_operation": samples, "measurements": {}}
    try:
        page = await service.catalog(filters, None, 20, False)
        report["public_catalog_page_size"] = len(page["items"])
        operations = {"public_catalog": lambda: service.catalog(filters, None, 20, False)}
        if preview:
            drafts = await service.catalog(filters, None, 1, True)
            report["preview_has_items"] = bool(drafts["items"])
            if drafts["items"]:
                item = drafts["items"][0]
                problem_id, version_id = item["id"], item["problem_version_id"]
                detail = await service.detail(problem_id, True, version_id)
                tests = await service.tests(problem_id, True, version_id, None, 20)
                report["preview_detail_mapped"] = bool(detail["description"])
                report["preview_verified_public_test_count"] = len(tests["items"])
                operations["preview_detail"] = lambda: service.detail(problem_id, True, version_id)
        if validate_previews:
            validated = 0
            cursor = None
            semaphore = asyncio.Semaphore(4)

            async def validate(item):
                async with semaphore:
                    payload = await service.detail(item["id"], True, item["problem_version_id"])
                    ProblemDetail.model_validate(payload)

            while True:
                page = await service.catalog(filters, cursor, 50, True)
                await asyncio.gather(*(validate(item) for item in page["items"]))
                validated += len(page["items"])
                cursor = page["next_cursor"]
                if not cursor:
                    break
            report["preview_details_validated"] = validated
        for name, operation in operations.items():
            timings = []
            for _ in range(samples):
                started = perf_counter()
                await operation()
                timings.append((perf_counter() - started) * 1000)
            report["measurements"][name] = {
                "p95_ms": round(quantiles(timings, n=100, method="inclusive")[94], 2),
                "min_ms": round(min(timings), 2),
                "max_ms": round(max(timings), 2),
                "scope": "service + configured database; excludes HTTP/auth/client network",
            }
        print(json.dumps(report, indent=2))
    finally:
        await database.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=20, choices=range(2, 101), metavar="2..100")
    parser.add_argument("--preview", action="store_true")
    parser.add_argument(
        "--validate-previews",
        action="store_true",
        help="Validate every draft projection with at most four concurrent reads",
    )
    arguments = parser.parse_args()
    configure_psycopg_event_loop()
    asyncio.run(smoke(arguments.samples, arguments.preview, arguments.validate_previews))
