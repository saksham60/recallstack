import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { ArchitectureReview, ArchitectureReviewInput, ProposalDelta } from "../src/features/system-design/reasonai/architecture-review";
import { ArchitectureReviewMetadataSchema } from "../src/features/system-design/reasonai/architecture-review";
import { systemDesignAgentProvider, type SystemDesignAgentProvider, type SystemDesignAgentRound, type SystemDesignAgentRoundInput } from "../src/features/system-design/reasonai/agent-provider";
import { SYSTEM_DESIGN_MODELS } from "../src/features/system-design/reasonai/model-registry";
import { parseReasonAIProposal, type ReasonAIProposal, type ReasonAIRequest } from "../src/features/system-design/reasonai/contract";
import { createPendingReasonAIProposal, fingerprintReasonAIContext, fingerprintReasonAIProposal, proposalContentKey } from "../src/features/system-design/reasonai/proposal-state";
import { SystemDesignBudget, SystemDesignBudgetError } from "../src/lib/reasonai/server/langgraph/system-design/budget";
import { applySystemDesignDelta, projectSystemDesignTopology } from "../src/lib/reasonai/server/langgraph/system-design/checkpoint";
import type { SystemDesignGraphStreamEvent } from "../src/lib/reasonai/server/langgraph/system-design/events";
import { streamSystemDesignGraph, type SystemDesignGraphExecution } from "../src/lib/reasonai/server/langgraph/system-design/graph";
import { defaultSystemDesignDurableConversationState, parseSystemDesignDurableConversationState, type SystemDesignDurableConversationState } from "../src/lib/reasonai/server/langgraph/system-design/state";
import { systemDesignToolExecutor } from "../src/lib/reasonai/server/langgraph/system-design/tools";
import { MemoryReasonAIPersistenceRepository } from "../src/lib/reasonai/server/persistence/memory-repository";
import { persistReasonAITranscript } from "../src/lib/reasonai/server/persistence/stream";
import { prepareSystemDesignRun } from "../src/lib/reasonai/server/persistence/system-design-run";
import type { ReasonAIKnownEvent } from "../src/lib/reasonai/runtime/events";
import { parseReasonAIEvent } from "../src/lib/reasonai/runtime/protocol";
import { createReasonAIRuntimeState, reduceReasonAIEvent } from "../src/lib/reasonai/runtime/reducer";
import { streamSystemDesignEvents } from "../src/lib/reasonai/server/system-design-stream";

// Deterministic provider fixtures. These assert workflow behavior, not a real
// model's ability to discover a security defect. All tests are delivered NOT RUN.
const request: ReasonAIRequest = {
  mode: "fix", modelPreference: "ultra", message: "Add a gateway with an authenticated connection to the API.", history: [],
  context: { diagramId: "diagram-1", title: "Checkout", requirements: ["Authenticated access"], scaleAssumptions: [], selectedNodeIds: [], selectedEdgeIds: [],
    nodes: [
      { id: "api", type: "service", label: "API", subtitle: "", description: "", x: 0, y: 0 },
      { id: "db", type: "sql_database", label: "Database", subtitle: "", description: "", x: 400, y: 0 },
    ], edges: [{ id: "api-db", type: "database_read", sourceNodeId: "api", targetNodeId: "db", label: "reads" }],
  },
};
const proposal: ReasonAIProposal = { summary: "Gateway and API connection", operations: [
  { op: "add_node", ref: "new:gateway", type: "service", label: "Gateway", x: 100, y: 100 },
  { op: "add_edge", type: "http_request", sourceNodeId: "new:gateway", targetNodeId: "api", label: "requests" },
] };
const finding: ArchitectureReview["findings"][number] = {
  severity: "high", category: "authentication", affectedRefs: ["new:gateway"],
  explanation: "The proposed gateway description does not identify the authentication boundary.",
  recommendation: "State how gateway access is authenticated; absence from the diagram is not proof that production lacks authentication.",
};
const revise: ArchitectureReview = { verdict: "needs_revision", findings: [finding], suggestedImprovements: [] };
const pass: ArchitectureReview = { verdict: "pass", findings: [], suggestedImprovements: [] };

