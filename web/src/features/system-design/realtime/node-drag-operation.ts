import type { SystemDesignPoint } from "../types/system-design.types";

interface NodeDragBase {
  dragSessionId: string;
  diagramId: string;
}

export interface NodeDragStartOperation extends NodeDragBase {
  kind: "node.drag.start";
  nodeIds: string[];
}

export interface NodeDragPreviewOperation extends NodeDragBase {
  kind: "node.drag.preview";
  previewIndex: number;
  positions: Record<string, SystemDesignPoint>;
}

export interface NodeDragEndOperation extends NodeDragBase {
  kind: "node.drag.end";
  nodeIds: string[];
}

export type NodeDragOperation =
  | NodeDragStartOperation
  | NodeDragPreviewOperation
  | NodeDragEndOperation;

export class NodeDragOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeDragOperationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown, maximumLength = 256): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value &&
    !/[\u0000-\u0020\u007f]/u.test(value)
  );
}

function parseNodeIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const nodeIds = [...new Set(value)];
  return nodeIds.length > 0 &&
    nodeIds.length <= 100 &&
    nodeIds.every((nodeId) => isIdentifier(nodeId))
    ? nodeIds
    : null;
}

function parsePositions(
  value: unknown,
): Record<string, SystemDesignPoint> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 100) return null;
  const positions: Record<string, SystemDesignPoint> = {};
  for (const [nodeId, position] of entries) {
    if (
      !isIdentifier(nodeId) ||
      !isRecord(position) ||
      typeof position.x !== "number" ||
      !Number.isFinite(position.x) ||
      typeof position.y !== "number" ||
      !Number.isFinite(position.y)
    ) {
      return null;
    }
    positions[nodeId] = { x: position.x, y: position.y };
  }
  return positions;
}

export function parseNodeDragOperation(value: unknown): NodeDragOperation {
  if (
    !isRecord(value) ||
    !isIdentifier(value.dragSessionId, 128) ||
    !isIdentifier(value.diagramId)
  ) {
    throw new NodeDragOperationError("Invalid node drag operation envelope.");
  }

  if (value.kind === "node.drag.start" || value.kind === "node.drag.end") {
    const nodeIds = parseNodeIds(value.nodeIds);
    if (nodeIds) {
      return {
        kind: value.kind,
        dragSessionId: value.dragSessionId,
        diagramId: value.diagramId,
        nodeIds,
      };
    }
  }

  if (
    value.kind === "node.drag.preview" &&
    Number.isSafeInteger(value.previewIndex) &&
    Number(value.previewIndex) >= 1
  ) {
    const positions = parsePositions(value.positions);
    if (positions) {
      return {
        kind: "node.drag.preview",
        dragSessionId: value.dragSessionId,
        diagramId: value.diagramId,
        previewIndex: Number(value.previewIndex),
        positions,
      };
    }
  }

  throw new NodeDragOperationError("Unsupported or invalid node drag operation.");
}
