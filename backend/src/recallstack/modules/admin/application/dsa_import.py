import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from recallstack.modules.admin.application.content_management import (
    AdminContentService,
    CreateContent,
    DocumentBlock,
    PracticeResourceInput,
    UpdateDocument,
)

CATEGORY_SLUGS = {
    "Arrays": "arrays",
    "Strings": "strings",
    "2D Arrays": "2d-arrays",
    "Searching & Sorting": "searching-sorting",
    "Backtracking": "backtracking",
    "Linked List": "linked-list",
    "Stacks & Queues": "stacks-queues",
    "Greedy": "greedy",
    "Binary Trees": "binary-trees",
    "Binary Search Trees": "binary-search-trees",
    "Heaps & Hashing": "heaps-hashing",
    "Graphs": "graphs",
    "Tries": "tries",
    "DP": "dynamic-programming",
    "Bit Manipulation": "bit-manipulation",
    "Segment Trees": "segment-trees",
}


@dataclass(frozen=True, slots=True)
class DsaProblem:
    source_index: int
    source_row: int
    category: str
    title: str
    companies: str | None
    remarks: str | None
    difficulty: str
    url: str
    provider_slug: str
    slug: str
    fingerprint: str


@dataclass(frozen=True, slots=True)
class DsaWorkbook:
    problems: tuple[DsaProblem, ...]


class DsaWorkbookReader(Protocol):
    def read(self, path: Path) -> DsaWorkbook: ...


@dataclass(frozen=True, slots=True)
class ImportReferences:
    domain_id: UUID
    category_ids: dict[str, UUID]
    provider_ids: dict[str, int]


@dataclass(frozen=True, slots=True)
class ImportContentState:
    content_item_id: UUID
    published_fingerprint: str | None
    editable_version_id: UUID | None
    editable_status: str | None
    editable_row_version: int | None
    practice_resources_revision: int
    primary_practice_resource_id: UUID | None


class DsaImportStateReader(Protocol):
    async def validate_admin_actor(self, actor_id: UUID) -> bool: ...

    async def references(self) -> ImportReferences: ...

    async def content_state(self, *, domain_id: UUID, slug: str) -> ImportContentState | None: ...


class DsaProblemWriter(Protocol):
    async def apply_problem(
        self,
        *,
        problem: DsaProblem,
        references: ImportReferences,
        state: ImportContentState | None,
        actor_id: UUID,
    ) -> None: ...


@dataclass(frozen=True, slots=True)
class DsaImportReport:
    source_path: str
    dry_run: bool
    total: int
    would_create: int
    would_update: int
    unchanged: int
    applied: int
    failed: int
    repeated_titles: dict[str, int]
    repeated_urls: dict[str, int]
    errors: tuple[str, ...]

    def as_dict(self) -> dict[str, object]:
        return {
            "source_path": self.source_path,
            "dry_run": self.dry_run,
            "total": self.total,
            "would_create": self.would_create,
            "would_update": self.would_update,
            "unchanged": self.unchanged,
            "applied": self.applied,
            "failed": self.failed,
            "repeated_titles": self.repeated_titles,
            "repeated_urls": self.repeated_urls,
            "errors": list(self.errors),
        }