function tool(value: ReasonAIProposal, id = crypto.randomUUID()): SystemDesignAgentRound {
  const args = JSON.stringify(value);
  return { kind: "tools", calls: [{ id, name: "propose_canvas_changes", arguments: args }], assistantMessage: {
    role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name: "propose_canvas_changes", arguments: args } }],
  } };
}
function final(): SystemDesignAgentRound { return { kind: "final", result: { text: "The proposal is ready for review." } }; }
function scripted(rounds: Array<SystemDesignAgentRound | Error>, received: SystemDesignAgentRoundInput[] = []): SystemDesignAgentProvider {
  let index = 0;
  return { async *streamRound(input) {
    received.push(structuredClone(input));
    const round = rounds[index++];
    if (!round) throw new Error("Unexpected extra generation call.");
    if (round instanceof Error) throw round;
    yield { type: "round", round };
  } };
}
async function collect(provider: SystemDesignAgentProvider, options: Partial<SystemDesignGraphExecution> = {}) {
  const events: SystemDesignGraphStreamEvent[] = [];
  let durable: SystemDesignDurableConversationState | undefined;
  for await (const event of streamSystemDesignGraph(request, {
    durableState: defaultSystemDesignDurableConversationState(), provider, ...options,
    onConversationState: (state) => { durable = state; options.onConversationState?.(state); },
  })) events.push(event);
  return { events, pending: durable?.pendingProposal, durable };
}
function replaceGateway(input: ArchitectureReviewInput, revision = "Authenticated gateway"): ProposalDelta {
  return { proposalId: input.proposalId, baseVersion: input.version, changes: [
    { kind: "replace", operationId: input.operationIds[0], operation: { ...input.proposal.operations[0], label: revision } as ReasonAIProposal["operations"][number] },
  ] };
}

test("semantic review cycles are bounded even when every delta is structurally valid", async () => {
  let reviews = 0, repairs = 0;
  const versions: number[] = [];
  const unchangedIds: string[] = [];
  const provider = scripted([tool(proposal), final()]);
  provider.reviewArchitecture = async (input) => {
    reviews++; versions.push(input.version); unchangedIds.push(input.operationIds[1]); return revise;
  };
  provider.repairProposal = async (input) => replaceGateway(input, `Gateway revision ${++repairs}`);
  const result = await collect(provider, { budgets: { reviewIterations: 3, deltaRepairs: 10 } });
  expect(reviews).toBe(3);
  expect(repairs).toBe(2);
  expect(versions).toEqual([1, 2, 3]);
  expect(new Set(unchangedIds).size).toBe(1);
  expect(result.pending).toMatchObject({ version: 3, proposal: { review: { status: "needs_revision", attempts: 3, repairAttempts: 2, incompleteReason: "review_budget_exhausted" } } });
});

test("total model-call budget spans primary generation, review and valid delta repair", async () => {
  const generation: SystemDesignAgentRoundInput[] = [];
  let reviews = 0, repairs = 0;
  const provider = scripted([tool(proposal), final()], generation);
  provider.reviewArchitecture = async () => { reviews++; return revise; };
  provider.repairProposal = async (input) => replaceGateway(input, `Revision ${++repairs}`);
  const result = await collect(provider, { budgets: { totalModelCalls: 5, reviewIterations: 10, deltaRepairs: 10 } });
  expect(generation.length + reviews + repairs).toBe(5);
  expect(reviews).toBe(2);
  expect(repairs).toBe(1);
  expect(result.pending?.proposal.review?.status).toBe("needs_revision");
});

test("a zero delta-repair budget retains a reviewed proposal with unresolved findings", async () => {
  let repairs = 0;
  const provider = scripted([tool(proposal), final()]);
  provider.reviewArchitecture = async () => revise;
  provider.repairProposal = async (input) => { repairs++; return replaceGateway(input); };
  const result = await collect(provider, { budgets: { deltaRepairs: 0 } });
  expect(repairs).toBe(0);
  expect(result.pending).toMatchObject({ version: 1, proposal: { review: { status: "needs_revision", findings: [finding] } } });
});

test("shared wall-clock deadline stops the entire cycle and reserves cleanup time", async () => {
  let now = 0, reviews = 0;
  const provider = scripted([tool(proposal), final()]);
  provider.reviewArchitecture = async () => { reviews++; return revise; };
  provider.repairProposal = async (input) => { now = 80; return replaceGateway(input); };
  const result = await collect(provider, { startedAt: 0, now: () => now, budgets: { requestDurationMs: 100, cleanupReserveMs: 20 } });
  expect(reviews).toBe(1);
  expect(result.pending).toMatchObject({ version: 1, proposal: { review: { status: "needs_revision", incompleteReason: "request_deadline" } } });
});

test("the complete accumulated baseline exists before a single review is invoked", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  const provider = scripted([
    tool({ summary: "Gateway", operations: [proposal.operations[0]] }),
    tool({ summary: proposal.summary, operations: [proposal.operations[1]] }), final(),
  ], received);
  const reviewed: ArchitectureReviewInput[] = [];
  provider.reviewArchitecture = async (input) => {
    expect(received).toHaveLength(3);
    expect(input.proposal.operations).toHaveLength(2);
    expect(input.topology.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["api", "db", "new:gateway"]));
    expect(input.topology.edges).toHaveLength(2);
    expect(input.request.context.requirements).toEqual(["Authenticated access"]);
    reviewed.push(input); return pass;
  };
  const result = await collect(provider);
  expect(reviewed).toHaveLength(1);
  expect(result.pending?.version).toBe(2);
  expect(result.pending?.proposal.review).toMatchObject({ status: "passed", reviewedProposalVersion: 2, reviewedFingerprint: fingerprintReasonAIProposal(result.pending!.proposal) });
});

