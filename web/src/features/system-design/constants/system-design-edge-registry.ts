import type {
  SystemDesignArrowhead,
  SystemDesignEdge,
  SystemDesignEdgeAnimationDirection,
  SystemDesignEdgeAnimationMode,
  SystemDesignEdgeLabelIcon,
  SystemDesignEdgeLineStyle,
  SystemDesignEdgeRouting,
  SystemDesignEdgeType,
} from "../types/system-design.types";

export type SystemDesignEdgeColorRole =
  | "muted"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "blue"
  | "cyan"
  | "orange";

export const SYSTEM_DESIGN_EDGE_ROLE_COLORS: Readonly<
  Record<SystemDesignEdgeColorRole, string>
> = {
  muted: "#a1a1aa",
  accent: "#a78bfa",
  success: "#22c55e",
  warning: "#eab308",
  danger: "#ef4444",
  blue: "#60a5fa",
  cyan: "#22d3ee",
  orange: "#fb923c",
};

export interface SystemDesignEdgeSemanticDefinition {
  type: SystemDesignEdgeType;
  label: string;
  colorRole: SystemDesignEdgeColorRole;
  lineStyle: SystemDesignEdgeLineStyle;
  strokeWidth: number;
  routing: SystemDesignEdgeRouting;
  startArrowhead: SystemDesignArrowhead;
  endArrowhead: SystemDesignArrowhead;
  labelIcon: SystemDesignEdgeLabelIcon;
  animationMode: SystemDesignEdgeAnimationMode;
}

const semantic = (
  definition: SystemDesignEdgeSemanticDefinition,
): SystemDesignEdgeSemanticDefinition => definition;

export const SYSTEM_DESIGN_EDGE_SEMANTICS: Readonly<
  Record<SystemDesignEdgeType, SystemDesignEdgeSemanticDefinition>
> = {
  http_request: semantic({
    type: "http_request",
    label: "HTTP Request",
    colorRole: "blue",
    lineStyle: "solid",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "http",
    animationMode: "none",
  }),
  http_response: semantic({
    type: "http_response",
    label: "HTTP Response",
    colorRole: "blue",
    lineStyle: "dashed",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "open",
    labelIcon: "http",
    animationMode: "none",
  }),
  grpc: semantic({
    type: "grpc",
    label: "gRPC",
    colorRole: "cyan",
    lineStyle: "solid",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "grpc",
    animationMode: "none",
  }),
  websocket: semantic({
    type: "websocket",
    label: "WebSocket",
    colorRole: "cyan",
    lineStyle: "solid",
    strokeWidth: 2,
    routing: "bidirectional",
    startArrowhead: "standard",
    endArrowhead: "standard",
    labelIcon: "websocket",
    animationMode: "none",
  }),
  database_read: semantic({
    type: "database_read",
    label: "Database Read",
    colorRole: "success",
    lineStyle: "solid",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "database",
    animationMode: "none",
  }),
  database_write: semantic({
    type: "database_write",
    label: "Database Write",
    colorRole: "accent",
    lineStyle: "solid",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "filled_triangle",
    labelIcon: "database",
    animationMode: "none",
  }),
  async_message: semantic({
    type: "async_message",
    label: "Async Message",
    colorRole: "warning",
    lineStyle: "dashed",
    strokeWidth: 2,
    routing: "curved",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "message",
    animationMode: "none",
  }),
  event_publish: semantic({
    type: "event_publish",
    label: "Event Publish",
    colorRole: "orange",
    lineStyle: "dotted",
    strokeWidth: 2,
    routing: "curved",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "event",
    animationMode: "none",
  }),
  event_stream: semantic({
    type: "event_stream",
    label: "Event Stream",
    colorRole: "cyan",
    lineStyle: "dash_dot",
    strokeWidth: 2,
    routing: "curved",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "stream",
    animationMode: "moving_dash",
  }),
  replication: semantic({
    type: "replication",
    label: "Replication",
    colorRole: "accent",
    lineStyle: "dashed",
    strokeWidth: 2,
    routing: "bidirectional",
    startArrowhead: "standard",
    endArrowhead: "standard",
    labelIcon: "replication",
    animationMode: "none",
  }),
  batch_transfer: semantic({
    type: "batch_transfer",
    label: "Batch Transfer",
    colorRole: "muted",
    lineStyle: "dashed",
    strokeWidth: 3,
    routing: "step",
    startArrowhead: "none",
    endArrowhead: "filled_triangle",
    labelIcon: "batch",
    animationMode: "none",
  }),
  failure_fallback: semantic({
    type: "failure_fallback",
    label: "Failure / Fallback",
    colorRole: "danger",
    lineStyle: "dashed",
    strokeWidth: 2,
    routing: "elbow",
    startArrowhead: "none",
    endArrowhead: "open",
    labelIcon: "failure",
    animationMode: "none",
  }),
  custom: semantic({
    type: "custom",
    label: "Custom",
    colorRole: "muted",
    lineStyle: "solid",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "none",
    animationMode: "none",
  }),
  request: semantic({
    type: "request",
    label: "Request (legacy)",
    colorRole: "blue",
    lineStyle: "solid",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "http",
    animationMode: "none",
  }),
  response: semantic({
    type: "response",
    label: "Response (legacy)",
    colorRole: "blue",
    lineStyle: "dashed",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "open",
    labelIcon: "http",
    animationMode: "none",
  }),
  async: semantic({
    type: "async",
    label: "Async (legacy)",
    colorRole: "warning",
    lineStyle: "dashed",
    strokeWidth: 2,
    routing: "curved",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "message",
    animationMode: "none",
  }),
  event: semantic({
    type: "event",
    label: "Event (legacy)",
    colorRole: "orange",
    lineStyle: "dotted",
    strokeWidth: 2,
    routing: "curved",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "event",
    animationMode: "none",
  }),
  data: semantic({
    type: "data",
    label: "Data (legacy)",
    colorRole: "success",
    lineStyle: "solid",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "database",
    animationMode: "none",
  }),
  read: semantic({
    type: "read",
    label: "Data Read (legacy)",
    colorRole: "success",
    lineStyle: "solid",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "database",
    animationMode: "none",
  }),
  write: semantic({
    type: "write",
    label: "Data Write (legacy)",
    colorRole: "accent",
    lineStyle: "solid",
    strokeWidth: 2,
    routing: "straight",
    startArrowhead: "none",
    endArrowhead: "filled_triangle",
    labelIcon: "database",
    animationMode: "none",
  }),
  stream: semantic({
    type: "stream",
    label: "Event Stream (legacy)",
    colorRole: "cyan",
    lineStyle: "dash_dot",
    strokeWidth: 2,
    routing: "curved",
    startArrowhead: "none",
    endArrowhead: "standard",
    labelIcon: "stream",
    animationMode: "none",
  }),
};

