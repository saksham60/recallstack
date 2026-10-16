from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import UUID

from recallstack.modules.dsa.application.cursor import decode_cursor, encode_cursor, invalid_request
from recallstack.shared.errors import AppError


class ReadRepository(Protocol):
    async def catalog(
        self, filters: dict[str, Any], key: tuple[str, UUID] | None, limit: int, preview: bool
    ) -> list[dict[str, Any]]: ...
    async def detail(
        self, problem_id: UUID, preview: bool, version_id: UUID | None
    ) -> dict[str, Any] | None: ...
    async def metadata(self, kind: str, preview: bool) -> list[dict[str, Any]]: ...
    async def resolve(
        self, identifier: str, preview: bool, version_id: UUID | None
    ) -> dict[str, Any] | None: ...
    async def topic_progress(self, profile_id: UUID) -> list[dict[str, Any]]: ...
    async def tests(
        self, version_id: UUID, key: tuple[int, UUID] | None, limit: int
    ) -> list[dict[str, Any]]: ...
    async def history(
        self,
        profile_id: UUID,
        start_at: datetime | None,
        end_at: datetime | None,
        key: tuple[datetime, UUID] | None,
        limit: int,
    ) -> list[dict[str, Any]]: ...
    async def statistics(self, profile_id: UUID) -> dict[str, Any]: ...
    async def languages(self) -> dict[str, list[str]]: ...


# JSON input/output data can have arbitrary problem-specific structure. Remove
# reserved internal metadata keys at every depth; DTOs further allowlist fields.
PRIVATE_KEYS = frozenset(
    {
        "provenance",
        "reference_solution",
        "reference_solution_python",
        "hidden_tests",
        "hidden_test_cases",
        "review_notes",
        "reviewer_notes",
        "oracle_metadata",
        "fixture_ref",
        "implementation",
        "validation_notes",
        "reviewer_metadata",
    }
)


def public_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: public_json(v) for k, v in value.items() if k.lower() not in PRIVATE_KEYS}
    if isinstance(value, list):
        return [public_json(v) for v in value]
    return value


def not_found() -> AppError:
    return AppError(
        error_type="dsa-problem-not-found",
        title="Problem not found",
        status=404,
        detail="No accessible DSA problem exists with this id and version",
    )


def utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        raise invalid_request("Timestamps must include a UTC offset")
    return value.astimezone(UTC)


