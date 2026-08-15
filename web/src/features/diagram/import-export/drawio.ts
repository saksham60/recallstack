import type { DiagramRegistry } from "../core/registry";
import { createDiagramConnector, createDiagramDocument, createDiagramShape } from "../core/state";
import type { DiagramConnectorElement, DiagramDocument, DiagramPage, DiagramPositionedElement } from "../core/types";

const MAX_DRAWIO_BYTES = 2 * 1024 * 1024;

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function shapeStyle(shapeId: string): string {
  if (shapeId.endsWith(".ellipse") || shapeId.endsWith(".circle") || shapeId.endsWith(".start-end")) return "ellipse;whiteSpace=wrap;html=0;";
  if (shapeId.endsWith(".diamond") || shapeId.endsWith(".decision")) return "rhombus;whiteSpace=wrap;html=0;";
  if (shapeId.endsWith(".cylinder") || shapeId.endsWith(".database")) return "shape=cylinder3;whiteSpace=wrap;html=0;boundedLbl=1;";
  if (shapeId.endsWith(".rounded-rectangle") || shapeId.endsWith(".process")) return "rounded=1;whiteSpace=wrap;html=0;";
  return "rounded=0;whiteSpace=wrap;html=0;";
}

export function createDrawioXml(page: DiagramPage): string {
  const nodes = page.elements.filter((element): element is DiagramPositionedElement => element.visible && element.kind !== "connector" && element.kind !== "group");
  const nodeIds = new Set(nodes.map((element) => element.id));
  const vertices = nodes.map((element) => {
    const label = element.kind === "shape" || element.kind === "frame" ? element.label : element.kind === "text" ? element.text : element.kind === "image" ? element.label ?? "Image" : element.label ?? "Group";
    const style = element.kind === "shape" ? shapeStyle(element.shapeDefinitionId) : element.kind === "frame" ? "swimlane;html=0;" : "text;html=0;strokeColor=none;fillColor=none;";
    return `<mxCell id="${escapeXml(element.id)}" value="${escapeXml(label)}" style="${style}rotation=${element.rotation};fillColor=${escapeXml(element.style?.fill ?? "none")};strokeColor=${escapeXml(element.style?.stroke ?? "none")};" vertex="1" parent="1"><mxGeometry x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" as="geometry"/></mxCell>`;
  }).join("");
  const edges = page.elements.filter((element): element is DiagramConnectorElement => element.kind === "connector" && element.visible && nodeIds.has(element.source.elementId) && nodeIds.has(element.target.elementId)).map((element) => `<mxCell id="${escapeXml(element.id)}" value="${escapeXml(element.labels[0]?.text ?? "")}" style="edgeStyle=${element.routing === "orthogonal" ? "orthogonalEdgeStyle" : "none"};html=0;endArrow=${element.style?.endArrowhead === "none" ? "none" : "classic"};dashed=${element.style?.strokeStyle === "dashed" ? "1" : "0"};" edge="1" parent="1" source="${escapeXml(element.source.elementId)}" target="${escapeXml(element.target.elementId)}"><mxGeometry relative="1" as="geometry"/></mxCell>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="Recall Stack" version="subset-1"><diagram name="${escapeXml(page.name)}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${vertices}${edges}</root></mxGraphModel></diagram></mxfile>`;
}

export function downloadDrawioXml(document: DiagramDocument, page: DiagramPage): void {
  const blob = new Blob([createDrawioXml(page)], { type: "application/vnd.jgraph.mxfile+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${document.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram"}.drawio`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function importedShape(style: string): string {
  if (style.includes("ellipse")) return "generic.ellipse";
  if (style.includes("rhombus")) return "generic.diamond";
  if (style.includes("cylinder")) return "generic.cylinder";
  if (style.includes("rounded=1")) return "generic.rounded-rectangle";
  return "generic.rectangle";
}

export function parseDrawioXml(source: string, registry: DiagramRegistry, title = "Imported diagram"): DiagramDocument {
  if (new TextEncoder().encode(source).byteLength > MAX_DRAWIO_BYTES) throw new Error("diagrams.net files must be 2 MB or smaller.");
  if (/<!doctype|<!entity|<script\b|<foreignObject\b/i.test(source)) throw new Error("Unsafe XML content was rejected.");
  if (typeof DOMParser === "undefined") throw new Error("diagrams.net import requires a browser.");
  const xml = new DOMParser().parseFromString(source, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("The diagrams.net XML is invalid.");
  const document = createDiagramDocument(title, ["generic", "system-design", "flowchart"]);
  const page = document.pages[document.rootPageId];
  const idMap = new Map<string, string>();
  for (const cell of xml.querySelectorAll("mxCell[vertex='1']")) {
    const geometry = cell.querySelector("mxGeometry");
    if (!geometry) continue;
    const x = Number(geometry.getAttribute("x") ?? 0);
    const y = Number(geometry.getAttribute("y") ?? 0);
    const width = Number(geometry.getAttribute("width") ?? 160);
    const height = Number(geometry.getAttribute("height") ?? 96);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    const shape = createDiagramShape(registry, importedShape(cell.getAttribute("style") ?? ""), { x, y }, { width, height, label: cell.getAttribute("value") ?? "" });
    const sourceId = cell.getAttribute("id");
    if (sourceId) idMap.set(sourceId, shape.id);
    page.elements.push(shape);
  }
  for (const cell of xml.querySelectorAll("mxCell[edge='1']")) {
    const sourceId = idMap.get(cell.getAttribute("source") ?? "");
    const targetId = idMap.get(cell.getAttribute("target") ?? "");
    if (!sourceId || !targetId || sourceId === targetId) continue;
    const style = cell.getAttribute("style") ?? "";
    const label = cell.getAttribute("value") ?? "";
    page.elements.push(createDiagramConnector(sourceId, "right", targetId, "left", { routing: style.includes("orthogonalEdgeStyle") ? "orthogonal" : "straight", labels: label ? [{ id: `${sourceId}_${targetId}_label`, text: label, position: 0.5 }] : [], style: { stroke: "#94a3b8", strokeWidth: 2, strokeStyle: style.includes("dashed=1") ? "dashed" : "solid", endArrowhead: style.includes("endArrow=none") ? "none" : "standard" } }));
  }
  page.name = xml.querySelector("diagram")?.getAttribute("name")?.trim() || "Page 1";
  return document;
}