test("generation exhaustion preserves a working checkpoint without starting review", async () => {
  let reviews = 0;
  const received: SystemDesignAgentRoundInput[] = [];
  const provider = scripted([tool(proposal)], received);
  provider.reviewArchitecture = async () => { reviews++; return pass; };
  const result = await collect(provider, { budgets: { generationModelCalls: 1 } });
  expect(received).toHaveLength(1);
  expect(reviews).toBe(0);
  expect(result.pending).toMatchObject({ version: 1, proposal: { review: { status: "incomplete", incompleteReason: "generation_model_calls" } } });
});

test("generation shares the absolute request deadline even if the model ignores abort", async () => {
  let calls = 0;
  const provider: SystemDesignAgentProvider = { async *streamRound() {
    if (++calls === 1) yield { type: "round", round: tool(proposal) };
    else await new Promise<void>(() => {});
  } };
  const result = await collect(provider, { budgets: { requestDurationMs: 250, cleanupReserveMs: 50 } });
  expect(calls).toBe(2);
  expect(result.pending?.proposal.review).toMatchObject({ status: "incomplete", incompleteReason: "request_deadline" });
});

test("duplicate recognition canonicalizes nested argument property ordering", async () => {
  const duplicate = tool(proposal, "same-operation-new-id");
  if (duplicate.kind !== "tools" || duplicate.assistantMessage.role !== "assistant") throw new Error("Invalid fixture");
  const reordered = JSON.stringify({ operations: proposal.operations.map((operation) => Object.fromEntries(Object.entries(operation).reverse())), summary: proposal.summary });
  duplicate.calls[0].arguments = reordered;
  duplicate.assistantMessage.tool_calls[0].function.arguments = reordered;
  let executions = 0;
  const result = await collect(scripted([tool(proposal), duplicate, final()]), { toolExecutor: {
    async execute(call, context) { executions++; return systemDesignToolExecutor.execute(call, context); },
  } });
  expect(executions).toBe(1);
  expect(result.pending?.version).toBe(1);
});

test("tool exhaustion retains a checkpoint and makes no final narration call", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  const result = await collect(scripted([tool(proposal)], received), { budgets: { toolRounds: 1 } });
  expect(received).toHaveLength(1);
  expect(result.pending?.proposal.review?.incompleteReason).toBe("tool_rounds");
});

test("budget exhaustion before any proposal returns failure without fabricating a checkpoint", async () => {
  const events: ReasonAIKnownEvent[] = [];
  for await (const event of streamSystemDesignEvents(request, new AbortController().signal, {
    durableState: defaultSystemDesignDurableConversationState(), runId: crypto.randomUUID(), messageId: crypto.randomUUID(),
    provider: scripted([]), budgets: { totalModelCalls: 0 },
  })) events.push(event);
  expect(events.at(-1)).toMatchObject({ type: "run.failed", code: "BUDGET_EXHAUSTED" });
  expect(events.some((event) => event.type === "artifact.proposal")).toBe(false);
});

test("truncated generation is recovered as incomplete and is never reviewed as a completed design", async () => {
  let reviews = 0;
  const provider = scripted([tool(proposal), { kind: "final", generationComplete: false, result: { text: "Incomplete" } }]);
  provider.reviewArchitecture = async () => { reviews++; return pass; };
  const result = await collect(provider);
  expect(reviews).toBe(0);
  expect(result.pending?.proposal.review?.incompleteReason).toBe("generation_truncated");
});

test("duplicate acknowledgment uses the incoming ID and permits a useful later batch", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  let executions = 0;
  const first = { summary: "Gateway", operations: [proposal.operations[0]] };
  const provider = scripted([tool(first, "first"), tool(first, "retry-new-id"), tool({ summary: proposal.summary, operations: [proposal.operations[1]] }, "second-batch"), final()], received);
  const result = await collect(provider, { toolExecutor: { async execute(call, context) { executions++; return systemDesignToolExecutor.execute(call, context); } } });
  expect(executions).toBe(2);
  const acknowledgment = received[2].agentMessages.find((message) => message.role === "tool" && message.tool_call_id === "retry-new-id");
  expect(acknowledgment).toMatchObject({ role: "tool", tool_call_id: "retry-new-id" });
  expect(JSON.parse(acknowledgment!.content!)).toMatchObject({ ok: true, status: "already_completed" });
  expect(result.events.filter((event) => event.type === "proposal")).toHaveLength(2);
  expect(result.pending?.version).toBe(2);
  expect(result.pending?.proposal.operations).toHaveLength(2);
});

