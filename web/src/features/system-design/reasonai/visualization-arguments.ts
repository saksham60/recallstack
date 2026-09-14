import "server-only";
import type { ReasonAIContext } from "./contract";

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Repair observed Nemotron serialization quirks, then run the strict validator.
 * No IDs, metrics or architectural claims are invented. Unknown fields survive
 * so that validation rejects them; this is not an arbitrary property allowlist.
 */
export function normalizeVisualizationArguments(value: unknown, context: Pick<ReasonAIContext, "nodes" | "edges">): unknown {
  const input = object(value);
  if (!input) return value;
  const data = { ...input };
  for (const field of ["nodes", "edges", "assumptions"] as const) {
    const value = data[field];
    if (typeof value !== "string" || value.length > 64_000) continue;
    if (value.trim().startsWith("[")) {
      try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed)) data[field] = parsed; } catch { /* Strict validation rejects malformed JSON. */ }
    } else if (field === "assumptions" && value.trim() && value.length <= 400) data[field] = [value];
  }
  const nodeIds = new Set(context.nodes.map((node) => node.id));
  const edges = new Map(context.edges.map((edge) => [edge.id, edge]));
  for (const field of ["nodes", "edges"] as const) {
    const items = data[field];
    if (!Array.isArray(items) || items.length > (field === "nodes" ? 40 : 60)) continue;
    data[field] = items.map((value) => {
      const raw = object(value);
      if (!raw) return value;
      const item = { ...raw };
      if (field === "edges") {
        // The occasional nodeId alias is accepted only for an unambiguous
        // existing edge ID, never for an actual node or a fabricated reference.
        if (item.edgeId === undefined && typeof item.nodeId === "string" && edges.has(item.nodeId) && !nodeIds.has(item.nodeId)) {
          item.edgeId = item.nodeId; delete item.nodeId;
        }
        const edge = typeof item.edgeId === "string" ? edges.get(item.edgeId) : undefined;
        for (const endpoint of ["sourceNodeId", "targetNodeId"] as const) {
          if (edge && item[endpoint] === edge[endpoint]) delete item[endpoint];
        }
      }
      for (const optional of ["label", "reason", "assumption", "severity", "metric"] as const) {
        if (item[optional] === null || item[optional] === "") delete item[optional];
      }
      const metric = object(item.metric);
      // Discard a content-free unknown metric; never fill in evidence or relax
      // validation for supplied, assumed, estimated or documented quantities.
      if (metric?.basis === "unknown" && [undefined, null, ""].includes(metric.evidence as undefined | null | string)) delete item.metric;
      return item;
    });
  }
  return data;
}