class DsaService:
    def __init__(
        self,
        repository: Callable[[], AbstractAsyncContextManager[ReadRepository]],
    ) -> None:
        self.repository = repository

    async def catalog(
        self,
        filters: dict[str, Any],
        cursor: str | None,
        limit: int,
        preview: bool,
    ) -> dict[str, Any]:
        scope = {"kind": "catalog", **filters, "preview": preview}
        raw = decode_cursor(cursor, scope)
        try:
            key = (raw[0], UUID(raw[1])) if raw else None
        except ValueError:
            raise invalid_request("Invalid cursor key") from None
        async with self.repository() as repository:
            rows = await repository.catalog(filters, key, limit, preview)
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = (
            encode_cursor(scope, [rows[-1]["sort_title"], str(rows[-1]["id"])])
            if has_more
            else None
        )
        return {
            "items": [self.item(r) for r in rows],
            "next_cursor": next_cursor,
            "has_more": has_more,
        }

    @staticmethod
    def item(row: dict[str, Any]) -> dict[str, Any]:
        return {
            k: row[k]
            for k in (
                "id",
                "slug",
                "title",
                "difficulty",
                "problem_version_id",
                "categories",
                "topics",
            )
        } | {"availability": "available" if row["approved"] else "review_pending"}

    async def detail(
        self,
        problem_id: UUID,
        preview: bool,
        version_id: UUID | None,
    ) -> dict[str, Any]:
        async with self.repository() as repository:
            row = await repository.detail(problem_id, preview, version_id)
        if row is None:
            raise not_found()
        contract = public_json(row.get("function_contract") or {})
        # Defense in depth for non-SQL repository implementations and malformed data.
        contract = {k: v for k, v in contract.items() if k in PUBLIC_CONTRACT_FIELDS}
        examples = []
        for example in row.get("examples") or []:
            if isinstance(example, dict) and "input" in example and "output" in example:
                examples.append(
                    {
                        k: public_json(example[k])
                        for k in ("input", "output", "explanation")
                        if k in example
                    }
                )
        constraints = row.get("constraints") or []
        return self.item(row) | {
            "description": row.get("description") or "",
            "function_contract": contract,
            "constraints": [v for v in constraints if isinstance(v, str)],
            "examples": examples,
            "supported_contract_languages": [
                v for v in row.get("supported_languages") or [] if isinstance(v, str)
            ],
        }

    async def metadata(self, kind: str, preview: bool) -> dict[str, Any]:
        async with self.repository() as repository:
            return {"items": await repository.metadata(kind, preview)}

    async def resolve(
        self, identifier: str, preview: bool, version_id: UUID | None
    ) -> dict[str, Any]:
        async with self.repository() as repository:
            row = await repository.resolve(identifier, preview, version_id)
        if row is None:
            raise not_found()
        return self.item(row)

    async def topic_progress(self, profile_id: UUID) -> dict[str, Any]:
        async with self.repository() as repository:
            return {"items": await repository.topic_progress(profile_id)}

    async def tests(
        self,
        problem_id: UUID,
        preview: bool,
        version_id: UUID | None,
        cursor: str | None,
        limit: int,
    ) -> dict[str, Any]:
        async with self.repository() as repository:
            row = await repository.detail(problem_id, preview, version_id)
            if row is None:
                raise not_found()
            selected = row["problem_version_id"]
            scope = {
                "kind": "tests",
                "problem": str(problem_id),
                "version": str(selected),
                "preview": preview,
            }
            raw = decode_cursor(cursor, scope)
            try:
                key = (int(raw[0]), UUID(raw[1])) if raw else None
                if key and key[0] < 0:
                    raise ValueError
            except ValueError:
                raise invalid_request("Invalid cursor key") from None
            rows = await repository.tests(selected, key, limit)
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = (
            encode_cursor(scope, [str(rows[-1]["ordinal"]), str(rows[-1]["id"])])
            if has_more
            else None
        )
        return {
            "problem_version_id": selected,
            "items": [
                {
                    "id": r["id"],
                    "input_json": public_json(r["input_json"]),
                    "expected_output_json": public_json(r["expected_output_json"]),
                }
                for r in rows
            ],
            "has_verified_public_tests": bool(rows),
            "next_cursor": next_cursor,
            "has_more": has_more,
        }

    async def history(
        self,
        profile_id: UUID,
        start_at: datetime | None,
        end_at: datetime | None,
        cursor: str | None,
        limit: int,
    ) -> dict[str, Any]:
        start_at, end_at = utc(start_at), utc(end_at)
        if start_at and end_at and end_at <= start_at:
            raise invalid_request("end_at must be later than start_at")
        scope = {
            "kind": "history",
            "user": str(profile_id),
            "start_at": start_at.isoformat() if start_at else None,
            "end_at": end_at.isoformat() if end_at else None,
        }
        raw = decode_cursor(cursor, scope)
        try:
            parsed = utc(datetime.fromisoformat(raw[0])) if raw else None
            key = (parsed, UUID(raw[1])) if parsed and raw else None
        except ValueError:
            raise invalid_request("Invalid cursor key") from None
        async with self.repository() as repository:
            rows = await repository.history(profile_id, start_at, end_at, key, limit)
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = (
            encode_cursor(scope, [rows[-1]["attempted_at"].isoformat(), str(rows[-1]["id"])])
            if has_more
            else None
        )
        return {"items": rows, "next_cursor": next_cursor, "has_more": has_more}

    async def statistics(self, profile_id: UUID) -> dict[str, Any]:
        async with self.repository() as repository:
            return await repository.statistics(profile_id)

    async def capabilities(self) -> dict[str, Any]:
        async with self.repository() as repository:
            languages = await repository.languages()
        return {
            "catalog": True,
            "progress": True,
            "bookmarks": True,
            "notes": True,
            "practice_history": True,
            "sandbox_execution": False,
            "ai_tutoring": False,
            **languages,
        }


PUBLIC_CONTRACT_FIELDS = frozenset(
    {
        "function",
        "input",
        "output",
        "encoding",
        "representation",
        "serialization",
        "indexing",
        "indices",
        "ordering",
        "tie_break",
        "absolute_tolerance",
        "modulus",
        "directed",
        "edge_direction",
        "case_sensitive",
        "strictly_increasing",
        "nonunique",
        "multiple_solutions",
        "negative_values",
        "division_permitted",
        "whole_string_excluded",
        "empty_text",
        "blank",
        "blocked",
        "stops",
        "scope",
        "operation",
        "operations",
        "job_fields",
        "result_keys",
    }
)