test("repeated duplicates consume a bounded recovery budget without losing validated operations", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  const result = await collect(scripted([tool(proposal, "a"), tool(proposal, "b"), tool(proposal, "c")], received), { budgets: { duplicateCalls: 1 } });
  expect(received).toHaveLength(3);
  expect(result.pending?.version).toBe(1);
  expect(result.pending?.proposal.operations).toHaveLength(2);
  expect(result.pending?.proposal.review?.incompleteReason).toBe("duplicate_calls");
});

test("invalid proposal diagnostics permit an additional primary-model correction", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  const invalid: ReasonAIProposal = { summary: "Invalid target", operations: [{ op: "delete_node", nodeId: "missing" }] };
  const result = await collect(scripted([tool(invalid, "invalid"), tool(proposal, "corrected"), final()], received));
  const failure = received[1].agentMessages.find((message) => message.role === "tool" && message.tool_call_id === "invalid");
  expect(JSON.parse(failure!.content!)).toMatchObject({ ok: false, diagnostic: { code: "INVALID_OPERATION_REFERENCE", operationIndex: 0 } });
  expect(result.pending?.proposal.operations).toHaveLength(2);
});

for (const [name, reviewer, status] of [
  ["provider failure", async () => { throw new Error("Provider unavailable"); }, "failed"],
  ["malformed response", async () => ({ verdict: "approved" } as unknown as ArchitectureReview), "failed"],
  ["successful advisory review", async () => pass, "passed"],
] as const) {
  test(`review ${name} preserves baseline identity and reports ${status}`, async () => {
    const provider = scripted([tool(proposal), final()]);
    provider.reviewArchitecture = reviewer;
    const result = await collect(provider);
    const baseline = result.events.find((event) => event.type === "proposal");
    if (baseline?.type !== "proposal") throw new Error("Missing working checkpoint");
    expect(result.pending?.proposalId).toBe(baseline.checkpoint?.proposalId);
    expect(result.pending?.operationIds).toEqual(baseline.checkpoint?.operationIds);
    expect(result.pending?.version).toBe(1);
    expect(result.pending?.proposal.review?.status).toBe(status);
    expect(result.events.at(-1)?.type).toBe("result");
  });
}

test("an unavailable reviewer is explicitly not_started", async () => {
  const result = await collect(scripted([tool(proposal), final()]));
  expect(result.pending?.proposal.review).toMatchObject({ status: "not_started", attempts: 0, incompleteReason: "reviewer_unavailable" });
});

test("review timeout also bounds an uncooperative provider and retains the baseline", async () => {
  const provider = scripted([tool(proposal), final()]);
  provider.reviewArchitecture = async () => new Promise<ArchitectureReview>(() => {});
  const result = await collect(provider, { budgets: { reviewCallMs: 5 } });
  expect(result.pending?.version).toBe(1);
  expect(result.pending?.proposal.review).toMatchObject({ status: "incomplete", incompleteReason: "stage_timeout" });
});

test("valid delta repair preserves unrelated IDs and re-reviews the revised topology", async () => {
  const snapshots: ArchitectureReviewInput[] = [];
  const provider = scripted([tool(proposal), final()]);
  provider.reviewArchitecture = async (input) => { snapshots.push(structuredClone(input)); return snapshots.length === 1 ? revise : pass; };
  provider.repairProposal = async (input) => replaceGateway(input);
  const result = await collect(provider);
  expect(snapshots).toHaveLength(2);
  expect(snapshots[1].proposalId).toBe(snapshots[0].proposalId);
  expect(snapshots[1].operationIds[1]).toBe(snapshots[0].operationIds[1]);
  expect(snapshots[1].operationIds[0]).not.toBe(snapshots[0].operationIds[0]);
  expect(snapshots[1].topology.nodes.find((node) => node.id === "new:gateway")?.label).toBe("Authenticated gateway");
  expect(result.pending?.proposal.review).toMatchObject({ status: "passed", reviewedProposalVersion: 2, lastValidatedProposalVersion: 2 });
});

test("invalid delta leaves baseline operations, version, mappings and IDs untouched", async () => {
  let baseline: ArchitectureReviewInput | undefined;
  const provider = scripted([tool(proposal), final()]);
  provider.reviewArchitecture = async (input) => { baseline = structuredClone(input); return revise; };
  provider.repairProposal = async (input) => ({ proposalId: input.proposalId, baseVersion: input.version, changes: [{ kind: "remove", operationId: input.operationIds[0] }] });
  const result = await collect(provider);
  expect(result.pending?.proposalId).toBe(baseline!.proposalId);
  expect(result.pending?.version).toBe(baseline!.version);
  expect(result.pending?.operationIds).toEqual(baseline!.operationIds);
  expect(result.pending?.proposal.operations).toEqual(baseline!.proposal.operations);
  expect(result.pending?.baseFingerprint).toBe(fingerprintReasonAIContext(request.context));
  expect(result.pending?.proposal.review).toMatchObject({ status: "needs_revision", incompleteReason: "REPAIR_FAILED" });
});

