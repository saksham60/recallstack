import type { SystemDesignPoint } from "../types/system-design.types";

interface StrokeBase {
  strokeSessionId: string;
  diagramId: string;
}

export type StrokeOperation =
  | (StrokeBase & {
      kind: "stroke.start";
      stroke: string;
      strokeWidth: number;
    })
  | (StrokeBase & {
      kind: "stroke.delta";
      batchIndex: number;
      points: SystemDesignPoint[];
    })
  | (StrokeBase & { kind: "stroke.end" });

const MAX_STROKE_DELTA_POINTS = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function point(value: unknown): value is SystemDesignPoint {
  return isRecord(value) && Object.keys(value).every((key) => key === "x" || key === "y") &&
    typeof value.x === "number" && Number.isFinite(value.x) &&
    typeof value.y === "number" && Number.isFinite(value.y);
}

export function parseStrokeOperation(value: unknown): StrokeOperation {
  if (!isRecord(value) || !identifier(value.strokeSessionId) || !identifier(value.diagramId)) {
    throw new Error("Invalid stroke operation envelope.");
  }
  if (value.kind === "stroke.start" && typeof value.stroke === "string" &&
      value.stroke.length <= 64 && typeof value.strokeWidth === "number" &&
      Number.isFinite(value.strokeWidth) && value.strokeWidth > 0 && value.strokeWidth <= 32) {
    return {
      kind: "stroke.start", strokeSessionId: value.strokeSessionId,
      diagramId: value.diagramId, stroke: value.stroke, strokeWidth: value.strokeWidth,
    };
  }
  if (value.kind === "stroke.delta" && Number.isSafeInteger(value.batchIndex) &&
      Number(value.batchIndex) >= 1 && Array.isArray(value.points) &&
      value.points.length > 0 && value.points.length <= MAX_STROKE_DELTA_POINTS &&
      value.points.every(point)) {
    return {
      kind: "stroke.delta", strokeSessionId: value.strokeSessionId,
      diagramId: value.diagramId, batchIndex: Number(value.batchIndex),
      points: value.points,
    };
  }
  if (value.kind === "stroke.end") {
    return { kind: "stroke.end", strokeSessionId: value.strokeSessionId, diagramId: value.diagramId };
  }
  throw new Error("Unsupported or invalid stroke operation.");
}

export { MAX_STROKE_DELTA_POINTS };
