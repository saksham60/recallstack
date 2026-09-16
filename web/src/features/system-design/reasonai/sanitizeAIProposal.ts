import { SYSTEM_DESIGN_NODE_DEFINITIONS } from "../constants/system-design-palette";
import { SYSTEM_DESIGN_PRIMARY_EDGE_TYPES, SYSTEM_DESIGN_LEGACY_EDGE_TYPES } from "../constants/system-design-edge-registry";
import type { SystemDesignEdgeType, SystemDesignNodeType } from "../types/system-design.types";
import { SYSTEM_DESIGN_PASTE_OFFSET } from "../constants/system-design-layout";
import { parseReasonAIProposal, record, ReasonAIValidationError, type ReasonAIContext, type ReasonAIProposal } from "./contract";

type Context = Pick<ReasonAIContext, "nodes" | "edges">;
export const REASONAI_CANVAS_UPDATE_FAILED = "ReasonAI couldn't safely apply this canvas update.";
export interface ProposalDiagnostic {
  code: string;
  operationIndex?: number;
  nodeId?: unknown;
  edgeId?: unknown;
  value?: unknown;
}
const supportedEdges = new Set<string>([...SYSTEM_DESIGN_PRIMARY_EDGE_TYPES, ...SYSTEM_DESIGN_LEGACY_EDGE_TYPES]);
const aliases: Readonly<Record<string, SystemDesignEdgeType>> = {
  read: "database_read", db_read: "database_read", write: "database_write", db_write: "database_write",
  request: "http_request", http: "http_request", response: "http_response",
  message: "async_message", queue: "async_message", async: "async_message",
  event: "event_publish", stream: "event_stream", data: "batch_transfer",
};
export function normalizeAIProposalEdgeType(value: unknown): SystemDesignEdgeType {
  const type = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  const normalized = Object.hasOwn(aliases, type) ? aliases[type] : type;
  return supportedEdges.has(normalized) ? normalized as SystemDesignEdgeType : "custom";
}
export function safeAIProposalCoordinate(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000 ? value : fallback;
}