test("delta removal and replacement require dependent references to be repaired atomically", () => {
  const checkpoint = createPendingReasonAIProposal(proposal, request.context);
  const original = structuredClone(checkpoint);
  const base = { proposalId: checkpoint.proposalId, baseVersion: checkpoint.version };
  expect(() => applySystemDesignDelta(checkpoint, { ...base, changes: [{ kind: "remove", operationId: checkpoint.operationIds[0] }] }, request.context)).toThrow();
  expect(() => applySystemDesignDelta(checkpoint, { ...base, changes: [{ kind: "replace", operationId: checkpoint.operationIds[0], operation: { ...proposal.operations[0], ref: "new:other" } as ReasonAIProposal["operations"][number] }] }, request.context)).toThrow();
  const repaired = applySystemDesignDelta(checkpoint, { ...base, changes: [
    { kind: "remove", operationId: checkpoint.operationIds[0] }, { kind: "remove", operationId: checkpoint.operationIds[1] },
    { kind: "add", operation: { op: "update_node", nodeId: "api", description: "Authenticate gateway requests." } },
  ] }, request.context);
  expect(repaired.version).toBe(2);
  expect(checkpoint).toEqual(original);
  expect(repaired.proposal.operations).toHaveLength(1);
});

test("delta insertion can introduce a node before its dependent existing operation", () => {
  const checkpoint = createPendingReasonAIProposal(proposal, request.context);
  const repaired = applySystemDesignDelta(checkpoint, { proposalId: checkpoint.proposalId, baseVersion: checkpoint.version, changes: [
    { kind: "add", beforeOperationId: checkpoint.operationIds[1], operation: { op: "add_node", ref: "new:auth", type: "identity_provider", label: "Identity", x: 200, y: 200 } },
    { kind: "replace", operationId: checkpoint.operationIds[1], operation: { op: "add_edge", type: "http_request", sourceNodeId: "new:gateway", targetNodeId: "new:auth" } },
  ] }, request.context);
  expect(projectSystemDesignTopology(request.context, repaired.proposal).nodes).toHaveLength(4);
  expect(repaired.operationIds[0]).toBe(checkpoint.operationIds[0]);
});

test("delta repair cannot modify approved or dismissed operations or reuse a stale version", () => {
  const checkpoint = createPendingReasonAIProposal(proposal, request.context);
  checkpoint.acceptedOperationIds = [checkpoint.operationIds[0]];
  checkpoint.dismissedOperationIds = [checkpoint.operationIds[1]];
  checkpoint.refMappings = { "new:gateway": "actual-gateway" };
  const original = structuredClone(checkpoint);
  for (const operationId of checkpoint.operationIds) expect(() => applySystemDesignDelta(checkpoint, {
    proposalId: checkpoint.proposalId, baseVersion: checkpoint.version, changes: [{ kind: "remove", operationId }],
  }, request.context)).toThrow("approved or dismissed");
  expect(() => applySystemDesignDelta(checkpoint, { proposalId: checkpoint.proposalId, baseVersion: 99, changes: [{ kind: "remove", operationId: checkpoint.operationIds[0] }] }, request.context)).toThrow("Stale");
  expect(checkpoint).toEqual(original);
});

test("a delta with a duplicate connection is rejected without dropping another operation", () => {
  const checkpoint = createPendingReasonAIProposal(proposal, request.context);
  const original = structuredClone(checkpoint);
  expect(() => applySystemDesignDelta(checkpoint, { proposalId: checkpoint.proposalId, baseVersion: checkpoint.version, changes: [
    { kind: "add", operation: proposal.operations[1] },
  ] }, request.context)).toThrow("conflicting or redundant");
  expect(checkpoint).toEqual(original);
});

test("review metadata cannot manufacture a pass or increment a content version", () => {
  const first = createPendingReasonAIProposal(proposal, request.context);
  const second = createPendingReasonAIProposal({ ...proposal, review: {
    status: "passed", attempts: 1, repairAttempts: 0, findings: [], lastValidatedProposalVersion: first.version,
    reviewedProposalVersion: first.version, reviewedFingerprint: fingerprintReasonAIProposal(proposal),
  } }, request.context, first);
  expect(second.version).toBe(first.version);
  expect(second.operationIds).toEqual(first.operationIds);
  expect(() => ArchitectureReviewMetadataSchema.parse({ status: "passed", attempts: 0, repairAttempts: 0, findings: [], lastValidatedProposalVersion: 1 })).toThrow();
  expect(() => parseReasonAIProposal(second.proposal, request.context)).toThrow("Unsupported proposal field");
  expect(() => parseSystemDesignDurableConversationState({ ...defaultSystemDesignDurableConversationState(), pendingProposal: {
    ...second, proposal: { ...second.proposal, review: { ...second.proposal.review!, reviewedFingerprint: "wrong-content" } },
  } })).toThrow("Invalid pending proposal");
});

