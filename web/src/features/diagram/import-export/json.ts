import {
  DIAGRAM_SCHEMA_VERSION,
  type DiagramConnectorElement,
  type DiagramDocument,
  type DiagramElement,
  type DiagramPage,
  type DiagramPositionedElement,
} from "../core/types";
import { validateDiagramImageAsset } from "./assets";

export type DiagramMigrationProvider = (value: unknown) => DiagramDocument | null;

export class DiagramImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagramImportError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function point(value: unknown): boolean {
  return record(value) && finite(value.x) && finite(value.y) && Math.abs(value.x) <= 10_000_000 && Math.abs(value.y) <= 10_000_000;
}

function validatePositioned(element: Record<string, unknown>): element is Record<string, unknown> & DiagramPositionedElement {
  return finite(element.x) && finite(element.y) && Math.abs(element.x) <= 10_000_000 && Math.abs(element.y) <= 10_000_000 && finite(element.width) && finite(element.height) && element.width > 0 && element.height > 0 && element.width <= 100_000 && element.height <= 100_000 && finite(element.rotation) && Math.abs(element.rotation) <= 360_000;
}

function validateElement(value: unknown): value is DiagramElement {
  if (!record(value) || !text(value.id) || !text(value.kind)) return false;
  if (!Number.isInteger(value.layer) || (value.layer as number) < 0 || typeof value.visible !== "boolean" || typeof value.locked !== "boolean") return false;
  if (value.parentGroupId !== undefined && !text(value.parentGroupId)) return false;
  if (value.kind === "connector") {
    const connector = value as Partial<DiagramConnectorElement>;
    return (
      record(connector.source) &&
      text(connector.source.elementId) &&
      text(connector.source.portId) &&
      record(connector.target) &&
      text(connector.target.elementId) &&
      text(connector.target.portId) &&
      ["straight", "curved", "orthogonal"].includes(String(connector.routing)) &&
      Array.isArray(connector.waypoints) && connector.waypoints.length <= 10_000 && connector.waypoints.every(point) &&
      Array.isArray(connector.labels) && connector.labels.length <= 100 && connector.labels.every((label) => record(label) && text(label.id) && typeof label.text === "string" && finite(label.position) && label.position >= 0 && label.position <= 1)
    );
  }
  if (!validatePositioned(value)) return false;
  if (value.kind === "shape") return text(value.shapeDefinitionId) && typeof value.label === "string";
  if (value.kind === "frame") return text(value.frameDefinitionId) && typeof value.label === "string";
  if (value.kind === "text") return typeof value.text === "string";
  if (value.kind === "image") {
    try { validateDiagramImageAsset(value.asset); return true; }
    catch { return false; }
  }
  if (value.kind === "group") return Array.isArray(value.childElementIds) && value.childElementIds.every(text);
  return false;
}

function validatePage(value: unknown): value is DiagramPage {
  return (
    record(value) &&
    text(value.id) &&
    text(value.name) &&
    Array.isArray(value.elements) &&
    value.elements.every(validateElement) &&
    record(value.viewport) &&
    finite(value.viewport.x) &&
    finite(value.viewport.y) &&
    finite(value.viewport.zoom) &&
    value.viewport.zoom >= 0.05 &&
    value.viewport.zoom <= 8
  );
}

