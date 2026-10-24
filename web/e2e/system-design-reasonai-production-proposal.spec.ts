import { expect, test } from "@playwright/test";
import { systemDesignAgentProvider, type SystemDesignAgentProvider, type SystemDesignAgentRound, type SystemDesignAgentRoundInput } from "../src/features/system-design/reasonai/agent-provider";
import { allowsReasonAIProposal, parseReasonAIProposal, requiresReasonAIProposal, type ReasonAIProposal, type ReasonAIRequest } from "../src/features/system-design/reasonai/contract";
import { createPendingReasonAIProposal } from "../src/features/system-design/reasonai/proposal-state";
import type { ReasonAIKnownEvent } from "../src/lib/reasonai/runtime/events";
import { streamSystemDesignEvents } from "../src/lib/reasonai/server/system-design-stream";
import { defaultSystemDesignDurableConversationState, type SystemDesignDurableConversationState } from "../src/lib/reasonai/server/langgraph/system-design/state";
import { systemDesignToolExecutor } from "../src/lib/reasonai/server/langgraph/system-design/tools";

// The saved transcript and runtime log establish the diagnostic, duplicated
// notice and zero-proposal completion for f3e2e650-4b77-43f0-8f80-ccbbe93fa5a5.
// No submitted arguments were retained. Invalid payloads below are synthetic,
// not reconstructions of that run or of the user's clipboard selection.
const request: ReasonAIRequest = {
  mode: "review", modelPreference: "ultra",
  message: "Review my existing architecture. Preserve the current nodes and connections. Identify security, scalability and reliability weaknesses, then propose the missing components, connections and safeguards.",
  history: [], context: { diagramId: "diagram-1", title: "API", requirements: [], scaleAssumptions: [], selectedNodeIds: [], selectedEdgeIds: [],
    nodes: [{ id: "api", type: "service", label: "API", x: 0, y: 0 }], edges: [],
  },
};
const proposal: ReasonAIProposal = { summary: "Gateway and connection", operations: [
  { op: "add_node", ref: "new:gateway", type: "service", label: "Gateway", x: 200, y: 0 },
  { op: "add_edge", type: "http_request", sourceNodeId: "new:gateway", targetNodeId: "api" },
] };
const warning = "A canvas proposal attempt failed validation. Only validated suggestions are shown.";
const pass = { verdict: "pass" as const, findings: [], suggestedImprovements: [] };
function tool(value: unknown, id: string, name = "propose_canvas_changes"): SystemDesignAgentRound {
  const args = JSON.stringify(value);
  return { kind: "tools", calls: [{ id, name, arguments: args }], assistantMessage: {
    role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: args } }],
  } };
}
function final(text = "Validated suggestions are ready for approval."): SystemDesignAgentRound {
  return { kind: "final", result: { text } };
}
function scripted(rounds: SystemDesignAgentRound[], received: SystemDesignAgentRoundInput[] = []): SystemDesignAgentProvider {
  let index = 0;
  return { async *streamRound(input) {
    received.push(structuredClone(input));
    if (!rounds[index]) throw new Error("Unexpected extra model call");
    yield { type: "round", round: rounds[index++] };
  }, reviewArchitecture: async () => pass };
}
async function collect(provider: SystemDesignAgentProvider, turn = request, durableState = defaultSystemDesignDurableConversationState()) {
  const events: ReasonAIKnownEvent[] = [];
  let candidate: SystemDesignDurableConversationState | undefined;
  for await (const event of streamSystemDesignEvents(turn, new AbortController().signal, {
    provider, durableState, runId: crypto.randomUUID(), messageId: crypto.randomUUID(),
    onConversationState: (state) => { candidate = state; },
  })) events.push(event);
  return { events, candidate };
}
function completion(events: ReasonAIKnownEvent[]) { return events.find((event) => event.type === "text.final"); }