test("a persistence acknowledgment cannot confirm a different proposal revision", () => {
  const runId = crypto.randomUUID(), messageId = crypto.randomUUID(), proposalId = crypto.randomUUID();
  let runtime = createReasonAIRuntimeState();
  const events: ReasonAIKnownEvent[] = [
    { protocolVersion: 1, runId, seq: 1, type: "run.started" },
    { protocolVersion: 1, runId, seq: 2, type: "artifact.proposal", messageId, partId: "proposal", proposalId, proposalVersion: 2, data: proposal, persistenceStatus: "working" },
    { protocolVersion: 1, runId, seq: 3, type: "artifact.persistence", messageId, proposalId, proposalVersion: 1, persistenceStatus: "saved" },
  ];
  for (const event of events) runtime = reduceReasonAIEvent(runtime, parseReasonAIEvent(event));
  expect(runtime.messages.flatMap((message) => message.parts).find((part) => part.type === "artifact")).toMatchObject({ proposalVersion: 2, persistenceStatus: "working" });
});

test("final narration failure retains a validated checkpoint with an incomplete outcome", async () => {
  const result = await collect(scripted([tool(proposal), new Error("Narration provider failed")]));
  expect(result.pending?.version).toBe(1);
  expect(result.pending?.proposal.operations).toHaveLength(2);
  expect(result.pending?.proposal.review?.status).toBe("incomplete");
  expect(result.events.at(-1)).toMatchObject({ type: "result", result: { outcome: "awaiting_approval", notice: expect.stringContaining("incomplete") } });
});

for (const stage of ["review", "repair"] as const) {
  test(`cancellation during ${stage} stops calls and does not publish durable completion`, async () => {
    const controller = new AbortController();
    const provider = scripted([tool(proposal), final()]);
    provider.reviewArchitecture = async () => {
      if (stage === "review") controller.abort(new DOMException("Stopped", "AbortError"));
      return revise;
    };
    provider.repairProposal = async (input) => { controller.abort(new DOMException("Stopped", "AbortError")); return replaceGateway(input); };
    let candidate: unknown;
    const events: ReasonAIKnownEvent[] = [];
    for await (const event of streamSystemDesignEvents(request, controller.signal, {
      durableState: defaultSystemDesignDurableConversationState(), provider, runId: crypto.randomUUID(), messageId: crypto.randomUUID(),
      onConversationState: (state) => { candidate = state; },
    })) events.push(event);
    expect(events.at(-1)?.type).toBe("run.cancelled");
    expect(events.some((event) => event.type === "run.completed" || event.type === "artifact.persistence")).toBe(false);
    expect(candidate).toBeUndefined();
  });
}

test("budget counters never reset between stages and reserve the configured cleanup window", () => {
  let now = 0;
  const budget = new SystemDesignBudget({ totalModelCalls: 3, requestDurationMs: 100, cleanupReserveMs: 20 }, 0, () => now);
  budget.beginModelCall("generation"); budget.beginModelCall("review"); budget.beginModelCall("repair");
  expect(() => budget.beginModelCall("review")).toThrow(SystemDesignBudgetError);
  expect(budget.modelCalls).toBe(3);
  now = 80;
  expect(() => budget.check()).toThrow(SystemDesignBudgetError);
  expect(budget.deadline).toBe(80);
});

async function persistedRun(repository: MemoryReasonAIPersistenceRepository, provider: SystemDesignAgentProvider) {
  const user = "user-a";
  const prepared = await prepareSystemDesignRun(repository, user, { ...request, idempotencyKey: crypto.randomUUID() });
  if (prepared.kind !== "acquired") throw new Error("Expected a fresh run");
  let candidate: SystemDesignDurableConversationState | undefined;
  const source = streamSystemDesignEvents(request, new AbortController().signal, {
    durableState: defaultSystemDesignDurableConversationState(), provider, runId: prepared.run.id, messageId: prepared.assistantMessageId,
    onConversationState: (state) => { candidate = state; },
  });
  const events: ReasonAIKnownEvent[] = [];
  for await (const event of persistReasonAITranscript(repository, user, prepared.conversation.id, prepared.run.id, source,
    undefined, () => candidate, { confirmArtifactPersistence: true, expectedStateVersion: 0 })) events.push(event);
  return { user, prepared, candidate, events };
}

