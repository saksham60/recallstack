import type {
  SystemDesignEdge,
  SystemDesignDiagram,
  SystemDesignNode,
  SystemDesignPoint,
  SystemDesignRect,
} from "../types/system-design.types";
import type {
  SystemDesignEdgePatch,
  SystemDesignNodePatch,
} from "../state/system-design-editor-actions";

const MAX_OPERATION_ENTITIES = 100;
const MAX_PATCH_BYTES = 64 * 1024;
const MAX_FREEHAND_COORDINATES = 20_000;

export type CanvasNodePatch = {
  [Key in keyof SystemDesignNodePatch]?: SystemDesignNodePatch[Key] | null;
};

export type CanvasEdgePatch = {
  [Key in keyof SystemDesignEdgePatch]?: SystemDesignEdgePatch[Key] | null;
};

export type CanvasOperation =
  | {
      kind: "node.add";
      diagramId: string;
      node: SystemDesignNode;
      transientSessionId?: string;
    }
  | {
      kind: "node.move";
      diagramId: string;
      positions: Record<string, SystemDesignPoint>;
    }
  | {
      kind: "node.resize";
      diagramId: string;
      nodeId: string;
      frame: SystemDesignRect;
    }
  | {
      kind: "node.update";
      diagramId: string;
      nodeId: string;
      patch: CanvasNodePatch;
    }
  | {
      kind: "nodes.update";
      diagramId: string;
      patches: Record<string, CanvasNodePatch>;
    }
  | { kind: "node.delete"; diagramId: string; nodeIds: string[] }
  | { kind: "edge.add"; diagramId: string; edge: SystemDesignEdge }
  | {
      kind: "edge.update";
      diagramId: string;
      edgeId: string;
      patch: CanvasEdgePatch;
    }
  | { kind: "edge.delete"; diagramId: string; edgeIds: string[] }
  | {
      kind: "diagram.add";
      diagramId: string;
      parentNodeId: string;
      diagram: SystemDesignDiagram;
    };

export class CanvasOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasOperationError";
  }
}

