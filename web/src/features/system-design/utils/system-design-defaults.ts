import { getSystemDesignNodeDefinition } from "../constants/system-design-palette";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type ProblemStatus,
  type SystemDesignDocument,
  type SystemDesignDocumentSummary,
  type SystemDesignEdge,
  type SystemDesignEdgeType,
  type SystemDesignNode,
  type SystemDesignNodeType,
  type SystemDesignPoint,
  type SystemDesignPort,
  type SystemDesignProblem,
  type SystemDesignViewport,
} from "../types/system-design.types";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const MIN_NODE_WIDTH = 120;
export const MIN_NODE_HEIGHT = 72;
export const SYSTEM_DESIGN_HISTORY_LIMIT = 50;
export const SYSTEM_DESIGN_PASTE_OFFSET = 32;

export const DEFAULT_SYSTEM_DESIGN_VIEWPORT: Readonly<SystemDesignViewport> = {
  x: 0,
  y: 0,
  zoom: 1,
};

export function createNextSystemDesignTimestamp(
  previous: string,
  candidate = new Date().toISOString(),
): string {
  const previousTime = Date.parse(previous);
  const candidateTime = Date.parse(candidate);
  if (!Number.isFinite(previousTime)) return candidate;
  if (Number.isFinite(candidateTime) && candidateTime > previousTime) {
    return candidate;
  }
  return new Date(previousTime + 1).toISOString();
}

export function createSystemDesignId(prefix: string): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure random IDs are unavailable in this environment.");
  }
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

export function createEmptySystemDesignDocument(
  problem: Pick<SystemDesignProblem, "id" | "title">,
  now = new Date().toISOString(),
): SystemDesignDocument {
  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: createSystemDesignId("diagram"),
    problemId: problem.id,
    title: problem.title,
    status: "in_progress",
    nodes: [],
    edges: [],
    viewport: { ...DEFAULT_SYSTEM_DESIGN_VIEWPORT },
    createdAt: now,
    updatedAt: now,
  };
}

type NodeOverrides = Partial<
  Omit<SystemDesignNode, "id" | "type" | "x" | "y">
> & {
  id?: string;
};

export function createSystemDesignNode(
  type: SystemDesignNodeType,
  position: SystemDesignPoint,
  overrides: NodeOverrides = {},
): SystemDesignNode {
  const definition = getSystemDesignNodeDefinition(type);
  return {
    id: overrides.id ?? createSystemDesignId("node"),
    type,
    x: position.x,
    y: position.y,
    width: overrides.width ?? definition.defaultWidth,
    height: overrides.height ?? definition.defaultHeight,
    label: overrides.label ?? definition.label,
    subtitle: overrides.subtitle,
    technology: overrides.technology,
    description: overrides.description,
    layer: overrides.layer ?? 0,
    locked: overrides.locked ?? false,
    visible: overrides.visible ?? true,
    metadata: overrides.metadata ? { ...overrides.metadata } : undefined,
  };
}

type EdgeOverrides = Partial<
  Omit<
    SystemDesignEdge,
    | "id"
    | "sourceNodeId"
    | "targetNodeId"
    | "sourcePort"
    | "targetPort"
  >
> & {
  id?: string;
};

export function createSystemDesignEdge(
  sourceNodeId: string,
  targetNodeId: string,
  sourcePort: SystemDesignPort,
  targetPort: SystemDesignPort,
  overrides: EdgeOverrides = {},
): SystemDesignEdge {
  return {
    id: overrides.id ?? createSystemDesignId("edge"),
    sourceNodeId,
    targetNodeId,
    sourcePort,
    targetPort,
    type: overrides.type ?? ("request" satisfies SystemDesignEdgeType),
    label: overrides.label,
    protocol: overrides.protocol,
    description: overrides.description,
    routing: overrides.routing ?? "straight",
  };
}

export function cloneSystemDesignDocument(
  document: SystemDesignDocument,
): SystemDesignDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => ({
      ...node,
      metadata: node.metadata ? { ...node.metadata } : undefined,
    })),
    edges: document.edges.map((edge) => ({ ...edge })),
    viewport: { ...document.viewport },
  };
}

export function normalizeSystemDesignLayers(
  nodes: readonly SystemDesignNode[],
): SystemDesignNode[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort(
      (left, right) =>
        left.node.layer - right.node.layer || left.index - right.index,
    )
    .map(({ node }, layer) => ({ ...node, layer }));
}

export function createSystemDesignDocumentSummary(
  document: SystemDesignDocument,
): SystemDesignDocumentSummary {
  return {
    problemId: document.problemId,
    title: document.title,
    status: deriveSystemDesignProblemStatus(document),
    nodeCount: document.nodes.length,
    edgeCount: document.edges.length,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export function deriveSystemDesignProblemStatus(
  document: SystemDesignDocument | null | undefined,
): ProblemStatus {
  if (!document) return "not_started";
  if (document.status === "completed") return "completed";
  return document.nodes.length > 0 ? "in_progress" : "not_started";
}