test("saved confirmation follows successful persistence and matches the durable checkpoint exactly", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const provider = scripted([tool(proposal), new Error("Final narration unavailable")]);
  const { user, prepared, events } = await persistedRun(repository, provider);
  expect(events.at(-1)?.type).toBe("run.completed");
  expect(events.at(-2)).toMatchObject({ type: "artifact.persistence", persistenceStatus: "saved" });
  const stored = await repository.getConversationState(user, prepared.conversation.id);
  const checkpoint = parseSystemDesignDurableConversationState(stored!.state).pendingProposal!;
  const artifacts = events.filter((event) => event.type === "artifact.proposal");
  expect(artifacts.at(-1)).toMatchObject({ proposalId: checkpoint.proposalId, proposalVersion: checkpoint.version, data: checkpoint.proposal, persistenceStatus: "working" });
  expect(events.at(-2)).toMatchObject({ proposalId: checkpoint.proposalId, proposalVersion: checkpoint.version });
  expect(checkpoint.proposal.review?.status).toBe("incomplete");
  let runtime = createReasonAIRuntimeState();
  for (const event of events) runtime = reduceReasonAIEvent(runtime, parseReasonAIEvent(event));
  expect(runtime.status).toBe("completed");
  expect(runtime.messages.flatMap((message) => message.parts).find((part) => part.type === "artifact")).toMatchObject({ persistenceStatus: "saved" });
  expect(events.map((event) => event.seq)).toEqual(events.map((_event, index) => index + 1));
  const history = await repository.getConversation(user, prepared.conversation.id);
  expect(history!.messages.flatMap((message) => message.parts).find((part) => part.type === "artifact")).toMatchObject({ persistenceStatus: "saved" });
});

test("persistence failure never emits saved confirmation or successful completion", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const finalize = repository.finalizeRun.bind(repository);
  repository.finalizeRun = async (...args) => {
    if (args[3].status === "completed") throw new Error("Database unavailable");
    return finalize(...args);
  };
  const { user, prepared, events } = await persistedRun(repository, scripted([tool(proposal), final()]));
  expect(events.at(-1)).toMatchObject({ type: "run.failed", code: "PERSISTENCE_FAILURE" });
  expect(events.some((event) => event.type === "artifact.persistence" || event.type === "run.completed")).toBe(false);
  expect(await repository.getConversationState(user, prepared.conversation.id)).toBeUndefined();
  expect(events.filter((event) => event.type === "artifact.proposal").every((event) => event.persistenceStatus === "working")).toBe(true);
});

test("stale completion cannot overwrite saved approval decisions and retry is idempotent", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const { user, prepared } = await persistedRun(repository, scripted([tool(proposal), final()]));
  const stored = await repository.getConversationState(user, prepared.conversation.id);
  const pending = parseSystemDesignDurableConversationState(stored!.state).pendingProposal!;
  await repository.transitionProposal(user, prepared.conversation.id, {
    eventId: crypto.randomUUID(), proposalId: pending.proposalId, version: pending.version,
    expectedStateVersion: stored!.stateVersion, action: "dismiss_item", operationId: pending.operationIds[1],
  });
  const newer = await repository.getConversationState(user, prepared.conversation.id);
  const acquired = await repository.acquireRun(user, prepared.conversation.id, crypto.randomUUID());
  if (acquired.kind !== "acquired") throw new Error("Expected run acquisition");
  await expect(repository.finalizeRun(user, prepared.conversation.id, acquired.run.id, {
    status: "completed", lastSeq: 1, expectedStateVersion: stored!.stateVersion, nextConversationState: stored!.state,
  })).rejects.toMatchObject({ code: "STATE_CONFLICT" });
  expect(await repository.getConversationState(user, prepared.conversation.id)).toEqual(newer);
  // A terminal retry of the original run must not reapply the old state.
  await repository.finalizeRun(user, prepared.conversation.id, prepared.run.id, {
    status: "completed", lastSeq: 1, expectedStateVersion: 0, nextConversationState: stored!.state,
  });
  expect(await repository.getConversationState(user, prepared.conversation.id)).toEqual(newer);
});

test("a cancellation winning finalization cannot be reported as a saved proposal", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const finalize = repository.finalizeRun.bind(repository);
  repository.finalizeRun = async (...args) => {
    if (args[3].status === "completed") await repository.cancelRun(args[0], args[1], args[2]);
    return finalize(...args);
  };
  const { user, prepared, events } = await persistedRun(repository, scripted([tool(proposal), final()]));
  expect(events.at(-1)).toMatchObject({ type: "run.failed", code: "RUN_TERMINATED" });
  expect(events.some((event) => event.type === "artifact.persistence" || event.type === "run.completed")).toBe(false);
  expect(await repository.getConversationState(user, prepared.conversation.id)).toBeUndefined();
});