export const SYSTEM_DESIGN_PRIMARY_EDGE_TYPES = [
  "http_request",
  "http_response",
  "grpc",
  "websocket",
  "database_read",
  "database_write",
  "async_message",
  "event_publish",
  "event_stream",
  "replication",
  "batch_transfer",
  "failure_fallback",
  "custom",
] as const satisfies readonly SystemDesignEdgeType[];

export const SYSTEM_DESIGN_LEGACY_EDGE_TYPES = [
  "request",
  "response",
  "async",
  "event",
  "data",
  "read",
  "write",
  "stream",
] as const satisfies readonly SystemDesignEdgeType[];

export const SYSTEM_DESIGN_EDGE_ROUTINGS = [
  "straight",
  "curved",
  "elbow",
  "orthogonal",
  "step",
  "bidirectional",
] as const satisfies readonly SystemDesignEdgeRouting[];

export const SYSTEM_DESIGN_EDGE_LINE_STYLES = [
  "solid",
  "dashed",
  "dotted",
  "dash_dot",
] as const satisfies readonly SystemDesignEdgeLineStyle[];

export const SYSTEM_DESIGN_ARROWHEADS = [
  "none",
  "standard",
  "open",
  "filled_triangle",
  "circle",
  "diamond",
] as const satisfies readonly SystemDesignArrowhead[];

export const SYSTEM_DESIGN_EDGE_LABEL_ICONS = [
  "none",
  "http",
  "grpc",
  "websocket",
  "database",
  "message",
  "event",
  "stream",
  "replication",
  "batch",
  "failure",
] as const satisfies readonly SystemDesignEdgeLabelIcon[];

export const SYSTEM_DESIGN_EDGE_ANIMATION_MODES = [
  "none",
  "moving_dash",
  "moving_dots",
  "flow_pulse",
  "direction_pulse",
] as const satisfies readonly SystemDesignEdgeAnimationMode[];

export const SYSTEM_DESIGN_EDGE_ANIMATION_DIRECTIONS = [
  "forward",
  "reverse",
  "alternate",
] as const satisfies readonly SystemDesignEdgeAnimationDirection[];

export function getSystemDesignEdgeSemantic(
  type: SystemDesignEdgeType,
): SystemDesignEdgeSemanticDefinition {
  return SYSTEM_DESIGN_EDGE_SEMANTICS[type];
}

export function resolveSystemDesignEdgeStyle(edge: SystemDesignEdge) {
  const semanticDefinition = getSystemDesignEdgeSemantic(edge.type);
  return {
    semanticDefinition,
    routing: edge.routing ?? semanticDefinition.routing,
    lineStyle: edge.lineStyle ?? semanticDefinition.lineStyle,
    strokeWidth: edge.strokeWidth ?? semanticDefinition.strokeWidth,
    opacity: edge.opacity ?? 0.9,
    startArrowhead:
      edge.startArrowhead ?? semanticDefinition.startArrowhead,
    endArrowhead: edge.endArrowhead ?? semanticDefinition.endArrowhead,
    labelIcon: edge.labelIcon ?? semanticDefinition.labelIcon,
    labelPosition: edge.labelPosition ?? 0.5,
    animationMode: edge.animationMode ?? "none",
    animationSpeed: edge.animationSpeed ?? 1,
    animationDirection: edge.animationDirection ?? "forward",
  };
}

export function getSystemDesignLineDash(
  lineStyle: SystemDesignEdgeLineStyle,
  strokeWidth: number,
  customPattern?: readonly number[],
): number[] | undefined {
  if (customPattern && customPattern.length > 0) return [...customPattern];
  const unit = Math.max(1, strokeWidth);
  switch (lineStyle) {
    case "solid":
      return undefined;
    case "dashed":
      return [unit * 4, unit * 3];
    case "dotted":
      return [unit, unit * 2.5];
    case "dash_dot":
      return [unit * 5, unit * 2.5, unit, unit * 2.5];
  }
}
