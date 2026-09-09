import { SYSTEM_DESIGN_NODE_DEFINITIONS } from "../constants/system-design-palette";
import { SYSTEM_DESIGN_PRIMARY_EDGE_TYPES, SYSTEM_DESIGN_LEGACY_EDGE_TYPES } from "../constants/system-design-edge-registry";
import type { SystemDesignDiagram, SystemDesignEdge, SystemDesignNode, SystemDesignProblem } from "../types/system-design.types";

export const REASONAI_MODES = { chat: "Chat", review: "Review", fix: "Fix", eagle: "Eagle View" } as const;
export type ReasonAIMode = keyof typeof REASONAI_MODES;
export interface ReasonAIMessage { role: "user" | "assistant"; content: string }
type NodeFields = Pick<SystemDesignNode, "label" | "subtitle" | "description"> & { technology?: string };
type EdgeFields = Pick<SystemDesignEdge, "type" | "label" | "protocol" | "sourceNodeId" | "targetNodeId">;
export type ReasonAIOperation =
  | ({ op: "add_node"; ref: string } & Pick<SystemDesignNode, "type" | "x" | "y"> & NodeFields)
  | ({ op: "update_node"; nodeId: string } & Partial<NodeFields>)
  | ({ op: "move_node"; nodeId: string } & Pick<SystemDesignNode, "x" | "y">)
  | { op: "delete_node"; nodeId: string }
  | ({ op: "add_edge" } & EdgeFields)
  | ({ op: "update_edge"; edgeId: string } & Partial<EdgeFields>)
  | { op: "delete_edge"; edgeId: string };
export interface ReasonAIProposal { summary: string; operations: ReasonAIOperation[] }
export interface ReasonAIResponse { text: string; proposal?: ReasonAIProposal }
export const REASONAI_INVALID_PROPOSAL = "ReasonAI returned an invalid canvas proposal. No changes were applied.";
export interface ReasonAIContext {
  title: string;
  requirements: string[];
  scaleAssumptions: string[];
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  nodes: (Pick<SystemDesignNode, "id" | "type" | "x" | "y"> & NodeFields)[];
  edges: (Pick<SystemDesignEdge, "id"> & EdgeFields)[];
}
export interface ReasonAIRequest {
  mode: ReasonAIMode;
  message: string;
  history: ReasonAIMessage[];
  context: ReasonAIContext;
}
export class ReasonAIValidationError extends Error {}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReasonAIValidationError("Expected an object.");
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 2000): string {
  if (typeof value !== "string" || value.length > max) throw new ReasonAIValidationError("Invalid or oversized text.");
  return value;
}
function identifier(value: unknown): string {
  const id = string(value, 256);
  if (!id.trim() || id.trim() !== id || /[\u0000-\u001f\u007f]/u.test(id)) throw new ReasonAIValidationError("Invalid identifier.");
  return id;
}
function coordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 100_000) throw new ReasonAIValidationError("Invalid canvas position.");
  return value;
}
const nodeTypes = Object.keys(SYSTEM_DESIGN_NODE_DEFINITIONS) as SystemDesignNode["type"][];
const edgeTypes: readonly string[] = [...SYSTEM_DESIGN_PRIMARY_EDGE_TYPES, ...SYSTEM_DESIGN_LEGACY_EDGE_TYPES];
function member<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new ReasonAIValidationError("Unsupported type.");
  return value as T;
}
function array<T>(value: unknown, max: number, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) throw new ReasonAIValidationError("Too many or invalid items.");
  return value.map(parse);
}

