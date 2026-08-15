import {
  DIAGRAM_SCHEMA_VERSION,
  type DiagramConnectorElement,
  type DiagramDocument,
  type DiagramDocumentSummary,
  type DiagramElement,
  type DiagramElementStyle,
  type DiagramFrameElement,
  type DiagramImageAsset,
  type DiagramImageElement,
  type DiagramPage,
  type DiagramPoint,
  type DiagramShapeElement,
  type DiagramTextStyle,
  type DiagramTextElement,
  type DiagramViewport,
} from "../types";
import type { DiagramRegistry } from "../registry";

export const DEFAULT_DIAGRAM_VIEWPORT: Readonly<DiagramViewport> = {
  x: 0,
  y: 0,
  zoom: 1,
};
export const DIAGRAM_HISTORY_LIMIT = 50;
export const DIAGRAM_PASTE_OFFSET = 32;

let sequence = 0;

export function createDiagramId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export function createDiagramDocumentId(): string {
  return globalThis.crypto.randomUUID();
}

export function createDiagramTimestamp(previous?: string): string {
  const now = Date.now();
  const previousTime = previous ? Date.parse(previous) : Number.NaN;
  return new Date(Number.isFinite(previousTime) && previousTime >= now ? previousTime + 1 : now).toISOString();
}

export function createDiagramPage(
  name = "Page 1",
  id = createDiagramId("page"),
): DiagramPage {
  return {
    id,
    name,
    elements: [],
    viewport: { ...DEFAULT_DIAGRAM_VIEWPORT },
  };
}