export function createCollaborationChildDiagramId(parentNodeId: string): string {
  let first = 2166136261;
  let second = 0x9e3779b9;
  for (let index = 0; index < parentNodeId.length; index += 1) {
    const code = parentNodeId.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 2246822519);
  }
  return `diagram_live_${(first >>> 0).toString(36)}_${(second >>> 0).toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function isPoint(value: unknown): value is SystemDesignPoint {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "x" || key === "y") &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isRect(value: unknown): value is SystemDesignRect {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) =>
      key === "x" || key === "y" || key === "width" || key === "height"
    ) &&
    typeof value.x === "number" && Number.isFinite(value.x) &&
    typeof value.y === "number" && Number.isFinite(value.y) &&
    typeof value.width === "number" && Number.isFinite(value.width) && value.width > 0 &&
    typeof value.height === "number" && Number.isFinite(value.height) && value.height > 0
  );
}

function isBoundedPayload(value: unknown, maximum = MAX_PATCH_BYTES): boolean {
  try {
    return JSON.stringify(value).length <= maximum;
  } catch {
    return false;
  }
}

function hasNodeEnvelope(value: unknown): value is SystemDesignNode {
  return (
    isRecord(value) && isBoundedPayload(value, 256 * 1024) &&
    isIdentifier(value.id) && typeof value.type === "string" &&
    typeof value.label === "string" &&
    typeof value.x === "number" && Number.isFinite(value.x) &&
    typeof value.y === "number" && Number.isFinite(value.y) &&
    typeof value.width === "number" && Number.isFinite(value.width) &&
    typeof value.height === "number" && Number.isFinite(value.height) &&
    Number.isInteger(value.layer) && typeof value.locked === "boolean" &&
    typeof value.visible === "boolean" &&
    (!isRecord(value.drawing) ||
      (Array.isArray(value.drawing.points) &&
        value.drawing.points.length <= MAX_FREEHAND_COORDINATES))
  );
}

function hasEdgeEnvelope(value: unknown): value is SystemDesignEdge {
  return (
    isRecord(value) && isBoundedPayload(value) && isIdentifier(value.id) &&
    isIdentifier(value.sourceNodeId) && isIdentifier(value.targetNodeId) &&
    typeof value.sourcePort === "string" && typeof value.targetPort === "string" &&
    typeof value.type === "string"
  );
}

function hasDiagramEnvelope(value: unknown): value is SystemDesignDiagram {
  return (
    isRecord(value) &&
    isBoundedPayload(value, 256 * 1024) &&
    isIdentifier(value.id) &&
    typeof value.name === "string" &&
    value.name.length <= 4_096 &&
    Array.isArray(value.nodes) &&
    value.nodes.length <= MAX_OPERATION_ENTITIES &&
    value.nodes.every(hasNodeEnvelope) &&
    Array.isArray(value.edges) &&
    value.edges.length <= MAX_OPERATION_ENTITIES &&
    value.edges.every(hasEdgeEnvelope) &&
    isRecord(value.viewport) &&
    typeof value.viewport.x === "number" && Number.isFinite(value.viewport.x) &&
    typeof value.viewport.y === "number" && Number.isFinite(value.viewport.y) &&
    typeof value.viewport.zoom === "number" && Number.isFinite(value.viewport.zoom)
  );
}

const NODE_PATCH_KEYS = new Set<keyof SystemDesignNodePatch>([
  "x", "y", "width", "height", "label", "subtitle", "technology",
  "description", "childDiagramId", "isExpandable", "isCollapsed",
  "parentModuleId", "groupId", "layer", "locked", "visible", "drawing",
  "style", "textStyle", "metadata",
]);
const NODE_REQUIRED_KEYS = new Set<keyof SystemDesignNodePatch>([
  "x", "y", "width", "height", "label", "layer", "locked", "visible",
]);
const NODE_NUMERIC_KEYS = new Set<keyof SystemDesignNodePatch>([
  "x", "y", "width", "height", "layer",
]);
const NODE_BOOLEAN_KEYS = new Set<keyof SystemDesignNodePatch>([
  "isExpandable", "isCollapsed", "locked", "visible",
]);
const NODE_STRING_KEYS = new Set<keyof SystemDesignNodePatch>([
  "label", "subtitle", "description", "childDiagramId", "parentModuleId", "groupId",
]);
const EDGE_PATCH_KEYS = new Set<keyof SystemDesignEdgePatch>([
  "sourceNodeId", "targetNodeId", "sourcePort", "targetPort", "type", "label",
  "protocol", "description", "routing", "color", "opacity", "strokeWidth",
  "lineStyle", "dashPattern", "startArrowhead", "endArrowhead", "labelIcon",
  "labelPosition", "labelBackground", "labelTextColor", "animationMode",
  "animationSpeed", "animationDirection",
]);
const EDGE_REQUIRED_KEYS = new Set<keyof SystemDesignEdgePatch>([
  "sourceNodeId", "targetNodeId", "sourcePort", "targetPort", "type",
]);

function parseNodePatch(value: unknown): CanvasNodePatch | null {
  if (!isRecord(value) || !isBoundedPayload(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  const patch: CanvasNodePatch = {};
  for (const [rawKey, entry] of entries) {
    const key = rawKey as keyof SystemDesignNodePatch;
    if (!NODE_PATCH_KEYS.has(key)) return null;
    if (entry === null) {
      if (NODE_REQUIRED_KEYS.has(key)) return null;
      Object.assign(patch, { [key]: null });
      continue;
    }
    if (NODE_NUMERIC_KEYS.has(key)) {
      if (typeof entry !== "number" || !Number.isFinite(entry)) return null;
      if (key === "layer" && !Number.isInteger(entry)) return null;
    } else if (NODE_BOOLEAN_KEYS.has(key)) {
      if (typeof entry !== "boolean") return null;
    } else if (NODE_STRING_KEYS.has(key)) {
      if (typeof entry !== "string" || entry.length > 4_096) return null;
    } else if (!isRecord(entry)) {
      return null;
    }
    if (
      key === "drawing" &&
      (!Array.isArray((entry as Record<string, unknown>).points) ||
        ((entry as Record<string, unknown>).points as unknown[]).length > MAX_FREEHAND_COORDINATES)
    ) return null;
    Object.assign(patch, { [key]: entry });
  }
  return patch;
}

function parseEdgePatch(value: unknown): CanvasEdgePatch | null {
  if (!isRecord(value) || !isBoundedPayload(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  const patch: CanvasEdgePatch = {};
  for (const [rawKey, entry] of entries) {
    const key = rawKey as keyof SystemDesignEdgePatch;
    if (!EDGE_PATCH_KEYS.has(key)) return null;
    if (entry === null) {
      if (EDGE_REQUIRED_KEYS.has(key)) return null;
      Object.assign(patch, { [key]: null });
      continue;
    }
    if (typeof entry !== "string" && typeof entry !== "number" && !Array.isArray(entry)) return null;
    if (typeof entry === "number" && !Number.isFinite(entry)) return null;
    if (typeof entry === "string" && entry.length > 4_096) return null;
    if (Array.isArray(entry) && (entry.length > 12 || entry.some((item) => typeof item !== "number" || !Number.isFinite(item)))) return null;
    Object.assign(patch, { [key]: entry });
  }
  return patch;
}

function parseIdentifiers(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const identifiers = [...new Set(value)];
  return identifiers.length > 0 && identifiers.length <= MAX_OPERATION_ENTITIES && identifiers.every(isIdentifier)
    ? identifiers
    : null;
}

export function normalizeCanvasNodePatch(patch: CanvasNodePatch): SystemDesignNodePatch {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value === null ? undefined : value])) as SystemDesignNodePatch;
}

export function normalizeCanvasEdgePatch(patch: CanvasEdgePatch): SystemDesignEdgePatch {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value === null ? undefined : value])) as SystemDesignEdgePatch;
}

export function parseCanvasOperation(value: unknown): CanvasOperation {
  if (!isRecord(value) || !isIdentifier(value.diagramId)) throw new CanvasOperationError("Canvas operation diagram is invalid.");
  if (
    value.kind === "node.add" &&
    hasNodeEnvelope(value.node) &&
    (value.transientSessionId === undefined ||
      isIdentifier(value.transientSessionId))
  ) {
    return {
      kind: "node.add",
      diagramId: value.diagramId,
      node: value.node,
      ...(value.transientSessionId === undefined
        ? {}
        : { transientSessionId: value.transientSessionId }),
    };
  }
  if (value.kind === "node.move" && isRecord(value.positions)) {
    const entries = Object.entries(value.positions);
    if (entries.length > 0 && entries.length <= MAX_OPERATION_ENTITIES) {
      const positions: Record<string, SystemDesignPoint> = {};
      for (const [nodeId, point] of entries) {
        if (!isIdentifier(nodeId) || !isPoint(point)) throw new CanvasOperationError("Canvas node position is invalid.");
        positions[nodeId] = point;
      }
      return { kind: "node.move", diagramId: value.diagramId, positions };
    }
  }
  if (value.kind === "node.resize" && isIdentifier(value.nodeId) && isRect(value.frame)) return { kind: "node.resize", diagramId: value.diagramId, nodeId: value.nodeId, frame: value.frame };
  if (value.kind === "node.update" && isIdentifier(value.nodeId)) {
    const patch = parseNodePatch(value.patch);
    if (patch) return { kind: "node.update", diagramId: value.diagramId, nodeId: value.nodeId, patch };
  }
  if (value.kind === "nodes.update" && isRecord(value.patches)) {
    const entries = Object.entries(value.patches);
    if (entries.length > 0 && entries.length <= MAX_OPERATION_ENTITIES) {
      const patches: Record<string, CanvasNodePatch> = {};
      for (const [nodeId, candidate] of entries) {
        const patch = parseNodePatch(candidate);
        if (!isIdentifier(nodeId) || !patch) throw new CanvasOperationError("Canvas node patch is invalid.");
        patches[nodeId] = patch;
      }
      return { kind: "nodes.update", diagramId: value.diagramId, patches };
    }
  }
  if (value.kind === "node.delete") {
    const nodeIds = parseIdentifiers(value.nodeIds);
    if (nodeIds) return { kind: "node.delete", diagramId: value.diagramId, nodeIds };
  }
  if (value.kind === "edge.add" && hasEdgeEnvelope(value.edge)) return { kind: "edge.add", diagramId: value.diagramId, edge: value.edge };
  if (value.kind === "edge.update" && isIdentifier(value.edgeId)) {
    const patch = parseEdgePatch(value.patch);
    if (patch) return { kind: "edge.update", diagramId: value.diagramId, edgeId: value.edgeId, patch };
  }
  if (value.kind === "edge.delete") {
    const edgeIds = parseIdentifiers(value.edgeIds);
    if (edgeIds) return { kind: "edge.delete", diagramId: value.diagramId, edgeIds };
  }
  if (
    value.kind === "diagram.add" &&
    isIdentifier(value.parentNodeId) &&
    hasDiagramEnvelope(value.diagram)
  ) {
    return {
      kind: "diagram.add",
      diagramId: value.diagramId,
      parentNodeId: value.parentNodeId,
      diagram: value.diagram,
    };
  }
  throw new CanvasOperationError("Unsupported or invalid canvas operation.");
}