for (const [name, payload, diagnostic] of [
  ["canvas document", { summary: "Wrong", nodes: [], edges: [] }, { code: "WRONG_PROPOSAL_CONTRACT" }],
  ["envelope", { proposal }, { code: "WRONG_PROPOSAL_CONTRACT" }],
  ["extra top-level field", { ...proposal, review: pass }, { code: "WRONG_PROPOSAL_CONTRACT" }],
  ["non-array operations", { summary: "Wrong", operations: {} }, { code: "WRONG_PROPOSAL_CONTRACT" }],
  ["invalid target", { summary: "Wrong", operations: [{ op: "delete_node", nodeId: "missing" }] }, { code: "INVALID_OPERATION_REFERENCE", operationIndex: 0 }],
] as const) {
  test(`${name} is rejected and corrected using the actual validator diagnostic`, async () => {
    const received: SystemDesignAgentRoundInput[] = [];
    const provider = scripted([tool(payload, "rejected"), tool(proposal, "correction"), final()], received);
    let reviews = 0;
    provider.reviewArchitecture = async (input) => { reviews++; expect(input.proposal.operations).toHaveLength(2); return pass; };
    const { events, candidate } = await collect(provider);
    expect(received).toHaveLength(3);
    expect(received[1].proposalCorrection).toEqual(diagnostic);
    const feedback = received[1].agentMessages.find((message) => message.role === "tool" && message.tool_call_id === "rejected");
    expect(JSON.parse(feedback!.content!)).toEqual({ ok: false, diagnostic });
    expect(received[2].proposalCorrection).toBeUndefined();
    expect(events.filter((event) => event.type === "tool.failed")).toHaveLength(1);
    const artifacts = events.filter((event) => event.type === "artifact.proposal");
    expect(artifacts.length).toBeGreaterThan(0);
    for (const artifact of artifacts) expect(parseReasonAIProposal(artifact.data, request.context, "accumulated").operations).toHaveLength(2);
    expect(completion(events)).toMatchObject({ outcome: "awaiting_approval" });
    expect(events.filter((event) => event.type === "sources.ready").map((event) => event.type === "sources.ready" ? event.notice : "").join(" ").split(warning)).toHaveLength(2);
    expect(candidate?.pendingProposal?.proposal.review?.status).toBe("passed");
    expect(reviews).toBe(1);
  });
}

for (const streaming of [false, true]) {
  test(`${streaming ? "SSE" : "JSON"} provider uses a proposal-only correction round and emits the validation notice once`, async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.NEBIUS_API_KEY;
    const originalURL = process.env.REASONAI_BASE_URL;
    const bodies: Array<Record<string, unknown>> = [];
    const rounds = [
      tool({ type: "reliability", title: "Review", summary: "Visible API access boundary needs confirmation.", assumptions: [], nodes: [{ nodeId: "api" }], edges: [] }, "analysis", "show_architecture_analysis"),
      tool({ ...proposal, unexpected: "synthetic bad envelope" }, "invalid"), tool(proposal, "corrected"), final(),
    ];
    try {
      process.env.NEBIUS_API_KEY = "synthetic-provider-key";
      process.env.REASONAI_BASE_URL = "https://provider.test/v1";
      globalThis.fetch = async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        const round = rounds[bodies.length - 1];
        if (!round || round.kind === "escalate") throw new Error("Unexpected model call");
        const message = round.kind === "tools" ? { content: null, tool_calls: round.calls.map((call) => ({
          id: call.id, type: "function", function: { name: call.name, arguments: call.arguments },
        })) } : { content: round.result.text };
        const delta = round.kind === "tools" && "tool_calls" in message
          ? { ...message, tool_calls: message.tool_calls!.map((call) => ({ ...call, index: 0 })) } : message;
        const reason = round.kind === "tools" ? "tool_calls" : "stop";
        return streaming
          ? new Response(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } })
          : Response.json({ choices: [{ message, finish_reason: reason }] });
      };
      const { events, candidate } = await collect({ ...systemDesignAgentProvider, reviewArchitecture: async () => pass });
      expect(bodies).toHaveLength(4);
      // After one analysis, the explicit proposal task takes priority; a failed
      // batch then gets one correction, with no search or analysis detour.
      for (const body of bodies.slice(1, 3)) {
        expect(body.tool_choice).toEqual({ type: "function", function: { name: "propose_canvas_changes" } });
        expect((body.tools as Array<{ function: { name: string } }>).map((item) => item.function.name)).toEqual(["propose_canvas_changes"]);
      }
      expect(JSON.stringify(bodies[2].messages)).toContain("WRONG_PROPOSAL_CONTRACT");
      expect(JSON.stringify(bodies[2].messages)).toContain("only summary (string) and operations");
      const notices = events.filter((event) => event.type === "sources.ready").map((event) => event.type === "sources.ready" ? event.notice : "").join(" ");
      expect(notices).toBe(warning);
      expect(candidate?.pendingProposal?.proposal.review?.status).toBe("passed");
      expect(completion(events)).toMatchObject({ outcome: "awaiting_approval" });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = originalKey;
      if (originalURL === undefined) delete process.env.REASONAI_BASE_URL; else process.env.REASONAI_BASE_URL = originalURL;
    }
  });
}