export function createDiagramDocument(
  title: string,
  enabledPackIds: readonly string[] = ["generic", "system-design", "flowchart"],
  id = createDiagramDocumentId(),
): DiagramDocument {
  const page = createDiagramPage();
  const timestamp = createDiagramTimestamp();
  return {
    schemaVersion: DIAGRAM_SCHEMA_VERSION,
    id,
    title,
    revision: 0,
    enabledPackIds: [...new Set(enabledPackIds)],
    rootPageId: page.id,
    pageOrder: [page.id],
    pages: { [page.id]: page },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDiagramShape(
  registry: DiagramRegistry,
  shapeDefinitionId: string,
  point: DiagramPoint,
  overrides: Partial<Omit<DiagramShapeElement, "id" | "kind" | "shapeDefinitionId">> = {},
): DiagramShapeElement {
  const definition = registry.requireShape(shapeDefinitionId);
  return {
    id: createDiagramId("shape"),
    kind: "shape",
    shapeDefinitionId,
    x: point.x,
    y: point.y,
    width: definition.defaultSize.width,
    height: definition.defaultSize.height,
    rotation: 0,
    label: definition.label,
    style: { ...definition.defaultStyle },
    textStyle: definition.defaultTextStyle
      ? { ...definition.defaultTextStyle }
      : undefined,
    data: definition.data ? structuredClone(definition.data) : undefined,
    layer: 0,
    visible: true,
    locked: false,
    ...overrides,
  };
}

export function createDiagramConnector(
  sourceElementId: string,
  sourcePortId: string,
  targetElementId: string,
  targetPortId: string,
  overrides: Partial<Omit<DiagramConnectorElement, "id" | "kind" | "source" | "target">> = {},
): DiagramConnectorElement {
  return {
    id: createDiagramId("connector"),
    kind: "connector",
    source: { elementId: sourceElementId, portId: sourcePortId },
    target: { elementId: targetElementId, portId: targetPortId },
    routing: "straight",
    waypoints: [],
    labels: [],
    style: {
      stroke: "#a1a1aa",
      strokeWidth: 2,
      opacity: 0.9,
      strokeStyle: "solid",
      startArrowhead: "none",
      endArrowhead: "standard",
    },
    layer: 0,
    visible: true,
    locked: false,
    ...overrides,
  };
}

export function createDiagramText(point: DiagramPoint, text = "Text"): DiagramTextElement {
  return {
    id: createDiagramId("text"), kind: "text", text,
    x: point.x, y: point.y, width: 220, height: 72, rotation: 0,
    style: { fill: "transparent", stroke: "transparent", opacity: 1 },
    textStyle: { color: "#f4f4f5", fontFamily: "Inter", fontSize: 16, fontWeight: "normal", align: "left", verticalAlign: "top", lineHeight: 1.25, padding: 8 },
    layer: 0, visible: true, locked: false,
  };
}

export function createDiagramFrame(point: DiagramPoint, label = "Frame"): DiagramFrameElement {
  return {
    id: createDiagramId("frame"), kind: "frame", frameDefinitionId: "generic.frame", label,
    x: point.x, y: point.y, width: 480, height: 320, rotation: 0,
    style: { fill: "#18181b22", stroke: "#71717a", strokeWidth: 1.5, strokeStyle: "dashed", opacity: 1, cornerRadius: 8 },
    textStyle: { color: "#d4d4d8", fontFamily: "Inter", fontSize: 13, fontWeight: "semibold", align: "left", verticalAlign: "top", padding: 12 },
    layer: 0, visible: true, locked: false,
  };
}

export function createDiagramImage(point: DiagramPoint, asset: DiagramImageAsset): DiagramImageElement {
  const maximumScale = Math.min(420 / asset.intrinsicWidth, 300 / asset.intrinsicHeight);
  const naturalScale = Math.min(1, maximumScale);
  const minimumUsableScale = 48 / Math.min(asset.intrinsicWidth, asset.intrinsicHeight);
  const scale = Math.min(maximumScale, Math.max(naturalScale, minimumUsableScale));
  return {
    id: createDiagramId("image"), kind: "image", asset,
    x: point.x, y: point.y,
    width: Math.max(1, Math.round(asset.intrinsicWidth * scale)),
    height: Math.max(1, Math.round(asset.intrinsicHeight * scale)),
    rotation: 0, style: { opacity: 1 }, layer: 0, visible: true, locked: false,
  };
}

export function cloneDiagramElement<T extends DiagramElement>(element: T): T {
  return structuredClone(element);
}

export function cloneDiagramDocument(document: DiagramDocument): DiagramDocument {
  return structuredClone(document);
}

export function duplicateDiagramDocument(
  document: DiagramDocument,
  title = `${document.title} Copy`,
  id = createDiagramDocumentId(),
): DiagramDocument {
  const timestamp = createDiagramTimestamp();
  return {
    ...cloneDiagramDocument(document),
    id,
    title,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getDiagramPage(
  document: DiagramDocument,
  pageId = document.rootPageId,
): DiagramPage {
  const page = document.pages[pageId];
  if (!page) throw new Error(`Diagram page "${pageId}" does not exist.`);
  return page;
}

export function replaceDiagramPage(
  document: DiagramDocument,
  page: DiagramPage,
): DiagramDocument {
  return {
    ...document,
    pages: { ...document.pages, [page.id]: page },
  };
}

export function normalizeDiagramLayers(elements: readonly DiagramElement[]): DiagramElement[] {
  return [...elements]
    .sort((left, right) => left.layer - right.layer)
    .map((element, layer) => ({ ...element, layer }));
}

export function createDiagramDocumentSummary(document: DiagramDocument): DiagramDocumentSummary {
  return {
    id: document.id,
    title: document.title,
    revision: document.revision,
    pageCount: Object.keys(document.pages).length,
    elementCount: Object.values(document.pages).reduce(
      (count, page) => count + page.elements.length,
      0,
    ),
    enabledPackIds: [...document.enabledPackIds],
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export function mergeDiagramElementStyle(
  style: DiagramElementStyle | undefined,
  patch: DiagramElementStyle,
): DiagramElementStyle {
  return { ...style, ...patch };
}

export function mergeDiagramTextStyle(
  style: DiagramTextStyle | undefined,
  patch: DiagramTextStyle,
): DiagramTextStyle {
  return { ...style, ...patch };
}
