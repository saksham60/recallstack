from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4
from zipfile import ZipFile

import pytest

from recallstack.modules.admin.application.dsa_import import (
    CATEGORY_SLUGS,
    DsaProblem,
    DsaWorkbook,
    DsaWorkbookImporter,
    ImportContentState,
    ImportReferences,
    fingerprint_for,
    normalize_practice_url,
    normalize_slug,
    provider_for_url,
)
from recallstack.modules.admin.infrastructure.dsa_workbook import XlsxDsaWorkbookReader


def _problem(index: int, title: str = "Maximum Subarray") -> DsaProblem:
    raw: dict[str, object] = {
        "source_index": index,
        "category": "Arrays",
        "title": title,
        "companies": None,
        "remarks": None,
        "difficulty": "easy",
        "url": "https://leetcode.com/problems/maximum-subarray/",
    }
    return DsaProblem(
        source_index=index,
        source_row=19 + index,
        category="Arrays",
        title=title,
        companies=None,
        remarks=None,
        difficulty="easy",
        url=str(raw["url"]),
        provider_slug="leetcode",
        slug=normalize_slug(index, title),
        fingerprint=fingerprint_for(raw),
    )


class StubWorkbookReader:
    def __init__(self, problems: tuple[DsaProblem, ...]) -> None:
        self.problems = problems

    def read(self, path: Path) -> DsaWorkbook:
        del path
        return DsaWorkbook(self.problems)


class StubStateReader:
    def __init__(self, states: dict[str, ImportContentState | None] | None = None) -> None:
        self.states = states or {}
        self.domain_id = uuid4()
        self.category_id = uuid4()

    async def validate_admin_actor(self, actor_id: UUID) -> bool:
        del actor_id
        return True

    async def references(self) -> ImportReferences:
        return ImportReferences(
            self.domain_id,
            {slug: self.category_id for slug in CATEGORY_SLUGS.values()},
            {"leetcode": 1},
        )

    async def content_state(self, *, domain_id: UUID, slug: str) -> ImportContentState | None:
        assert domain_id == self.domain_id
        return self.states.get(slug)


class StubContentService:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.content_id = uuid4()
        self.version_id = uuid4()

    async def create_content(self, **kwargs: object) -> SimpleNamespace:
        del kwargs
        self.calls.append("create")
        return SimpleNamespace(content_item_id=self.content_id, draft_version_id=self.version_id)

    async def update_document(self, **kwargs: object) -> SimpleNamespace:
        del kwargs
        self.calls.append("document")
        return SimpleNamespace(row_version=2)

    async def replace_practice_resources(self, **kwargs: object) -> SimpleNamespace:
        del kwargs
        self.calls.append("resources")
        return SimpleNamespace(revision=2)

    async def submit_review(self, **kwargs: object) -> SimpleNamespace:
        del kwargs
        self.calls.append("review")
        return SimpleNamespace(row_version=3)

    async def publish(self, **kwargs: object) -> SimpleNamespace:
        del kwargs
        self.calls.append("publish")
        return SimpleNamespace(row_version=4)


@pytest.mark.asyncio
async def test_dry_run_classifies_create_update_and_unchanged_without_writes() -> None:
    create, update, unchanged = _problem(1), _problem(2), _problem(3)
    states: dict[str, ImportContentState | None] = {
        update.slug: ImportContentState(uuid4(), "old", None, None, None, 1, None),
        unchanged.slug: ImportContentState(
            uuid4(), unchanged.fingerprint, None, None, None, 2, uuid4()
        ),
    }
    service = StubContentService()
    importer = DsaWorkbookImporter(
        workbook_reader=StubWorkbookReader((create, update, unchanged)),
        state_reader=StubStateReader(states),
        content_service=service,  # type: ignore[arg-type]
    )

    report = await importer.run(source_path=Path("ignored.xlsx"), apply=False, actor_id=None)

    assert (report.would_create, report.would_update, report.unchanged) == (1, 1, 1)
    assert report.applied == 0
    assert service.calls == []


@pytest.mark.asyncio
async def test_apply_routes_new_problem_through_complete_admin_workflow() -> None:
    service = StubContentService()
    importer = DsaWorkbookImporter(
        workbook_reader=StubWorkbookReader((_problem(1),)),
        state_reader=StubStateReader(),
        content_service=service,  # type: ignore[arg-type]
    )

    report = await importer.run(source_path=Path("ignored.xlsx"), apply=True, actor_id=uuid4())

    assert report.applied == 1
    assert report.failed == 0
    assert service.calls == ["create", "document", "resources", "review", "publish"]


def test_url_and_slug_normalization_are_deterministic() -> None:
    assert normalize_practice_url("http://geeksforgeeks.org/example/#part") == (
        "https://www.geeksforgeeks.org/example/"
    )
    assert provider_for_url("https://practice.geeksforgeeks.org/problems/example") == (
        "geeksforgeeks"
    )
    assert normalize_slug(9, "Repeat & Missing Number") == (
        "ultimate-dsa-009-repeat-missing-number"
    )


def test_xlsx_reader_extracts_source_fields_and_difficulty(tmp_path: Path) -> None:
    workbook = tmp_path / "sample.xlsx"
    with ZipFile(workbook, "w") as archive:
        archive.writestr(
            "xl/sharedStrings.xml",
            '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            "<si><t>Arrays</t></si><si><t>Maximum Subarray</t></si>"
            "<si><t>Google</t></si><si><t>Classic</t></si></sst>",
        )
        archive.writestr(
            "xl/styles.xml",
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<cellXfs count="2"><xf fillId="0"/><xf fillId="4"/></cellXfs></styleSheet>',
        )
        archive.writestr(
            "xl/workbook.xml",
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheetData><row r="20"><c r="A20"><v>1</v></c>'
            '<c r="D20" s="1" t="s"><v>0</v></c><c r="E20" t="s"><v>1</v></c>'
            '<c r="F20" t="s"><v>2</v></c><c r="G20" t="s"><v>3</v></c>'
            '</row></sheetData><hyperlinks><hyperlink ref="E20" r:id="rId1"/>'
            "</hyperlinks></worksheet>",
        )
        archive.writestr(
            "xl/worksheets/_rels/sheet1.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="https://leetcode.com/problems/maximum-subarray/"/>'
            "</Relationships>",
        )

    parsed = XlsxDsaWorkbookReader().read(workbook)

    assert len(parsed.problems) == 1
    problem = parsed.problems[0]
    assert (problem.source_index, problem.difficulty, problem.provider_slug) == (
        1,
        "easy",
        "leetcode",
    )
    assert (problem.category, problem.title, problem.companies, problem.remarks) == (
        "Arrays",
        "Maximum Subarray",
        "Google",
        "Classic",
    )
