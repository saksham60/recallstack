import { parseReasonAIProposal, type ReasonAIContext, type ReasonAIOperation, type ReasonAIProposal } from "./contract";
import { SYSTEM_DESIGN_NODE_DEFINITIONS, isSystemDesignBoundaryNodeType } from "../constants/system-design-palette";

type BaseContext = Pick<ReasonAIContext, "diagramId" | "nodes" | "edges">;
export type ReasonAIProposalStatus = "pending" | "partially_accepted" | "accepted" | "discarded" | "superseded" | "stale" | "failed";
export interface ReasonAIPendingProposal {
  proposalId: string;
  version: number;
  diagramId: string;
  baseFingerprint: string;
  lastReportedFingerprint?: string;
  baseContext: BaseContext;
  status: ReasonAIProposalStatus;
  proposal: ReasonAIProposal;
  operationIds: string[];
  acceptedOperationIds: string[];
  dismissedOperationIds: string[];
  refMappings: Record<string, string>;
  warnings: string[];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Stable content fingerprint. Viewport, selection and timestamps are omitted. */
export function fingerprintReasonAIContext(context: BaseContext): string {
  const content = JSON.stringify(canonical({
    diagramId: context.diagramId ?? "",
    nodes: [...context.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...context.edges].sort((a, b) => a.id.localeCompare(b.id)),
  }));
  let hash = BigInt("0xcbf29ce484222325");
  for (const byte of new TextEncoder().encode(content)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * BigInt("0x100000001b3"));
  return `fnv64:${hash.toString(16).padStart(16, "0")}`;
}

export function createPendingReasonAIProposal(proposal: ReasonAIProposal, context: BaseContext, previous?: ReasonAIPendingProposal, versionIncrement = 1): ReasonAIPendingProposal {
  const validated = parseReasonAIProposal(proposal, context, "accumulated");
  const oldIds = new Map<string, string[]>();
  previous?.proposal.operations.forEach((operation, index) => {
    const key = JSON.stringify(canonical(operation));
    oldIds.set(key, [...(oldIds.get(key) ?? []), previous.operationIds[index]]);
    const resolvedKey = JSON.stringify(canonical(resolveReasonAIRefs(operation, previous.refMappings)));
    if (resolvedKey !== key) oldIds.set(resolvedKey, [...(oldIds.get(resolvedKey) ?? []), previous.operationIds[index]]);
  });
  const operationIds = validated.operations.map((operation: ReasonAIOperation) => oldIds.get(JSON.stringify(canonical(operation)))?.shift() ?? crypto.randomUUID());
  const rebased = previous?.status === "partially_accepted" && previous.lastReportedFingerprint === fingerprintReasonAIContext(context);
  return {
    proposalId: previous?.proposalId ?? crypto.randomUUID(),
    version: (previous?.version ?? 0) + versionIncrement,
    diagramId: context.diagramId ?? "",
    baseFingerprint: rebased ? fingerprintReasonAIContext(context) : previous?.baseFingerprint ?? fingerprintReasonAIContext(context),
    baseContext: rebased ? { diagramId: context.diagramId, nodes: context.nodes, edges: context.edges } : previous?.baseContext ?? { diagramId: context.diagramId, nodes: context.nodes, edges: context.edges },
    status: "pending",
    proposal: validated,
    operationIds,
    acceptedOperationIds: rebased ? [] : previous?.acceptedOperationIds ?? [],
    dismissedOperationIds: rebased ? [] : previous?.dismissedOperationIds ?? [],
    refMappings: previous?.refMappings ?? {},
    warnings: previous?.warnings ?? [],
  };
}

function resolveReasonAIRefs(operation: ReasonAIOperation, mappings: Record<string, string>): ReasonAIOperation {
  const resolve = (id: string) => mappings[id] ?? id;
  if ("nodeId" in operation) return { ...operation, nodeId: resolve(operation.nodeId) };
  if (operation.op === "add_edge" || operation.op === "update_edge") return { ...operation,
    ...(operation.sourceNodeId ? { sourceNodeId: resolve(operation.sourceNodeId) } : {}),
    ...(operation.targetNodeId ? { targetNodeId: resolve(operation.targetNodeId) } : {}),
  };
  return operation;
}

/** Reconcile accepted pending references with real nodes in the verified local diagram. */
export function remainingReasonAIProposal(pending: ReasonAIPendingProposal): ReasonAIProposal {
  const decided = new Set([...pending.acceptedOperationIds, ...pending.dismissedOperationIds]);
  return {
    ...pending.proposal,
    operations: pending.proposal.operations.map((operation, index): ReasonAIOperation | null => {
      if (decided.has(pending.operationIds[index])) return null;
      return resolveReasonAIRefs(operation, pending.refMappings);
    }).filter((operation): operation is ReasonAIOperation => operation !== null),
  };
}

export function remainingReasonAIOperationIndexes(pending: ReasonAIPendingProposal): number[] {
  const decided = new Set([...pending.acceptedOperationIds, ...pending.dismissedOperationIds]);
  return pending.operationIds.flatMap((id, index) => decided.has(id) ? [] : [index]);
}

export function usablePendingReasonAIProposal(pending: ReasonAIPendingProposal | undefined, context: BaseContext): ReasonAIPendingProposal | undefined {
  return pending && (pending.status === "pending" || pending.status === "partially_accepted")
    && pending.diagramId === (context.diagramId ?? "")
    && (pending.lastReportedFingerprint ?? pending.baseFingerprint) === fingerprintReasonAIContext(context)
    ? pending : undefined;
}

const lanes: Record<string, number> = {
  user: 0, web_app: 0, mobile_app: 0, admin_portal: 0,
  dns: 1, cdn: 1, load_balancer: 1, api_gateway: 1,
  service: 2, microservice: 2, monolith: 2, worker: 2, serverless_function: 2,
  message_queue: 3, event_stream: 3, pubsub: 3,
  sql_database: 4, nosql_database: 4, cache: 4, search_engine: 4, object_storage: 4, data_warehouse: 4,
  third_party_api: 5, payment_provider: 5, notification_provider: 5, email_provider: 5, sms_provider: 5, identity_provider: 5,
};

/** Lay out the complete proposal; acceptance uses these exact x/y values. */
export function layoutReasonAIProposal(proposal: ReasonAIProposal, context: BaseContext, previous?: ReasonAIProposal): ReasonAIProposal {
  const priorPositions = new Map(previous?.operations.flatMap((operation) => operation.op === "add_node" ? [[operation.ref, { x: operation.x, y: operation.y }] as const] : []) ?? []);
  const occupied = context.nodes.map((node) => ({
    x: node.x, y: node.y,
    width: SYSTEM_DESIGN_NODE_DEFINITIONS[node.type].defaultWidth,
    height: SYSTEM_DESIGN_NODE_DEFINITIONS[node.type].defaultHeight,
  }));
  const anchorX = occupied.length ? Math.max(...occupied.map((box) => box.x + box.width)) + 120 : 80;
  const anchorY = occupied.length ? Math.min(...occupied.map((box) => box.y)) : 80;
  const laneRows = new Map<number, number>();
  const operations = proposal.operations.map((operation) => {
    if (operation.op !== "add_node") return operation;
    const definition = SYSTEM_DESIGN_NODE_DEFINITIONS[operation.type];
    const prior = priorPositions.get(operation.ref);
    if (prior) {
      occupied.push({ ...prior, width: definition.defaultWidth, height: definition.defaultHeight });
      return { ...operation, ...prior };
    }
    const lane = lanes[operation.type] ?? (isSystemDesignBoundaryNodeType(operation.type) ? 6 : 2);
    const row = laneRows.get(lane) ?? 0;
    laneRows.set(lane, row + 1);
    const x = anchorX + lane * 280;
    let y = anchorY + row * 170;
    const collides = () => occupied.some((box) => x < box.x + box.width + 32 && x + definition.defaultWidth + 32 > box.x
      && y < box.y + box.height + 32 && y + definition.defaultHeight + 32 > box.y);
    while (collides()) y += 170;
    occupied.push({ x, y, width: definition.defaultWidth, height: definition.defaultHeight });
    return { ...operation, x, y };
  });
  return { ...proposal, operations };
}
