import type { DiagramShapeDefinition, DiagramShapeElement } from "../../core/types";
import { renderGenericShapeSvg } from "../generic";
import { parseErdFields } from "./ErdFieldsField";

function escape(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

export function renderErdEntitySvg(element: DiagramShapeElement): string {
  const fields = parseErdFields(element.data?.fields);
  const stroke = element.style?.stroke ?? "#38bdf8";
  const rows = fields.map((field, index) => `<text x="8" y="${54 + index * 24}" fill="${field.key === "PK" ? "#fbbf24" : field.key === "FK" ? "#c084fc" : "#71717a"}" font-family="monospace" font-size="10" font-weight="700">${field.key}</text><text x="36" y="${54 + index * 24}" fill="#e4e4e7" font-family="Inter,Arial" font-size="11">${escape(field.name)}</text><text x="${element.width - 10}" y="${54 + index * 24}" text-anchor="end" fill="#94a3b8" font-family="monospace" font-size="9">${escape(field.dataType)}</text>`).join("");
  return `<rect width="${element.width}" height="${element.height}" rx="8" fill="${element.style?.fill ?? "#18181b"}" stroke="${stroke}" stroke-width="${element.style?.strokeWidth ?? 1.5}"/><path d="M8 0H${element.width - 8}Q${element.width} 0 ${element.width} 8V34H0V8Q0 0 8 0Z" fill="#0c4a6e"/><text x="10" y="22" fill="#f8fafc" font-family="Inter,Arial" font-size="14" font-weight="700">${escape(element.label)}</text>${rows}`;
}

export function renderErdSimpleSvg(element: DiagramShapeElement, definition: DiagramShapeDefinition): string { return renderGenericShapeSvg(element, definition); }
