import type { SystemDesignDiagram } from "../types/system-design.types";
import { record, ReasonAIValidationError, type ReasonAIContext } from "./contract";

export const REASONAI_VISUALIZATION_TYPES = ["bottleneck", "failure", "capacity", "reliability", "traffic", "cost"] as const;
export const REASONAI_SEVERITIES = ["critical", "warning", "healthy", "info"] as const;
export type ReasonAISeverity = typeof REASONAI_SEVERITIES[number];
export interface ReasonAIAnalysisMetric {
  label: string; value: string; basis: "supplied" | "assumed" | "estimated" | "documented" | "unknown";
  evidence: string; sourceIds?: number[];
}
export interface ReasonAIAnalysisAnnotation { severity?: ReasonAISeverity; label?: string; reason?: string; assumption?: string; metric?: ReasonAIAnalysisMetric }
export interface ReasonAIVisualization {
  type: typeof REASONAI_VISUALIZATION_TYPES[number]; title: string; summary: string; assumptions: string[];
  nodes: (ReasonAIAnalysisAnnotation & { nodeId: string })[];
  edges: (ReasonAIAnalysisAnnotation & { edgeId: string })[];
}
const text = (maxLength: number) => ({ type: "string", maxLength });
const annotation = {
  severity: { type: "string", enum: REASONAI_SEVERITIES }, label: text(100), reason: text(600), assumption: text(400),
  metric: { type: "object", additionalProperties: false, required: ["label", "value", "basis", "evidence"], properties: {
    label: text(60), value: text(100), basis: { type: "string", enum: ["supplied", "assumed", "estimated", "documented", "unknown"] }, evidence: text(500),
    sourceIds: { type: "array", maxItems: 6, items: { type: "integer", minimum: 1, maximum: 6 } },
  } },
};
export const REASONAI_VISUALIZATION_TOOL = { type: "function", function: {
  name: "show_architecture_analysis",
  description: "Display temporary local analysis over EXISTING canvas nodes/edges, without modifying architecture. Include the answer in summary and state material assumptions. Use exact CANVAS_CONTEXT IDs; no new: refs, CSS or rendering instructions. Supported views: bottleneck, failure, capacity, reliability, traffic, cost. Missing controls are not proven absent. Failure is a hypothetical reasoning exercise, never executed. Metrics require a basis and supporting evidence/assumptions; documented metrics also require retrieved sourceIds. Costs are estimates or unknown. Never invent capacities or telemetry. Use qualitative risk when quantities are unknown.",
  parameters: { type: "object", additionalProperties: false, required: ["type", "title", "summary", "assumptions", "nodes", "edges"], properties: {
    type: { type: "string", enum: REASONAI_VISUALIZATION_TYPES }, title: text(120), summary: text(2400),
    assumptions: { type: "array", maxItems: 8, items: text(400) },
    nodes: { type: "array", maxItems: 40, items: { type: "object", additionalProperties: false, required: ["nodeId"], properties: { nodeId: text(256), ...annotation } } },
    edges: { type: "array", maxItems: 60, items: { type: "object", additionalProperties: false, required: ["edgeId"], properties: { edgeId: text(256), ...annotation } } },
  } },
} };
function bounded(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ReasonAIValidationError("Invalid analysis text.");
  return value;
}
function only(data: Record<string, unknown>, keys: string[]) { if (Object.keys(data).some((key) => !keys.includes(key))) throw new ReasonAIValidationError("Unsupported analysis field."); }
export function parseReasonAIVisualization(value: unknown, context: Pick<ReasonAIContext, "nodes" | "edges">, sources: number | readonly number[] = 0): ReasonAIVisualization {
  const data = record(value);
  only(data, ["type", "title", "summary", "assumptions", "nodes", "edges"]);
  if (!REASONAI_VISUALIZATION_TYPES.includes(data.type as ReasonAIVisualization["type"])) throw new ReasonAIValidationError("Unsupported analysis type.");
  if (!Array.isArray(data.assumptions) || data.assumptions.length > 8) throw new ReasonAIValidationError("Invalid analysis assumptions.");
  const sourceIdsAvailable = new Set(typeof sources === "number" ? Array.from({ length: sources }, (_, i) => i + 1) : sources);
  const parseItems = <K extends "nodeId" | "edgeId">(input: unknown, key: K, ids: Set<string>, max: number) => {
    if (!Array.isArray(input) || input.length > max) throw new ReasonAIValidationError("Too many analysis items.");
    const seen = new Set<string>();
    return input.map((value) => {
      const item = record(value); only(item, [key, "severity", "label", "reason", "assumption", "metric"]);
      const id = bounded(item[key], 256);
      if (seen.has(id)) throw new ReasonAIValidationError("Duplicate analysis reference."); seen.add(id);
      const parsed = { [key]: id } as ReasonAIAnalysisAnnotation & Record<K, string>;
      if (item.severity !== undefined) {
        if (!REASONAI_SEVERITIES.includes(item.severity as ReasonAISeverity)) throw new ReasonAIValidationError("Unsupported analysis severity.");
        parsed.severity = item.severity as ReasonAISeverity;
      }
      for (const [field, max] of [["label", 100], ["reason", 600], ["assumption", 400]] as const) if (item[field] !== undefined) parsed[field] = bounded(item[field], max);
      if (item.metric !== undefined) {
        const m = record(item.metric); only(m, ["label", "value", "basis", "evidence", "sourceIds"]);
        if (!["supplied", "assumed", "estimated", "documented", "unknown"].includes(String(m.basis))) throw new ReasonAIValidationError("Invalid metric basis.");
        const sourceIds = m.sourceIds === undefined ? [] : m.sourceIds;
        if (!Array.isArray(sourceIds) || sourceIds.length > 6 || sourceIds.some((id) => !Number.isInteger(id) || !sourceIdsAvailable.has(id))) throw new ReasonAIValidationError("Invalid metric sources.");
        if (m.basis === "documented" && !sourceIds.length) throw new ReasonAIValidationError("Documented metrics require sources.");
        if (data.type === "cost" && !["estimated", "unknown"].includes(String(m.basis))) throw new ReasonAIValidationError("Architecture costs must be estimates.");
        const value = bounded(m.value, 100);
        parsed.metric = { label: bounded(m.label, 60), value: m.basis === "unknown" ? "Unknown" : value, basis: m.basis as ReasonAIAnalysisMetric["basis"], evidence: bounded(m.evidence, 500), ...(sourceIds.length ? { sourceIds } : {}) };
      }
      return ids.has(id) ? parsed : undefined;
    }).filter((item) => item !== undefined);
  };
  const nodes = parseItems(data.nodes, "nodeId", new Set(context.nodes.map((node) => node.id)), 40);
  const edges = parseItems(data.edges, "edgeId", new Set(context.edges.map((edge) => edge.id)), 60);
  if (!nodes.length && !edges.length) throw new ReasonAIValidationError("No current canvas elements to highlight.");
  return { type: data.type as ReasonAIVisualization["type"], title: bounded(data.title, 120), summary: bounded(data.summary, 2400), assumptions: data.assumptions.map((value) => bounded(value, 400)), nodes, edges };
}

/** Geometry/selection/viewport changes don't invalidate architectural reasoning. */
export function reasonAIAnalysisScope(diagram: SystemDesignDiagram): string {
  return JSON.stringify({ id: diagram.id, nodes: diagram.nodes.map(({ id, type, label, subtitle, description, technology, childDiagramId, metadata }) => ({ id, type, label, subtitle, description, technology, childDiagramId, metadata })), edges: diagram.edges.map(({ id, sourceNodeId, targetNodeId, type, label, protocol, description }) => ({ id, sourceNodeId, targetNodeId, type, label, protocol, description })) });
}