class DsaWorkbookImporter:
    def __init__(
        self,
        *,
        workbook_reader: DsaWorkbookReader,
        state_reader: DsaImportStateReader,
        content_service: AdminContentService | None = None,
        problem_writer: DsaProblemWriter | None = None,
    ) -> None:
        if content_service is None and problem_writer is None:
            raise ValueError("A content service or transactional problem writer is required")
        self._workbook_reader = workbook_reader
        self._state_reader = state_reader
        self._content_service = content_service
        self._problem_writer = problem_writer

    async def run(
        self, *, source_path: Path, apply: bool, actor_id: UUID | None
    ) -> DsaImportReport:
        workbook = self._workbook_reader.read(source_path)
        references = await self._state_reader.references()
        if apply and (
            actor_id is None or not await self._state_reader.validate_admin_actor(actor_id)
        ):
            raise ValueError("Apply mode requires an active admin profile")

        required_categories = {CATEGORY_SLUGS[p.category] for p in workbook.problems}
        required_providers = {p.provider_slug for p in workbook.problems}
        missing_categories = sorted(required_categories - references.category_ids.keys())
        missing_providers = sorted(required_providers - references.provider_ids.keys())
        if missing_categories or missing_providers:
            raise ValueError(
                "Missing seeded references: "
                f"categories={missing_categories}, providers={missing_providers}"
            )

        creates = updates = unchanged = applied = failed = 0
        errors: list[str] = []
        for problem in workbook.problems:
            state = await self._state_reader.content_state(
                domain_id=references.domain_id, slug=problem.slug
            )
            if state is not None and state.published_fingerprint == problem.fingerprint:
                unchanged += 1
                continue
            if state is None:
                creates += 1
            else:
                updates += 1
            if not apply:
                continue
            assert actor_id is not None
            try:
                if self._problem_writer is not None:
                    await self._problem_writer.apply_problem(
                        problem=problem,
                        references=references,
                        state=state,
                        actor_id=actor_id,
                    )
                else:
                    assert self._content_service is not None
                    await self.apply_problem_with_service(
                        content_service=self._content_service,
                        problem=problem,
                        references=references,
                        state=state,
                        actor_id=actor_id,
                    )
                applied += 1
            except Exception as exc:  # command reports per-row failures and remains resumable
                failed += 1
                errors.append(
                    f"source_index={problem.source_index}, slug={problem.slug}: "
                    f"{type(exc).__name__}: {exc}"
                )

        title_counts = Counter(problem.title.casefold() for problem in workbook.problems)
        url_counts = Counter(problem.url for problem in workbook.problems)
        return DsaImportReport(
            source_path=str(source_path),
            dry_run=not apply,
            total=len(workbook.problems),
            would_create=creates,
            would_update=updates,
            unchanged=unchanged,
            applied=applied,
            failed=failed,
            repeated_titles={key: count for key, count in title_counts.items() if count > 1},
            repeated_urls={key: count for key, count in url_counts.items() if count > 1},
            errors=tuple(errors),
        )

    @staticmethod
    async def apply_problem_with_service(
        *,
        content_service: AdminContentService,
        problem: DsaProblem,
        references: ImportReferences,
        state: ImportContentState | None,
        actor_id: UUID,
    ) -> None:
        if state is None:
            created = await content_service.create_content(
                actor_id=actor_id,
                command=CreateContent(
                    domain_id=references.domain_id,
                    slug=problem.slug,
                    content_type="problem",
                    difficulty=problem.difficulty,
                ),
            )
            content_item_id = created.content_item_id
            version_id = created.draft_version_id
            row_version = 1
            resource_revision = 1
        else:
            content_item_id = state.content_item_id
            resource_revision = state.practice_resources_revision
            if state.editable_version_id is None:
                draft = await content_service.create_draft(
                    content_item_id=content_item_id, actor_id=actor_id
                )
                version_id = draft.draft_version_id
                row_version = draft.row_version
            else:
                version_id = state.editable_version_id
                row_version = state.editable_row_version or 1
                if state.editable_status == "in_review":
                    returned_draft = await content_service.return_to_draft(
                        version_id=version_id,
                        actor_id=actor_id,
                        expected_row_version=row_version,
                        reason="Resume Ultimate DSA workbook import",
                    )
                    row_version = returned_draft.row_version

        payload: dict[str, object] = {
            "text": problem.title,
            "source": {
                "dataset": "Ultimate DSA",
                "source_index": problem.source_index,
                "source_row": problem.source_row,
                "category": problem.category,
                "practice_url": problem.url,
            },
            "import_fingerprint": problem.fingerprint,
        }
        source = payload["source"]
        assert isinstance(source, dict)
        if problem.companies:
            source["companies"] = problem.companies
        if problem.remarks:
            source["remarks"] = problem.remarks
        updated = await content_service.update_document(
            version_id=version_id,
            actor_id=actor_id,
            command=UpdateDocument(
                expected_row_version=row_version,
                title=problem.title,
                summary=f"Practice problem from the Ultimate DSA sheet in {problem.category}.",
                blocks=(DocumentBlock("recognize", "Problem source", payload),),
                category_ids=(references.category_ids[CATEGORY_SLUGS[problem.category]],),
                topics=(),
            ),
        )
        await content_service.replace_practice_resources(
            content_item_id=content_item_id,
            actor_id=actor_id,
            expected_revision=resource_revision,
            resources=(
                PracticeResourceInput(
                    id=(state.primary_practice_resource_id if state else None),
                    provider_id=references.provider_ids[problem.provider_slug],
                    external_key=None,
                    url=problem.url,
                    title=problem.title,
                    is_primary=True,
                    sort_order=0,
                ),
            ),
        )
        reviewed = await content_service.submit_review(
            version_id=version_id,
            actor_id=actor_id,
            expected_row_version=updated.row_version,
            reason="Imported from Ultimate DSA workbook",
        )
        await content_service.publish(
            version_id=version_id,
            actor_id=actor_id,
            expected_row_version=reviewed.row_version,
            reason="Imported from Ultimate DSA workbook",
        )


def normalize_slug(source_index: int, title: str) -> str:
    natural = re.sub(r"[^a-z0-9]+", "-", title.casefold()).strip("-") or "problem"
    prefix = f"ultimate-dsa-{source_index:03d}-"
    return prefix + natural[: 160 - len(prefix)].rstrip("-")


def normalize_practice_url(url: str) -> str:
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").casefold()
    scheme = parts.scheme.casefold()
    if host in {"geeksforgeeks.org", "www.geeksforgeeks.org"}:
        host = "www.geeksforgeeks.org"
        scheme = "https"
    if scheme != "https":
        raise ValueError(f"Practice URL must use HTTPS: {url}")
    netloc = host + (f":{parts.port}" if parts.port else "")
    return urlunsplit((scheme, netloc, parts.path, parts.query, ""))


def provider_for_url(url: str) -> str:
    host = (urlsplit(url).hostname or "").casefold()
    mappings = {
        "leetcode.com": "leetcode",
        "www.leetcode.com": "leetcode",
        "geeksforgeeks.org": "geeksforgeeks",
        "www.geeksforgeeks.org": "geeksforgeeks",
        "practice.geeksforgeeks.org": "geeksforgeeks",
        "interviewbit.com": "interviewbit",
        "www.interviewbit.com": "interviewbit",
        "spoj.com": "spoj",
        "www.spoj.com": "spoj",
        "hackerrank.com": "hackerrank",
        "www.hackerrank.com": "hackerrank",
        "hackerearth.com": "hackerearth",
        "www.hackerearth.com": "hackerearth",
        "cp-algorithms.com": "cp-algorithms",
    }
    try:
        return mappings[host]
    except KeyError as exc:
        raise ValueError(f"Unsupported practice provider host: {host}") from exc


def fingerprint_for(problem: dict[str, object]) -> str:
    canonical = json.dumps(problem, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()
