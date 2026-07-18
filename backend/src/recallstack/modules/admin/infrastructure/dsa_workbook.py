from pathlib import Path
from xml.etree.ElementTree import Element
from zipfile import BadZipFile, ZipFile

from defusedxml import ElementTree

from recallstack.modules.admin.application.dsa_import import (
    CATEGORY_SLUGS,
    DsaProblem,
    DsaWorkbook,
    fingerprint_for,
    normalize_practice_url,
    normalize_slug,
    provider_for_url,
)

_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
_DIFFICULTY_BY_FILL = {4: "easy", 6: "medium", 8: "hard"}


class XlsxDsaWorkbookReader:
    """Read the approved workbook without requiring an office SDK at runtime."""

    def read(self, path: Path) -> DsaWorkbook:
        if not path.is_file():
            raise ValueError(f"Workbook does not exist: {path}")
        try:
            with ZipFile(path) as archive:
                shared_strings = self._shared_strings(archive)
                style_fills = self._style_fills(archive)
                sheet_path = self._first_sheet_path(archive)
                sheet = ElementTree.fromstring(archive.read(sheet_path))
                hyperlinks = self._hyperlinks(archive, sheet_path, sheet)
                problems = self._problems(sheet, shared_strings, style_fills, hyperlinks)
        except (BadZipFile, KeyError, ElementTree.ParseError) as exc:
            raise ValueError("The source is not a valid supported XLSX workbook") from exc
        if not problems:
            raise ValueError("The workbook contains no DSA problem rows")
        source_indexes = [problem.source_index for problem in problems]
        if len(source_indexes) != len(set(source_indexes)):
            raise ValueError("Workbook source indexes must be unique")
        return DsaWorkbook(tuple(problems))

    @staticmethod
    def _shared_strings(archive: ZipFile) -> list[str]:
        try:
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
        except KeyError:
            return []
        strings: list[str] = []
        for item in root.findall(f"{{{_MAIN_NS}}}si"):
            strings.append("".join(node.text or "" for node in item.iter(f"{{{_MAIN_NS}}}t")))
        return strings

    @staticmethod
    def _style_fills(archive: ZipFile) -> list[int]:
        root = ElementTree.fromstring(archive.read("xl/styles.xml"))
        cell_xfs = root.find(f"{{{_MAIN_NS}}}cellXfs")
        if cell_xfs is None:
            raise ValueError("Workbook has no cell styles")
        return [int(style.attrib.get("fillId", "0")) for style in cell_xfs]

    @staticmethod
    def _first_sheet_path(archive: ZipFile) -> str:
        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        sheet = workbook.find(f".//{{{_MAIN_NS}}}sheet")
        if sheet is None:
            raise ValueError("Workbook has no worksheets")
        relation_id = sheet.attrib[f"{{{_REL_NS}}}id"]
        relationships = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        for relation in relationships.findall(f"{{{_PACKAGE_REL_NS}}}Relationship"):
            if relation.attrib.get("Id") == relation_id:
                target = relation.attrib["Target"].lstrip("/")
                return target if target.startswith("xl/") else f"xl/{target}"
        raise ValueError("Workbook worksheet relationship is missing")

    @staticmethod
    def _hyperlinks(archive: ZipFile, sheet_path: str, sheet: Element) -> dict[str, str]:
        parent, name = sheet_path.rsplit("/", 1)
        rel_path = f"{parent}/_rels/{name}.rels"
        try:
            relationships = ElementTree.fromstring(archive.read(rel_path))
        except KeyError:
            relationships = Element("relationships")
        targets = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relationships.findall(f"{{{_PACKAGE_REL_NS}}}Relationship")
            if "Id" in relation.attrib and "Target" in relation.attrib
        }
        result: dict[str, str] = {}
        for link in sheet.findall(f".//{{{_MAIN_NS}}}hyperlink"):
            relation_id = link.attrib.get(f"{{{_REL_NS}}}id")
            if relation_id and relation_id in targets:
                result[link.attrib["ref"]] = targets[relation_id]
        return result

    def _problems(
        self,
        sheet: Element,
        shared_strings: list[str],
        style_fills: list[int],
        hyperlinks: dict[str, str],
    ) -> list[DsaProblem]:
        problems: list[DsaProblem] = []
        for row in sheet.findall(f".//{{{_MAIN_NS}}}sheetData/{{{_MAIN_NS}}}row"):
            row_number = int(row.attrib["r"])
            if row_number < 20:
                continue
            cells = {
                self._column(cell.attrib["r"]): cell for cell in row.findall(f"{{{_MAIN_NS}}}c")
            }
            source_value = self._cell_value(cells.get("A"), shared_strings)
            title = self._cell_value(cells.get("E"), shared_strings).strip()
            if not source_value and not title:
                continue
            if not title:
                continue  # numbered separator row in the approved workbook
            category = self._cell_value(cells.get("D"), shared_strings).strip()
            if category not in CATEGORY_SLUGS:
                raise ValueError(f"Unknown DSA category at row {row_number}: {category!r}")
            try:
                source_index = int(float(source_value))
            except ValueError as exc:
                raise ValueError(f"Invalid source index at row {row_number}") from exc
            difficulty_cell = cells.get("D")
            style_index = (
                int(difficulty_cell.attrib.get("s", "0")) if difficulty_cell is not None else 0
            )
            try:
                difficulty = _DIFFICULTY_BY_FILL[style_fills[style_index]]
            except (IndexError, KeyError) as exc:
                raise ValueError(f"Unknown difficulty style at row {row_number}") from exc
            raw_url = hyperlinks.get(f"E{row_number}")
            if not raw_url:
                raise ValueError(f"Missing problem hyperlink at row {row_number}")
            url = normalize_practice_url(raw_url)
            companies = self._none_if_blank(self._cell_value(cells.get("F"), shared_strings))
            remarks = self._none_if_blank(self._cell_value(cells.get("G"), shared_strings))
            raw = {
                "source_index": source_index,
                "category": category,
                "title": title,
                "companies": companies,
                "remarks": remarks,
                "difficulty": difficulty,
                "url": url,
            }
            problems.append(
                DsaProblem(
                    source_index=source_index,
                    source_row=row_number,
                    category=category,
                    title=title,
                    companies=companies,
                    remarks=remarks,
                    difficulty=difficulty,
                    url=url,
                    provider_slug=provider_for_url(url),
                    slug=normalize_slug(source_index, title),
                    fingerprint=fingerprint_for(raw),
                )
            )
        return problems

    @staticmethod
    def _column(reference: str) -> str:
        return "".join(character for character in reference if character.isalpha())

    @staticmethod
    def _cell_value(cell: Element | None, shared_strings: list[str]) -> str:
        if cell is None:
            return ""
        value = cell.find(f"{{{_MAIN_NS}}}v")
        if value is None or value.text is None:
            inline = cell.find(f".//{{{_MAIN_NS}}}t")
            return inline.text or "" if inline is not None else ""
        if cell.attrib.get("t") == "s":
            return shared_strings[int(value.text)]
        return value.text

    @staticmethod
    def _none_if_blank(value: str) -> str | None:
        stripped = value.strip()
        return stripped or None