test("a second rejected batch exhausts correction without replacing durable or working checkpoints", async () => {
  const pending = createPendingReasonAIProposal(proposal, request.context);
  const originalPending = structuredClone(pending);
  const received: SystemDesignAgentRoundInput[] = [];
  const provider = scripted([tool({ summary: "Retain gateway", operations: [] }, "invalid-1"), tool({ proposal }, "invalid-2")], received);
  const { events, candidate } = await collect(provider, request, { ...defaultSystemDesignDurableConversationState(), pendingProposal: pending });
  // A valid working batch is needed before recovery; the durable checkpoint
  // alone must not be presented as a newly generated proposal.
  expect(events.at(-1)).toMatchObject({ type: "run.failed", code: "INVALID_PROPOSAL" });
  expect(received).toHaveLength(2);
  expect(candidate).toBeUndefined();
  expect(pending).toEqual(originalPending);

  const workingCalls: SystemDesignAgentRoundInput[] = [];
  const working = await collect(scripted([tool(proposal, "valid"), tool({ proposal }, "invalid-1"), tool({ proposal }, "invalid-2")], workingCalls));
  expect(workingCalls).toHaveLength(3);
  expect(working.candidate?.pendingProposal?.version).toBe(1);
  const first = working.events.find((event) => event.type === "artifact.proposal");
  expect(first).toMatchObject({ proposalVersion: 1 });
  expect(working.candidate?.pendingProposal?.proposalId).toBe(first?.type === "artifact.proposal" ? first.proposalId : undefined);
  expect(working.candidate?.pendingProposal?.acceptedOperationIds).toEqual([]);
  expect(working.candidate?.pendingProposal?.proposal.review?.status).toBe("incomplete");
  expect(working.candidate?.pendingProposal?.proposal.operations).toHaveLength(2);
  const notices = working.events.filter((event) => event.type === "sources.ready").map((event) => event.type === "sources.ready" ? event.notice : "").join(" ");
  expect(notices.split(warning)).toHaveLength(2);
});

test("prose or an approval question cannot replace a rejected proposal's correction", async () => {
  for (const text of ["Here are drawing instructions.", "Would you like me to prepare the proposal?"]) {
    const received: SystemDesignAgentRoundInput[] = [];
    const { events } = await collect(scripted([tool({ nodes: [], edges: [] }, "invalid"), final(text)], received));
    expect(received).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "run.failed", code: "INVALID_PROPOSAL" });
    expect(events.some((event) => event.type === "run.completed" || event.type === "artifact.proposal" || event.type === "text.final")).toBe(false);
  }
});

