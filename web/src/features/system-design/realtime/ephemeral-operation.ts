import { parseNodeDragOperation, type NodeDragOperation } from "./node-drag-operation";
import { parseNodeResizeOperation, type NodeResizeOperation } from "./node-resize-operation";
import { parseStrokeOperation, type StrokeOperation } from "./stroke-operation";

export type SystemDesignEphemeralOperation = NodeDragOperation | NodeResizeOperation | StrokeOperation;

export function parseSystemDesignEphemeralOperation(value: unknown): SystemDesignEphemeralOperation {
  if (typeof value !== "object" || value === null || !("kind" in value) ||
      typeof value.kind !== "string") throw new Error("Invalid ephemeral operation.");
  if (value.kind.startsWith("node.drag.")) return parseNodeDragOperation(value);
  if (value.kind.startsWith("node.resize.")) return parseNodeResizeOperation(value);
  if (value.kind.startsWith("stroke.")) return parseStrokeOperation(value);
  throw new Error("Unsupported ephemeral operation.");
}