/** Pure shared normalization. Existing documents and commit-time validation stay strict. */
export function sanitizeAIProposal(value: unknown, context: Context): { proposal: unknown; warnings: ProposalDiagnostic[]; operationIndexes: number[] } {
  let input: Record<string, unknown>;
  try { input = record(value); }
  catch { throw new ReasonAIValidationError("Expected a proposal object.", { code: "WRONG_PROPOSAL_CONTRACT" }); }
  if (Object.keys(input).some((key) => key !== "summary" && key !== "operations") || !Array.isArray(input.operations)) {
    throw new ReasonAIValidationError("Expected a summary and operations proposal, not a canvas document.", { code: "WRONG_PROPOSAL_CONTRACT" });
  }
  if (input.operations.length > 50) throw new ReasonAIValidationError("Invalid or oversized operation list.", { code: "OPERATION_LIMIT" });
  const warnings: ProposalDiagnostic[] = [];
  const warn = (code: string, operationIndex: number, details: Omit<ProposalDiagnostic, "code" | "operationIndex"> = {}) => warnings.push({ code, operationIndex, ...details });
  const nodes = new Set(context.nodes.map((node) => node.id));
  const existingNodes = new Map(context.nodes.map((node) => [node.id, node]));
  const reservedRefs = new Set(input.operations.flatMap((value) => value && typeof value === "object" && typeof value.ref === "string" ? [value.ref] : []));
  const refs = new Set<string>();
  const remappedRefs = new Map<string, string>();
  const operations: Record<string, unknown>[] = [];
  const operationIndexes: number[] = [];
  const edges = new Map<string, Record<string, unknown>>(context.edges.map((edge) => [edge.id, { ...edge }]));
  // The reducer rejects parallel edges of the same type/ports even with different labels.
  // AI additions always use right -> left ports. Match that stronger integrity rule too.
  const edgeKey = (edge: Record<string, unknown>) => JSON.stringify([edge.sourceNodeId, edge.targetNodeId, normalizeAIProposalEdgeType(edge.type)]);
  const counts = new Map<string, number>();
  const changeCount = (edge: Record<string, unknown>, delta: number) => {
    const key = edgeKey(edge);
    counts.set(key, (counts.get(key) ?? 0) + delta);
  };
  for (const edge of edges.values()) changeCount(edge, 1);
  let nextX = SYSTEM_DESIGN_PASTE_OFFSET;
  for (let index = 0; index < input.operations.length; index++) {
    let op: Record<string, unknown>;
    try { op = { ...record(input.operations[index]) }; }
    catch { throw new ReasonAIValidationError("Malformed proposal operation.", { code: "INVALID_OPERATION", operationIndex: index }); }
    if (op.op === "add_node") {
      if (typeof op.type !== "string" || !Object.hasOwn(SYSTEM_DESIGN_NODE_DEFINITIONS, op.type) || op.type === "image" || op.type === "freehand") {
        warn("UNSUPPORTED_NODE_TYPE", index, { nodeId: op.ref, value: op.type });
        continue;
      }
      const definition = SYSTEM_DESIGN_NODE_DEFINITIONS[op.type as SystemDesignNodeType];
      const originalRef = op.ref ?? op.id;
      if (typeof originalRef === "string" && (refs.has(originalRef) || remappedRefs.has(originalRef))) {
        // References are ambiguous: keep their first declaration and all edges pointing to it.
        warn("DUPLICATE_NODE_REFERENCE", index, { nodeId: op.ref });
        continue;
      }
      if (typeof op.ref !== "string" || !/^new:[A-Za-z0-9_-]{1,76}$/.test(op.ref) || nodes.has(op.ref)) {
        // Proposal-local references are not persisted IDs. Real IDs still come from
        // the canvas factory on acceptance. Determinism makes server/browser agree.
        let suffix = index;
        let ref = `new:repaired_${suffix}`;
        while (reservedRefs.has(ref) || nodes.has(ref)) ref = `new:repaired_${++suffix}`;
        op.ref = ref;
        if (typeof originalRef === "string" && !nodes.has(originalRef) && !remappedRefs.has(originalRef)) remappedRefs.set(originalRef, ref);
        warn("REPAIRED_NODE_REFERENCE", index, { nodeId: originalRef });
      }
      // IDs and boundary dimensions come from trusted canvas factories, never model output.
      delete op.id;
      if (definition.category === "boundaries") { delete op.width; delete op.height; }
      if (op.label == null) op.label = definition.label;
      for (const field of ["subtitle", "technology", "description"]) if (op[field] === null) op[field] = "";
      for (const axis of ["x", "y"] as const) {
        const coordinate = safeAIProposalCoordinate(op[axis], axis === "x" ? nextX : SYSTEM_DESIGN_PASTE_OFFSET);
        if (coordinate !== op[axis]) warn("INVALID_COORDINATE", index, { nodeId: op.ref, value: op[axis] });
        op[axis] = coordinate;
      }
      nextX += definition.defaultWidth + SYSTEM_DESIGN_PASTE_OFFSET;
      refs.add(op.ref as string);
      nodes.add(op.ref as string);
    } else if (op.op === "update_node") {
      for (const field of ["subtitle", "technology", "description"]) if (op[field] === null) op[field] = "";
      if (op.label === null) delete op.label;
    } else if (op.op === "move_node") {
      const node = existingNodes.get(op.nodeId as string);
      if (node) for (const axis of ["x", "y"] as const) {
        const coordinate = safeAIProposalCoordinate(op[axis], node[axis]);
        if (coordinate !== op[axis]) warn("INVALID_COORDINATE", index, { nodeId: op.nodeId, value: op[axis] });
        op[axis] = coordinate;
      }
    } else if (op.op === "delete_node") {
      nodes.delete(op.nodeId as string);
      for (const [id, edge] of edges) if (edge.sourceNodeId === op.nodeId || edge.targetNodeId === op.nodeId) { changeCount(edge, -1); edges.delete(id); }
    } else if (op.op === "add_edge" || op.op === "update_edge") {
      if (op.op === "add_edge" || op.type != null) {
        const type = normalizeAIProposalEdgeType(op.type);
        if (type !== op.type) warn("INVALID_EDGE_TYPE", index, { edgeId: op.edgeId ?? op.id, value: op.type });
        op.type = type;
      } else if (op.type === null) delete op.type;
      for (const field of ["label", "protocol"]) if (op[field] === null) op[field] = "";
      for (const field of ["sourceNodeId", "targetNodeId"]) if (typeof op[field] === "string") op[field] = remappedRefs.get(op[field]) ?? op[field];
      const previous = op.op === "update_edge" ? edges.get(op.edgeId as string) : undefined;
      // Missing update/delete targets remain fatal (stale or unsafe edits).
      if (op.op === "add_edge" || previous) {
        const edge = { ...previous, ...op };
        if (!nodes.has(edge.sourceNodeId as string) || !nodes.has(edge.targetNodeId as string) || edge.sourceNodeId === edge.targetNodeId) {
          warn("DANGLING_EDGE", index, { edgeId: op.edgeId ?? op.id });
          continue;
        }
        const count = (counts.get(edgeKey(edge)) ?? 0) - (previous && edgeKey(previous) === edgeKey(edge) ? 1 : 0);
        if (count > 0) { warn("DUPLICATE_EDGE", index, { edgeId: op.edgeId ?? op.id }); continue; }
        if (previous) changeCount(previous, -1);
        changeCount(edge, 1);
        edges.set(op.op === "update_edge" ? op.edgeId as string : `proposal:${index}`, edge);
      }
      if (op.op === "add_edge") delete op.id;
    } else if (op.op === "delete_edge") {
      const edge = edges.get(op.edgeId as string);
      if (edge) { changeCount(edge, -1); edges.delete(op.edgeId as string); }
    }
    operations.push(op);
    operationIndexes.push(index);
  }
  return { proposal: { ...input, summary: input.summary ?? "Suggested canvas update", operations }, warnings, operationIndexes };
}

/** Normalize at receipt, then retain the original strict allowlist/reference validator. */
export function parseSanitizedAIProposal(rawProposal: unknown, context: Context): ReasonAIProposal {
  let sanitizedProposal: unknown;
  let warnings: ProposalDiagnostic[] = [];
  try {
    const result = sanitizeAIProposal(rawProposal, context);
    sanitizedProposal = result.proposal;
    warnings = result.warnings;
    const proposal = parseReasonAIProposal(sanitizedProposal, context);
    if (process.env.NODE_ENV === "development" && warnings.length) console.warn("ReasonAI canvas proposal normalized", { warnings });
    return proposal;
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error("ReasonAI canvas proposal validation failed", {
      errors: [...warnings, { code: "INVALID_PROPOSAL", reason: error instanceof ReasonAIValidationError ? error.message : "Proposal normalization failed." }],
      rawProposal, sanitizedProposal,
    });
    throw error;
  }
}