// Allowlist only architecture text. Never serialize the editor state or assets.
// Redact common pasted credentials and inline data even when embedded in labels.
export function redactReasonAIText(value: string): string {
  return value
    .replace(/data:[^\s"'<>]+/gi, "[inline data omitted]")
    .replace(/\b(?:Bearer\s+\S+|(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{16,}|v1\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g, "[credential redacted]")
    .replace(/\b(api[_ -]?key|password|secret|access[_ -]?token)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]");
}
const compact = (value: string | undefined, max = 2000) => redactReasonAIText(value ?? "").slice(0, max);
export function buildReasonAIContext(diagram: SystemDesignDiagram, title: string, problem?: SystemDesignProblem, selectedNodeIds: string[] = [], selectedEdgeIds: string[] = []): ReasonAIContext {
  if (diagram.nodes.length > 200 || diagram.edges.length > 400) throw new ReasonAIValidationError("ReasonAI Stage 1 supports up to 200 nodes and 400 connections in the active diagram.");
  return {
    title: compact(title, 300),
    requirements: (problem?.requirements ?? []).slice(0, 30).map((item) => compact(item)),
    scaleAssumptions: (problem?.scaleAssumptions ?? []).slice(0, 30).map((item) => compact(item)),
    selectedNodeIds, selectedEdgeIds,
    nodes: diagram.nodes.map((node) => ({ id: node.id, type: node.type, label: compact(node.label, 300), subtitle: compact(node.subtitle, 300), technology: compact(node.technology?.name, 100), description: compact(node.description), x: node.x, y: node.y })),
    edges: diagram.edges.map((edge) => ({ id: edge.id, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, type: edge.type, label: compact(edge.label, 300), protocol: compact(edge.protocol, 100) })),
  };
}
export function parseReasonAIRequest(value: unknown): ReasonAIRequest {
  const input = record(value), context = record(input.context);
  const text = (value: unknown, max = 2000) => redactReasonAIText(string(value, max));
  const nodes = array(context.nodes, 200, (value) => {
    const n = record(value);
    return { id: identifier(n.id), type: member(n.type, nodeTypes), label: text(n.label, 300), subtitle: text(n.subtitle ?? "", 300), technology: text(n.technology ?? "", 100), description: text(n.description ?? ""), x: coordinate(n.x), y: coordinate(n.y) };
  });
  const edges = array(context.edges, 400, (value) => {
    const e = record(value);
    return { id: identifier(e.id), type: member(e.type, [...SYSTEM_DESIGN_PRIMARY_EDGE_TYPES, ...SYSTEM_DESIGN_LEGACY_EDGE_TYPES]), sourceNodeId: identifier(e.sourceNodeId), targetNodeId: identifier(e.targetNodeId), label: text(e.label ?? "", 300), protocol: text(e.protocol ?? "", 100) };
  });
  const nodeIds = new Set(nodes.map((n) => n.id)), edgeIds = new Set(edges.map((e) => e.id));
  if (nodeIds.size !== nodes.length || edgeIds.size !== edges.length || edges.some((e) => !nodeIds.has(e.sourceNodeId) || !nodeIds.has(e.targetNodeId))) throw new ReasonAIValidationError("Invalid architecture references.");
  const message = text(input.message, 4000).trim();
  if (!message) throw new ReasonAIValidationError("Enter a message for ReasonAI.");
  if (!Array.isArray(input.history)) throw new ReasonAIValidationError("Invalid history.");
  return {
    mode: member(input.mode, Object.keys(REASONAI_MODES) as ReasonAIMode[]), message,
    history: input.history.slice(-10).map((value) => { const m = record(value); return { role: member(m.role, ["user", "assistant"] as const), content: text(m.content, 8000) }; }),
    context: { title: text(context.title, 300), requirements: array(context.requirements ?? [], 30, (v) => text(v)), scaleAssumptions: array(context.scaleAssumptions ?? [], 30, (v) => text(v)), nodes, edges,
      selectedNodeIds: array(context.selectedNodeIds ?? [], 200, identifier).filter((id) => nodeIds.has(id)),
      selectedEdgeIds: array(context.selectedEdgeIds ?? [], 400, identifier).filter((id) => edgeIds.has(id)),
    },
  };
}

// These flat schemas also drive validation, keeping the tool and Apply in sync.
const textField = (maxLength: number) => ({ type: "string", maxLength });
const fields = {
  ref: { type: "string", maxLength: 80, pattern: "^new:[A-Za-z0-9_-]{1,76}$" },
  nodeId: textField(256), edgeId: textField(256), sourceNodeId: textField(256), targetNodeId: textField(256),
  label: textField(300), subtitle: textField(300), technology: textField(100), description: textField(2000), protocol: textField(100),
  x: { type: "number", minimum: -100_000, maximum: 100_000 }, y: { type: "number", minimum: -100_000, maximum: 100_000 },
};
const nodeFields = { label: fields.label, subtitle: fields.subtitle, technology: fields.technology, description: fields.description };
const edgeFields = { type: { type: "string", enum: edgeTypes }, sourceNodeId: fields.sourceNodeId, targetNodeId: fields.targetNodeId, label: fields.label, protocol: fields.protocol };
function operationSchema(op: ReasonAIOperation["op"], properties: Record<string, object>, required: string[]) {
  return { type: "object", additionalProperties: false, properties: { op: { type: "string", enum: [op] }, ...properties }, required: ["op", ...required] };
}
const operationSchemas = [
  operationSchema("add_node", { ref: fields.ref, type: { type: "string", enum: nodeTypes.filter((t) => t !== "image" && t !== "freehand") }, ...nodeFields, x: fields.x, y: fields.y }, ["ref", "type", "label", "x", "y"]),
  operationSchema("update_node", { nodeId: fields.nodeId, ...nodeFields }, ["nodeId"]),
  operationSchema("move_node", { nodeId: fields.nodeId, x: fields.x, y: fields.y }, ["nodeId", "x", "y"]),
  operationSchema("delete_node", { nodeId: fields.nodeId }, ["nodeId"]),
  operationSchema("add_edge", edgeFields, ["type", "sourceNodeId", "targetNodeId"]),
  operationSchema("update_edge", { edgeId: fields.edgeId, ...edgeFields }, ["edgeId"]),
  operationSchema("delete_edge", { edgeId: fields.edgeId }, ["edgeId"]),
];
export const REASONAI_TOOL = {
  type: "function",
  function: {
    name: "propose_canvas_changes",
    description: "Propose minimal changes for user approval. Operations run in order. add_node declares a unique ref such as new:redis. add_edge and update_edge use sourceNodeId and targetNodeId: exact existing node IDs or previously declared new: refs. update_node, move_node and delete_node use nodeId for an existing node; update_edge and delete_edge use edgeId for an existing edge. Existing IDs must come from CANVAS_CONTEXT. No changes happen until Apply. Summary must briefly explain tradeoffs using component names, not IDs, in plain text without tables or HTML.",
    parameters: { type: "object", additionalProperties: false, required: ["summary", "operations"], properties: { summary: textField(2000), operations: { type: "array", minItems: 1, maxItems: 50, items: { oneOf: operationSchemas } } } },
  },
};
export function parseReasonAIProposal(value: unknown, context: Pick<ReasonAIContext, "nodes" | "edges">): ReasonAIProposal {
  const proposal = record(value);
  if (Object.keys(proposal).some((k) => k !== "summary" && k !== "operations")) throw new ReasonAIValidationError("Unsupported proposal field.");
  const summary = string(proposal.summary);
  const operations = array(proposal.operations, 50, (value) => {
    const operation = record(value);
    const schema = operationSchemas.find((s) => s.properties.op.enum[0] === operation.op);
    if (!schema || schema.required.some((k) => !(k in operation))) throw new ReasonAIValidationError("Malformed proposal operation.");
    const properties: Record<string, object> = schema.properties;
    for (const [key, value] of Object.entries(operation)) {
      if (!Object.hasOwn(properties, key)) throw new ReasonAIValidationError("Unsupported operation field.");
      const rule = properties[key] as { type: string; maxLength?: number; enum?: readonly string[]; pattern?: string };
      if (rule.type === "number") coordinate(value);
      else {
        const parsed = string(value, rule.maxLength ?? 256);
        if (rule.enum) member(parsed, rule.enum);
        if (rule.pattern && !new RegExp(rule.pattern).test(parsed)) throw new ReasonAIValidationError("Invalid new node reference.");
        if (key.endsWith("Id")) identifier(parsed);
      }
    }
    if ((operation.op === "update_node" || operation.op === "update_edge") && Object.keys(operation).length < 3) throw new ReasonAIValidationError("An update must include changes.");
    return operation as unknown as ReasonAIOperation;
  });
  if (!summary.trim() || !operations.length) throw new ReasonAIValidationError("Empty proposal.");
  const nodes = new Set(context.nodes.map((n) => n.id));
  const refs = new Set<string>();
  const edges = new Map(context.edges.map((e) => [e.id, { ...e }]));
  for (const op of operations) {
    if (op.op === "add_node") {
      if (refs.has(op.ref) || nodes.has(op.ref)) throw new ReasonAIValidationError("Duplicate new node reference.");
      refs.add(op.ref); nodes.add(op.ref);
    } else if ("nodeId" in op) {
      if (!nodes.has(op.nodeId) || refs.has(op.nodeId)) throw new ReasonAIValidationError("The proposal targets a missing existing node. Ask ReasonAI again.");
      if (op.op === "delete_node") {
        nodes.delete(op.nodeId);
        for (const [id, edge] of edges) if (edge.sourceNodeId === op.nodeId || edge.targetNodeId === op.nodeId) edges.delete(id);
      }
    } else {
      if ("edgeId" in op && !edges.has(op.edgeId)) throw new ReasonAIValidationError("The proposal targets a missing connection. Ask ReasonAI again.");
      if (op.op === "delete_edge") { edges.delete(op.edgeId); continue; }
      const edge = op.op === "update_edge" ? { ...edges.get(op.edgeId)!, ...op } : op;
      if (!nodes.has(edge.sourceNodeId) || !nodes.has(edge.targetNodeId) || edge.sourceNodeId === edge.targetNodeId) throw new ReasonAIValidationError("Invalid connection endpoints.");
      if (op.op === "update_edge") edges.set(op.edgeId, { ...edges.get(op.edgeId)!, ...op });
    }
  }
  return { summary, operations };
}
