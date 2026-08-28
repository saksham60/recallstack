import type { SystemDesignRect } from "../types/system-design.types";

interface NodeResizeBase {
  dragSessionId: string;
  diagramId: string;
  nodeId: string;
}

export type NodeResizeOperation =
  | (NodeResizeBase & { kind: "node.resize.start" })
  | (NodeResizeBase & {
      kind: "node.resize.preview";
      previewIndex: number;
      frame: SystemDesignRect;
    })
  | (NodeResizeBase & { kind: "node.resize.end" });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isFrame(value: unknown): value is SystemDesignRect {
  return isRecord(value) &&
    Object.keys(value).every((key) => ["x", "y", "width", "height"].includes(key)) &&
    typeof value.x === "number" && Number.isFinite(value.x) &&
    typeof value.y === "number" && Number.isFinite(value.y) &&
    typeof value.width === "number" && Number.isFinite(value.width) && value.width > 0 &&
    typeof value.height === "number" && Number.isFinite(value.height) && value.height > 0;
}

export function parseNodeResizeOperation(value: unknown): NodeResizeOperation {
  if (!isRecord(value) || !isIdentifier(value.dragSessionId) ||
      !isIdentifier(value.diagramId) || !isIdentifier(value.nodeId)) {
    throw new Error("Invalid node resize operation envelope.");
  }
  if (value.kind === "node.resize.start" || value.kind === "node.resize.end") {
    return {
      kind: value.kind,
      dragSessionId: value.dragSessionId,
      diagramId: value.diagramId,
      nodeId: value.nodeId,
    };
  }
  if (value.kind === "node.resize.preview" &&
      Number.isSafeInteger(value.previewIndex) && Number(value.previewIndex) >= 1 &&
      isFrame(value.frame)) {
    return {
      kind: "node.resize.preview",
      dragSessionId: value.dragSessionId,
      diagramId: value.diagramId,
      nodeId: value.nodeId,
      previewIndex: Number(value.previewIndex),
      frame: value.frame,
    };
  }
  throw new Error("Unsupported or invalid node resize operation.");
}