test("guarded SQL handoff preserves ownership, row locks, expected version and terminal semantics", async () => {
  const sql = await readFile("supabase/legacy-proposals/20261024_reasonai_checkpoint_finalization.sql", "utf8");
  expect(sql).toContain("c.user_id = (select auth.uid())");
  expect(sql).toContain("for update");
  expect(sql).toContain("coalesce(v_version, 0) <> p_expected_state_version");
  expect(sql).toContain("v_run.status <> 'running'");
  expect(sql).toContain("public.reasonai_finalize_run(");
  expect(sql).toContain("from public, anon");
  expect(sql).not.toContain("create table");
});

test("production review uses Ultra and main-agent repair uses the selected tier through the same provider", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.NEBIUS_API_KEY;
  const originalURL = process.env.REASONAI_BASE_URL;
  const bodies: Array<Record<string, unknown>> = [];
  const checkpoint = createPendingReasonAIProposal(proposal, request.context);
  const input: ArchitectureReviewInput = {
    request, proposalId: checkpoint.proposalId, version: checkpoint.version, proposal, operationIds: checkpoint.operationIds,
    fingerprint: fingerprintReasonAIProposal(proposal), topology: projectSystemDesignTopology(request.context, proposal),
  };
  try {
    process.env.NEBIUS_API_KEY = "test-provider-key";
    process.env.REASONAI_BASE_URL = "https://provider.test/v1";
    globalThis.fetch = async (url, init) => {
      expect(String(url)).toBe("https://provider.test/v1/chat/completions");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      const name = bodies.length === 1 ? "submit_architecture_review" : "submit_proposal_delta";
      return Response.json({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: { name, arguments: JSON.stringify(bodies.length === 1 ? pass : replaceGateway(input)) } }] } }] });
    };
    expect(await systemDesignAgentProvider.reviewArchitecture!(input)).toEqual(pass);
    await systemDesignAgentProvider.repairProposal!({ ...input, findings: [finding], modelTier: "super" });
    expect(bodies[0].model).toBe(SYSTEM_DESIGN_MODELS.ultra);
    expect(bodies[1].model).toBe(SYSTEM_DESIGN_MODELS.super);
    expect(bodies.every((body) => body.stream === false)).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = originalKey;
    if (originalURL === undefined) delete process.env.REASONAI_BASE_URL; else process.env.REASONAI_BASE_URL = originalURL;
  }
});

test("synthetic October 24 incident sequences retain validated work without asserting an unproven cause", async () => {
  const invalid: ReasonAIProposal = { summary: "Invalid batch", operations: [{ op: "delete_node", nodeId: "missing" }] };
  const incidentA = await collect(scripted([tool(proposal), tool(invalid), tool(proposal, "repeated"), new Error("Provider continuation failure")]));
  expect(incidentA.pending?.proposal.operations).toHaveLength(2);
  expect(incidentA.events.at(-1)?.type).toBe("result");

  const analysis: SystemDesignAgentRound = { kind: "tools", calls: [{ id: "analysis", name: "show_architecture_analysis", arguments: "{}" }], assistantMessage: {
    role: "assistant", content: null, tool_calls: [{ id: "analysis", type: "function", function: { name: "show_architecture_analysis", arguments: "{}" } }],
  } };
  const incidentB = await collect(scripted([analysis, tool(proposal), new Error("Subsequent provider failure")]), { toolExecutor: {
    async execute(call, context) {
      if (call.name === "show_architecture_analysis") return { ok: true, message: { role: "tool", tool_call_id: call.id, content: '{"ok":true}' } };
      return systemDesignToolExecutor.execute(call, context);
    },
  } });
  expect(incidentB.pending?.proposal.operations).toHaveLength(2);
  expect(incidentB.pending?.proposal.review?.status).toBe("incomplete");
  await expect(collect(scripted([new Error("Early provider failure; cause unconfirmed")]))).rejects.toThrow("Early provider failure");
});

test("content fingerprints ignore review bookkeeping while diagram fingerprints still detect canvas changes", () => {
  const reviewed = { ...proposal, review: { status: "incomplete" as const, attempts: 1, repairAttempts: 0, findings: [], lastValidatedProposalVersion: 1 } };
  expect(proposalContentKey(reviewed)).toBe(proposalContentKey(proposal));
  expect(fingerprintReasonAIProposal(reviewed)).toBe(fingerprintReasonAIProposal(proposal));
  expect(fingerprintReasonAIContext({ ...request.context, nodes: request.context.nodes.map((node) => ({ ...node, x: node.x + 1 })) })).not.toBe(fingerprintReasonAIContext(request.context));
});
