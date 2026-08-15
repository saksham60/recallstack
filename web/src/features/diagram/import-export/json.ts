import {
  DIAGRAM_SCHEMA_VERSION,
  type DiagramConnectorElement,
  type DiagramDocument,
  type DiagramElement,
  type DiagramPage,
  type DiagramPositionedElement,
} from "../core/types";

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

function validatePositioned(element: Record<string, unknown>): element is Record<string, unknown> & DiagramPositionedElement {
  return finite(element.x) && finite(element.y) && finite(element.width) && finite(element.height) && element.width > 0 && element.height > 0 && finite(element.rotation);
}

function validateElement(value: unknown): value is DiagramElement {
  if (!record(value) || !text(value.id) || !text(value.kind)) return false;
  if (!finite(value.layer) || typeof value.visible !== "boolean" || typeof value.locked !== "boolean") return false;
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
      Array.isArray(connector.waypoints) &&
      Array.isArray(connector.labels)
    );
  }
  if (!validatePositioned(value)) return false;
  if (value.kind === "shape") return text(value.shapeDefinitionId) && typeof value.label === "string";
  if (value.kind === "frame") return text(value.frameDefinitionId) && typeof value.label === "string";
  if (value.kind === "text") return typeof value.text === "string";
  if (value.kind === "image") return record(value.asset) && text(value.asset.kind);
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
    value.viewport.zoom > 0
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
  if (!text(value.createdAt) || !text(value.updatedAt)) {
    throw new DiagramImportError("The diagram timestamps are required.");
  }

  for (const page of pages as DiagramPage[]) {
    const ids = new Set(page.elements.map((element) => element.id));
    if (ids.size !== page.elements.length) {
      throw new DiagramImportError(`Page "${page.id}" contains duplicate element IDs.`);
    }
    for (const element of page.elements) {
      if (element.kind === "connector" && (!ids.has(element.source.elementId) || !ids.has(element.target.elementId))) {
        throw new DiagramImportError(`Connector "${element.id}" has a dangling endpoint.`);
      }
      if (element.parentGroupId && !ids.has(element.parentGroupId)) {
        throw new DiagramImportError(`Element "${element.id}" references a missing group.`);
      }
    }
  }
  return structuredClone(value) as unknown as DiagramDocument;
}

export function parseDiagramDocument(
  value: unknown,
  migrations: readonly DiagramMigrationProvider[] = [],
): DiagramDocument {
  if (record(value) && value.schemaVersion === DIAGRAM_SCHEMA_VERSION && record(value.pages)) {
    return validateDiagramDocument(value);
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