export function validateDiagramDocument(value: unknown): DiagramDocument {
  if (!record(value)) throw new DiagramImportError("The diagram must be a JSON object.");
  if (value.schemaVersion !== DIAGRAM_SCHEMA_VERSION) {
    throw new DiagramImportError(`Unsupported diagram schema version "${String(value.schemaVersion)}".`);
  }
  if (!text(value.id) || !text(value.title) || !text(value.rootPageId)) {
    throw new DiagramImportError("The diagram identity, title, and root page are required.");
  }
  if (!Number.isInteger(value.revision) || (value.revision as number) < 0) {
    throw new DiagramImportError("The diagram revision must be a non-negative integer.");
  }
  if (!Array.isArray(value.enabledPackIds) || !value.enabledPackIds.every(text)) {
    throw new DiagramImportError("enabledPackIds must contain stable pack IDs.");
  }
  if (!record(value.pages)) throw new DiagramImportError("The diagram pages are missing.");
  const pages = Object.values(value.pages);
  if (pages.length === 0 || !pages.every(validatePage)) {
    throw new DiagramImportError("One or more diagram pages are invalid.");
  }
  if (!record(value.pages[value.rootPageId])) {
    throw new DiagramImportError("The root page does not exist.");
  }
  if (!Array.isArray(value.pageOrder) || !value.pageOrder.every(text) || new Set(value.pageOrder).size !== value.pageOrder.length) {
    throw new DiagramImportError("pageOrder must contain unique top-level page IDs.");
  }
  if (!text(value.createdAt) || !text(value.updatedAt)) {
    throw new DiagramImportError("The diagram timestamps are required.");
  }

  const typedPages = pages as DiagramPage[];
  const pageOrder = value.pageOrder as string[];
  const topLevelIds = typedPages.filter((page) => !page.parentElementId).map((page) => page.id);
  if (pageOrder[0] !== value.rootPageId || pageOrder.length !== topLevelIds.length || topLevelIds.some((pageId) => !pageOrder.includes(pageId))) {
    throw new DiagramImportError("pageOrder must start with the root page and include every top-level page exactly once.");
  }
  const globalElementIds = new Set<string>();
  const elementsById = new Map<string, DiagramElement>();
  for (const page of typedPages) {
    const ids = new Set(page.elements.map((element) => element.id));
    const pageElementsById = new Map(page.elements.map((element) => [element.id, element]));
    if (ids.size !== page.elements.length) {
      throw new DiagramImportError(`Page "${page.id}" contains duplicate element IDs.`);
    }
    for (const element of page.elements) {
      if (globalElementIds.has(element.id)) throw new DiagramImportError(`Element ID "${element.id}" is duplicated across pages.`);
      globalElementIds.add(element.id);
      elementsById.set(element.id, element);
    }
    for (const element of page.elements) {
      if (element.kind === "connector" && (!ids.has(element.source.elementId) || !ids.has(element.target.elementId))) {
        throw new DiagramImportError(`Connector "${element.id}" has a dangling endpoint.`);
      }
      if (element.kind === "connector" && element.source.elementId === element.target.elementId) {
        throw new DiagramImportError(`Connector "${element.id}" cannot connect an element to itself.`);
      }
      if (element.kind === "group") {
        if (element.parentGroupId) {
          throw new DiagramImportError(`Nested group "${element.id}" is not supported.`);
        }
        if (element.childElementIds.length < 2 || new Set(element.childElementIds).size !== element.childElementIds.length) {
          throw new DiagramImportError(`Group "${element.id}" must contain at least two unique children.`);
        }
        for (const childId of element.childElementIds) {
          const child = pageElementsById.get(childId);
          if (!child || child.kind === "connector" || child.kind === "group" || child.parentGroupId !== element.id) {
            throw new DiagramImportError(`Group "${element.id}" has inconsistent child membership.`);
          }
        }
      }
      if (element.parentGroupId) {
        const parent = pageElementsById.get(element.parentGroupId);
        if (parent?.kind !== "group" || !parent.childElementIds.includes(element.id)) {
          throw new DiagramImportError(`Element "${element.id}" has inconsistent group membership.`);
        }
      }
    }
  }
  const pagesById = value.pages as Record<string, DiagramPage>;
  for (const currentPage of typedPages) {
    if (currentPage.id === value.rootPageId && currentPage.parentElementId) {
      throw new DiagramImportError("The root page cannot be a nested child page.");
    }
    if (currentPage.parentElementId) {
      const owner = elementsById.get(currentPage.parentElementId);
      if (!owner || (owner.kind !== "shape" && owner.kind !== "frame") || owner.childPageId !== currentPage.id) {
        throw new DiagramImportError(`Nested page "${currentPage.id}" has an invalid parent element.`);
      }
    }
    for (const element of currentPage.elements) {
      if ((element.kind === "shape" || element.kind === "frame") && element.childPageId) {
        const child = pagesById[element.childPageId];
        if (!child || child.parentElementId !== element.id) {
          throw new DiagramImportError(`Element "${element.id}" has an invalid child page.`);
        }
      }
    }
  }
  for (const currentPage of typedPages) {
    const visited = new Set<string>();
    let cursor: DiagramPage | undefined = currentPage;
    while (cursor?.parentElementId) {
      if (visited.has(cursor.id)) throw new DiagramImportError("Diagram pages contain a parent cycle.");
      visited.add(cursor.id);
      const ownerPage = typedPages.find((candidate) => candidate.elements.some((element) => element.id === cursor?.parentElementId));
      cursor = ownerPage;
    }
  }
  const document = structuredClone(value) as unknown as DiagramDocument;
  for (const currentPage of Object.values(document.pages)) {
    currentPage.elements = currentPage.elements.map((element) => element.kind === "image" ? { ...element, asset: validateDiagramImageAsset(element.asset) } : element);
  }
  return document;
}

function migrateGenericSchemaV1(value: Record<string, unknown>): DiagramDocument | null {
  if (value.schemaVersion !== 1 || !record(value.pages) || !text(value.rootPageId)) return null;
  const pageOrder = Object.values(value.pages).flatMap((page) =>
    record(page) && !text(page.parentElementId) && text(page.id) ? [page.id] : [],
  );
  const ordered = [value.rootPageId, ...pageOrder.filter((pageId) => pageId !== value.rootPageId)];
  return { ...structuredClone(value), schemaVersion: DIAGRAM_SCHEMA_VERSION, revision: Number.isInteger(value.revision) ? value.revision : 0, pageOrder: ordered } as unknown as DiagramDocument;
}

export function parseDiagramDocument(
  value: unknown,
  migrations: readonly DiagramMigrationProvider[] = [],
): DiagramDocument {
  if (record(value) && value.schemaVersion === DIAGRAM_SCHEMA_VERSION && record(value.pages)) {
    return validateDiagramDocument(value);
  }
  if (record(value)) {
    const generic = migrateGenericSchemaV1(value);
    if (generic) return validateDiagramDocument(generic);
  }
  for (const migrate of migrations) {
    const migrated = migrate(value);
    if (migrated) return validateDiagramDocument(migrated);
  }
  throw new DiagramImportError("This file is not a supported Recall Stack diagram.");
}

export function serializeDiagramDocument(document: DiagramDocument): string {
  return JSON.stringify(validateDiagramDocument(document), null, 2);
}

export function parseDiagramDocumentJson(
  serialized: string,
  migrations: readonly DiagramMigrationProvider[] = [],
): DiagramDocument {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new DiagramImportError(
      error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON.",
    );
  }
  return parseDiagramDocument(value, migrations);
}

export function createDiagramJsonFilename(title: string): string {
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "diagram"}.diagram.json`;
}

export function downloadDiagramJson(document: DiagramDocument): void {
  const blob = new Blob([serializeDiagramDocument(document)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = createDiagramJsonFilename(document.title);
  anchor.click();
  URL.revokeObjectURL(url);
}
