import type {
  SystemDesignNode,
  SystemDesignPoint,
} from "../types/system-design.types";

export type CanvasOperation =
  | {
      kind: "node.add";
      diagramId: string;
      node: SystemDesignNode;
    }
  | {
      kind: "node.move";
      diagramId: string;
      positions: Record<string, SystemDesignPoint>;
    }
  | {
      kind: "node.delete";
      diagramId: string;
      nodeIds: string[];
    };

export class CanvasOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasOperationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value
  );
}

function isPoint(value: unknown): value is SystemDesignPoint {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function hasNodeEnvelope(value: unknown): value is SystemDesignNode {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    typeof value.type === "string" &&
    typeof value.label === "string" &&
    isPoint(value) &&
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    typeof value.height === "number" &&
    Number.isFinite(value.height) &&
    Number.isInteger(value.layer) &&
    typeof value.locked === "boolean" &&
    typeof value.visible === "boolean"
  );
}

export function parseCanvasOperation(value: unknown): CanvasOperation {
  if (!isRecord(value) || !isIdentifier(value.diagramId)) {
    throw new CanvasOperationError("Canvas operation diagram is invalid.");
  }

  if (value.kind === "node.add" && hasNodeEnvelope(value.node)) {
    return { kind: "node.add", diagramId: value.diagramId, node: value.node };
  }

  if (value.kind === "node.move" && isRecord(value.positions)) {
    const entries = Object.entries(value.positions);
    if (entries.length > 0 && entries.length <= 100) {
      const positions: Record<string, SystemDesignPoint> = {};
      for (const [nodeId, point] of entries) {
        if (!isIdentifier(nodeId) || !isPoint(point)) {
          throw new CanvasOperationError("Canvas node position is invalid.");
        }
        positions[nodeId] = point;
      }
      return { kind: "node.move", diagramId: value.diagramId, positions };
    }
  }

  if (value.kind === "node.delete" && Array.isArray(value.nodeIds)) {
    const nodeIds = [...new Set(value.nodeIds)];
    if (
      nodeIds.length > 0 &&
      nodeIds.length <= 100 &&
      nodeIds.every(isIdentifier)
    ) {
      return { kind: "node.delete", diagramId: value.diagramId, nodeIds };
    }
  }

  throw new CanvasOperationError("Unsupported or invalid canvas operation.");
}
