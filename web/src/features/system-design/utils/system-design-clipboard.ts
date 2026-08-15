import type {
  SystemDesignClipboardFragment,
  SystemDesignDiagram,
  SystemDesignDocument,
  SystemDesignEdge,
  SystemDesignNode,
} from "../types/system-design.types";
import {
  SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_KIND,
  SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_VERSION,
} from "../types/system-design.types";
import {
  cloneSystemDesignDiagram,
  createSystemDesignId,
} from "./system-design-defaults";
import {
  SystemDesignValidationError,
  parseSystemDesignDocument,
} from "./diagram-validation";

export const SYSTEM_DESIGN_CLIPBOARD_MIME =
  "application/x-recallstack-system-design-fragment+json";

export class SystemDesignClipboardError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SystemDesignClipboardError";
  }
}

function cloneNode(node: SystemDesignNode): SystemDesignNode {
  return {
    ...node,
    technology: node.technology ? { ...node.technology } : undefined,
    asset: node.asset ? { ...node.asset } : undefined,
    metadata: node.metadata ? { ...node.metadata } : undefined,
  };
}

function cloneEdge(edge: SystemDesignEdge): SystemDesignEdge {
  return {
    ...edge,
    dashPattern: edge.dashPattern ? [...edge.dashPattern] : undefined,
  };
}

export function createSystemDesignClipboardFragment(
  document: SystemDesignDocument,
  diagramId: string,
  selectedNodeIds: readonly string[],
  fragmentId = createSystemDesignId("fragment"),
): SystemDesignClipboardFragment | null {
  const diagram = document.diagrams[diagramId];
  if (!diagram) return null;
  const selected = new Set(selectedNodeIds);
  const nodes = diagram.nodes
    .filter((node) => selected.has(node.id))
    .map(cloneNode);
  if (nodes.length === 0) return null;

  const diagrams: Record<string, SystemDesignDiagram> = {};
  const copyDiagramTree = (
    childDiagramId: string,
    ancestors: ReadonlySet<string>,
  ) => {
    if (diagrams[childDiagramId] || ancestors.has(childDiagramId)) return;
    const child = document.diagrams[childDiagramId];
    if (!child) return;
    diagrams[childDiagramId] = cloneSystemDesignDiagram(child);
    const nextAncestors = new Set(ancestors).add(childDiagramId);
    child.nodes.forEach((node) => {
      if (node.childDiagramId) copyDiagramTree(node.childDiagramId, nextAncestors);
    });
  };
  nodes.forEach((node) => {
    if (node.childDiagramId) {
      copyDiagramTree(node.childDiagramId, new Set([diagram.id]));
    }
  });

  return {
    kind: SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_KIND,
    version: SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_VERSION,
    id: fragmentId,
    sourceDiagramId: diagram.id,
    nodes,
    edges: diagram.edges
      .filter(
        (edge) =>
          selected.has(edge.sourceNodeId) && selected.has(edge.targetNodeId),
      )
      .map(cloneEdge),
    diagrams,
  };
}

export function cloneSystemDesignClipboardFragment(
  fragment: SystemDesignClipboardFragment,
): SystemDesignClipboardFragment {
  return {
    ...fragment,
    nodes: fragment.nodes.map(cloneNode),
    edges: fragment.edges.map(cloneEdge),
    diagrams: Object.fromEntries(
      Object.entries(fragment.diagrams).map(([diagramId, diagram]) => [
        diagramId,
        cloneSystemDesignDiagram(diagram),
      ]),
    ),
  };
}

export function serializeSystemDesignClipboardFragment(
  fragment: SystemDesignClipboardFragment,
): string {
  return JSON.stringify(cloneSystemDesignClipboardFragment(fragment));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildValidatedFragmentDocument(
  value: Record<string, unknown>,
): { document: SystemDesignDocument; rootDiagramId: string } {
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new SystemDesignClipboardError(
      "The clipboard fragment must contain node and connection arrays.",
    );
  }
  if (!isRecord(value.diagrams)) {
    throw new SystemDesignClipboardError(
      "The clipboard fragment must contain its nested diagrams.",
    );
  }

  const selectedNodeIds = new Set(
    value.nodes.flatMap((node) =>
      isRecord(node) && typeof node.id === "string" ? [node.id] : [],
    ),
  );
  const normalizedNodes = value.nodes.map((node) => {
    if (!isRecord(node)) return node;
    if (
      typeof node.parentModuleId === "string" &&
      !selectedNodeIds.has(node.parentModuleId)
    ) {
      const normalized = { ...node };
      delete normalized.parentModuleId;
      return normalized;
    }
    return node;
  });
  let rootDiagramId = `clipboard-root-${String(value.id)}`;
  while (Object.prototype.hasOwnProperty.call(value.diagrams, rootDiagramId)) {
    rootDiagramId = `${rootDiagramId}-root`;
  }
  const timestamp = "2026-01-01T00:00:00.000Z";
  try {
    return {
      rootDiagramId,
      document: parseSystemDesignDocument({
        schemaVersion: 2,
        id: `clipboard-document-${String(value.id)}`,
        problemId: "clipboard-fragment",
        title: "Clipboard fragment",
        status: "in_progress",
        rootDiagramId,
        diagrams: {
          ...value.diagrams,
          [rootDiagramId]: {
            id: rootDiagramId,
            name: "Clipboard fragment",
            nodes: normalizedNodes,
            edges: value.edges,
            viewport: { x: 0, y: 0, zoom: 1 },
          },
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    };
  } catch (error) {
    if (error instanceof SystemDesignValidationError) {
      throw new SystemDesignClipboardError(
        `The clipboard diagram fragment is invalid. ${error.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

export function parseSystemDesignClipboardFragment(
  input: string | unknown,
): SystemDesignClipboardFragment {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      throw new SystemDesignClipboardError(
        "The clipboard does not contain valid diagram JSON.",
        { cause: error },
      );
    }
  }
  if (
    !isRecord(value) ||
    value.kind !== SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_KIND ||
    value.version !== SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_VERSION ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.sourceDiagramId !== "string" ||
    !value.sourceDiagramId.trim()
  ) {
    throw new SystemDesignClipboardError(
      "The clipboard does not contain a Recall Stack diagram fragment.",
    );
  }

  const { document, rootDiagramId } = buildValidatedFragmentDocument(value);
  const root = document.diagrams[rootDiagramId];
  const diagrams = { ...document.diagrams };
  delete diagrams[rootDiagramId];
  return {
    kind: SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_KIND,
    version: SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_VERSION,
    id: value.id,
    sourceDiagramId: value.sourceDiagramId,
    nodes: root.nodes,
    edges: root.edges,
    diagrams,
  };
}

export function tryParseSystemDesignClipboardFragment(
  input: string,
): SystemDesignClipboardFragment | null {
  try {
    return parseSystemDesignClipboardFragment(input);
  } catch {
    return null;
  }
}