test("correction uses the shared model budget and cannot make a call after exhaustion", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  const provider = scripted([tool({ proposal }, "invalid"), tool(proposal, "correction")], received);
  const events: ReasonAIKnownEvent[] = [];
  for await (const event of streamSystemDesignEvents(request, new AbortController().signal, {
    provider, durableState: defaultSystemDesignDurableConversationState(), budgets: { totalModelCalls: 1 },
  })) events.push(event);
  expect(received).toHaveLength(1);
  expect(events.at(-1)).toMatchObject({ type: "run.failed", code: "BUDGET_EXHAUSTED" });
  expect(events.some((event) => event.type === "artifact.proposal" || event.type === "run.completed")).toBe(false);
});

test("mixed review and edit clauses require proposals while explanations and current no-change instructions remain protected", () => {
  for (const message of [request.message, "Review this, then propose a gateway.", "Review the API and add a cache.", "Review the system.\nPlease draw the missing flows."]) {
    for (const mode of ["chat", "review", "fix", "eagle"] as const) expect(requiresReasonAIProposal({ mode, message }), message).toBe(true);
  }
  for (const message of ["Review why we add a cache.", "Review the API and explain how to add Redis.", "Review the system. Explain the proposed changes."]) {
    expect(requiresReasonAIProposal({ mode: "review", message }), message).toBe(false);
  }
  for (const message of ["Review only, then propose a gateway.", "Review and add a cache, but do not change anything.", "Review the canvas. No proposals."]) {
    expect(allowsReasonAIProposal({ mode: "review", message }), message).toBe(false);
    expect(requiresReasonAIProposal({ mode: "review", message }), message).toBe(false);
  }
});

test("mixed review requests cannot finish successfully after two prose-only responses", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  const { events, candidate } = await collect(scripted([final("Consider adding a gateway."), final("Draw the gateway yourself.")], received));
  expect(received).toHaveLength(2);
  expect(received.every((input) => input.requireProposal)).toBe(true);
  expect(events.at(-1)?.type).toBe("run.failed");
  expect(events.some((event) => event.type === "run.completed" || event.type === "text.final" || event.type === "artifact.proposal")).toBe(false);
  expect(candidate).toBeUndefined();
});

test("a necessary initial clarification has a distinct outcome and does not fabricate a proposal", async () => {
  const { events } = await collect(scripted([final("Which trust boundary should the new gateway enforce?")]));
  expect(completion(events)).toMatchObject({ outcome: "needs_clarification" });
  expect(events.some((event) => event.type === "artifact.proposal")).toBe(false);
});

test("contract-failure logs describe only the submitted argument shape, not clipboard data or arbitrary keys", async () => {
  const originalWarn = console.warn;
  const logs: unknown[][] = [];
  console.warn = (...args) => { logs.push(args); };
  try {
    const turn = { ...request, message: `${request.message}\nClipboard: recallstack/system-design-fragment PRIVATE_CLIPBOARD` };
    const call = { id: "invalid", name: "propose_canvas_changes", arguments: JSON.stringify({ summary: "PRIVATE_SUMMARY", operations: {}, PRIVATE_KEY: "PRIVATE_VALUE" }) };
    const result = await systemDesignToolExecutor.execute(call, { request: turn, signal: new AbortController().signal, searchEvidence: [], searchCount: 0 });
    expect(result).toMatchObject({ ok: false, code: "validation", diagnostic: { code: "WRONG_PROPOSAL_CONTRACT" } });
    expect(logs.find(([name]) => name === "reasonai.proposal.validation_failed")?.[1]).toMatchObject({ topLevelKeys: ["summary", "operations", "[unknown]"], summaryType: "string", operationsType: "object" });
    expect(JSON.stringify(logs)).not.toMatch(/PRIVATE_|system-design-fragment/);
    expect(() => parseReasonAIProposal({ type: "recallstack/system-design-fragment", nodes: [], edges: [] }, request.context)).toThrow();
  } finally { console.warn = originalWarn; }
});
