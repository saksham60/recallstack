import { expect, test } from "@playwright/test";
import type { ReasonAIRequest } from "../src/features/system-design/reasonai/contract";
import { systemDesignAgentProvider, type SystemDesignAgentProvider, type SystemDesignAgentRound, type SystemDesignAgentRoundInput } from "../src/features/system-design/reasonai/agent-provider";
import { streamSystemDesignEvents } from "../src/lib/reasonai/server/system-design-stream";
import { streamSystemDesignGraph } from "../src/lib/reasonai/server/langgraph/system-design/graph";
import { defaultSystemDesignDurableConversationState, parseSystemDesignDurableConversationState } from "../src/lib/reasonai/server/langgraph/system-design/state";
import { MAX_SYSTEM_DESIGN_TOOL_ROUNDS, systemDesignToolExecutor, type SystemDesignToolExecutor } from "../src/lib/reasonai/server/langgraph/system-design/tools";
import { MemoryReasonAIPersistenceRepository } from "../src/lib/reasonai/server/persistence/memory-repository";
import { prepareSystemDesignRun } from "../src/lib/reasonai/server/persistence/system-design-run";
import { isReasonAIDSAStreamingEnabled, isReasonAISystemDesignStreamingEnabled } from "../src/lib/config/server";
import type { ReasonAIResponse } from "../src/features/system-design/reasonai/contract";
import { parseReasonAISources } from "../src/features/system-design/reasonai/sources";
import { ReasonAISources } from "../src/features/system-design/reasonai/ReasonAISources";
import { allowsReasonAIProposal, parseReasonAIProposal } from "../src/features/system-design/reasonai/contract";
import { createPendingReasonAIProposal, fingerprintReasonAIContext, layoutReasonAIProposal, remainingReasonAIProposal } from "../src/features/system-design/reasonai/proposal-state";

const request: ReasonAIRequest = {
  mode: "chat",
  message: "Explain why Redis is useful between the API and database.",
  history: [],
  context: {
    diagramId: "diagram-1",
    title: "Checkout",
    requirements: [],
    scaleAssumptions: [],
    selectedNodeIds: [],
    selectedEdgeIds: [],
    nodes: [
      { id: "api", type: "service", label: "API", subtitle: "", description: "", technology: "Node.js", x: 0, y: 0 },
      { id: "db", type: "sql_database", label: "Database", subtitle: "", description: "", technology: "Postgres", x: 300, y: 0 },
    ],
    edges: [{ id: "api-db", type: "database_read", sourceNodeId: "api", targetNodeId: "db", label: "reads", protocol: "SQL" }],
  },
};

const originalFetch = globalThis.fetch;
const originalProviderEnv = {
  NEBIUS_API_KEY: process.env.NEBIUS_API_KEY,
  REASONAI_BASE_URL: process.env.REASONAI_BASE_URL,
  REASONAI_MODEL: process.env.REASONAI_MODEL,
  REASONAI_V2_MODE: process.env.REASONAI_V2_MODE,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalProviderEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function sse(frames: unknown[]): Response {
  return new Response(`${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function final(text = "Redis can absorb repeated reads and reduce database load."): SystemDesignAgentRound {
  return { kind: "final", result: { text } };
}

function tool(name: string, args: unknown, id = crypto.randomUUID()): SystemDesignAgentRound {
  const argumentsText = typeof args === "string" ? args : JSON.stringify(args);
  return {
    kind: "tools",
    calls: [{ id, name, arguments: argumentsText }],
    assistantMessage: { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: argumentsText } }] },
  };
}

function scripted(rounds: SystemDesignAgentRound[], received: SystemDesignAgentRoundInput[] = []): SystemDesignAgentProvider {
  let index = 0;
  return {
    async *streamRound(input) {
      received.push(structuredClone(input));
      const round = rounds[Math.min(index++, rounds.length - 1)];
      if (round.kind === "final") yield { type: "text.delta", delta: round.result.text.slice(0, 18) };
      yield { type: "round", round };
    },
  };
}

function execution(provider: SystemDesignAgentProvider, toolExecutor?: SystemDesignToolExecutor) {
  return {
    durableState: defaultSystemDesignDurableConversationState(),
    runId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    provider,
    toolExecutor,
  };
}

test("conversational requests offer proposals while current-turn no-change instructions veto them", () => {
  for (const message of ["## Task\nAdd Redis", "Architecture repair: add a CDN", "Now add a queue.", "Yes, go ahead", "Okay, fix that."]) {
    expect(allowsReasonAIProposal({ mode: "review", message })).toBe(true);
  }
  expect(allowsReasonAIProposal({ mode: "fix", message: "Just explain. Don't change anything." })).toBe(false);
  expect(allowsReasonAIProposal({ mode: "review", message: "Don't touch authentication, but add Redis." })).toBe(true);
});

test("a repeated denied proposal terminates without spending four tool rounds", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  let executions = 0;
  const denied: SystemDesignToolExecutor = { async execute(call) {
    executions++;
    return { ok: false, reason: "not_authorized", message: { role: "tool", tool_call_id: call.id, content: '{"ok":false,"error":"not_authorized"}' } };
  } };
  const events = [];
  for await (const event of streamSystemDesignEvents({ ...request, message: "Repair the architecture." }, new AbortController().signal, execution(scripted([
    tool("propose_canvas_changes", { summary: "Add Redis", operations: [{ op: "add_node", ref: "new:redis", type: "cache", label: "Redis", x: 10, y: 10 }] }),
    tool("propose_canvas_changes", { summary: "Add Redis", operations: [{ op: "add_node", ref: "new:redis", type: "cache", label: "Redis", x: 10, y: 10 }] }),
  ], received), denied))) events.push(event);
  expect(executions).toBe(1);
  expect(received.length).toBeLessThanOrEqual(2);
  expect(events.find((event) => event.type === "text.final")).toMatchObject({ text: expect.stringContaining("blocked") });
  expect(events.at(-1)?.type).toBe("run.completed");
});

test("proposal batches accumulate and later batches resolve earlier pending nodes", async () => {
  const first = { summary: "Gateway and cache", operations: [
    { op: "add_node", ref: "new:gateway", type: "service", label: "Gateway", x: 100, y: 100 },
    { op: "add_node", ref: "new:redis", type: "cache", label: "Redis", x: 350, y: 100 },
  ] };
  const second = { summary: "Connect the gateway to the cache", operations: [
    { op: "add_edge", type: "http_request", sourceNodeId: "new:gateway", targetNodeId: "new:redis" },
  ] };
  const events = [];
  let durable;
  for await (const event of streamSystemDesignGraph({ ...request, message: "Build a gateway and cache." }, {
    ...execution(scripted([tool("propose_canvas_changes", first), tool("propose_canvas_changes", second), final("The connected proposal is ready to review.")])),
    onConversationState: (state) => { durable = state; },
  })) events.push(event);
  const proposals = events.filter((event) => event.type === "proposal");
  expect(proposals).toHaveLength(2);
  expect(proposals.at(-1)).toMatchObject({ proposal: { operations: [{ op: "add_node" }, { op: "add_node" }, { op: "add_edge", sourceNodeId: "new:gateway", targetNodeId: "new:redis" }] } });
  expect(durable).toMatchObject({ pendingProposal: { version: 2, status: "pending", operationIds: [expect.any(String), expect.any(String), expect.any(String)] } });
});

test("proposal versions retain IDs for unchanged operations and content fingerprints detect changes", () => {
  const proposal = { summary: "Gateway", operations: [{ op: "add_node" as const, ref: "new:gateway", type: "service" as const, label: "Gateway", x: 100, y: 100 }] };
  const first = createPendingReasonAIProposal(proposal, request.context);
  const second = createPendingReasonAIProposal({ ...proposal, summary: "Gateway revised" }, request.context, first);
  expect(second.proposalId).toBe(first.proposalId);
  expect(second.version).toBe(2);
  expect(second.operationIds).toEqual(first.operationIds);
  expect(fingerprintReasonAIContext({ ...request.context, nodes: request.context.nodes.map((node) => node.id === "api" ? { ...node, x: node.x + 1 } : node) })).not.toBe(first.baseFingerprint);
});

test("proposal discard is durable, idempotent, and rejects outdated versions", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const user = crypto.randomUUID();
  const conversation = await repository.createConversation(user, { surface: "system_design", contextId: request.context.diagramId });
  const acquired = await repository.acquireRun(user, conversation.id, crypto.randomUUID());
  if (acquired.kind !== "acquired") throw new Error("Expected acquired run");
  const proposal = createPendingReasonAIProposal({ summary: "Cache", operations: [{ op: "add_node", ref: "new:cache", type: "cache", label: "Cache", x: 100, y: 100 }] }, request.context);
  await repository.finalizeRun(user, conversation.id, acquired.run.id, { status: "completed", lastSeq: 1, nextConversationState: { ...defaultSystemDesignDurableConversationState(), pendingProposal: proposal } });
  const before = await repository.getConversationState(user, conversation.id);
  const input = { eventId: crypto.randomUUID(), proposalId: proposal.proposalId, version: proposal.version, expectedStateVersion: before!.stateVersion, action: "discard" as const };
  const first = await repository.transitionProposal(user, conversation.id, input);
  expect(first).toMatchObject({ status: "discarded", duplicate: false });
  const retried = await repository.transitionProposal(user, conversation.id, { ...input, expectedStateVersion: first!.stateVersion });
  expect(retried).toMatchObject({ status: "discarded", duplicate: true });
  expect((await repository.getConversationState(user, conversation.id))?.stateVersion).toBe(first?.stateVersion);
  await expect(repository.transitionProposal(user, conversation.id, { ...input, eventId: crypto.randomUUID(), expectedStateVersion: first!.stateVersion })).rejects.toThrow(/Stale/);
});

test("partial acceptance rebases remaining references onto the verified local diagram", () => {
  const proposal = createPendingReasonAIProposal({ summary: "Cache path", operations: [
    { op: "add_node", ref: "new:redis", type: "cache", label: "Redis", x: 600, y: 100 },
    { op: "add_edge", type: "database_read", sourceNodeId: "api", targetNodeId: "new:redis" },
  ] }, request.context);
  const actualId = "node_00000000-0000-4000-8000-000000000001";
  const current = { ...request.context, nodes: [...request.context.nodes, { id: actualId, type: "cache" as const, label: "Redis", subtitle: "", description: "", technology: "", x: 600, y: 100 }] };
  proposal.acceptedOperationIds = [proposal.operationIds[0]];
  proposal.refMappings["new:redis"] = actualId;
  proposal.lastReportedFingerprint = fingerprintReasonAIContext(current);
  proposal.status = "partially_accepted";
  const remaining = remainingReasonAIProposal(proposal);
  expect(remaining.operations).toEqual([{ op: "add_edge", type: "database_read", sourceNodeId: "api", targetNodeId: actualId }]);
  expect(parseReasonAIProposal(remaining, current, "accumulated").operations).toHaveLength(1);
  const revised = createPendingReasonAIProposal(remaining, current, proposal);
  expect(revised.version).toBe(2);
  expect(revised.baseFingerprint).toBe(proposal.lastReportedFingerprint);
  expect(revised.operationIds).toEqual([proposal.operationIds[1]]);
  expect(revised.acceptedOperationIds).toEqual([]);
});

test("a lost Accept All acknowledgement retries once without advancing proposal state twice", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const user = crypto.randomUUID();
  const conversation = await repository.createConversation(user, { surface: "system_design", contextId: request.context.diagramId });
  const acquired = await repository.acquireRun(user, conversation.id, crypto.randomUUID());
  if (acquired.kind !== "acquired") throw new Error("Expected acquired run");
  const proposal = createPendingReasonAIProposal({ summary: "Cache", operations: [{ op: "add_node", ref: "new:cache", type: "cache", label: "Cache", x: 100, y: 100 }] }, request.context);
  await repository.finalizeRun(user, conversation.id, acquired.run.id, { status: "completed", lastSeq: 1, nextConversationState: { ...defaultSystemDesignDurableConversationState(), pendingProposal: proposal } });
  const before = await repository.getConversationState(user, conversation.id);
  const payload = { eventId: crypto.randomUUID(), proposalId: proposal.proposalId, version: proposal.version, expectedStateVersion: before!.stateVersion, action: "accept_all" as const, postFingerprint: "fnv64:0000000000000001" };
  const first = await repository.transitionProposal(user, conversation.id, payload);
  const retried = await repository.transitionProposal(user, conversation.id, { ...payload, expectedStateVersion: first!.stateVersion });
  expect(first).toMatchObject({ status: "accepted", duplicate: false });
  expect(retried).toMatchObject({ status: "accepted", duplicate: true, stateVersion: first?.stateVersion });
  expect((await repository.getConversationState(user, conversation.id))?.stateVersion).toBe(first?.stateVersion);
});

test("model batches stop at 50, accumulated proposals accept 150 and deterministic layout avoids overlap", () => {
  const operations = Array.from({ length: 150 }, (_, index) => ({ op: "add_node" as const, ref: `new:service_${index}`, type: "service" as const, label: `Service ${index}`, x: 0, y: 0 }));
  expect(() => parseReasonAIProposal({ summary: "Services", operations: operations.slice(0, 51) }, request.context)).toThrow();
  const accumulated = parseReasonAIProposal({ summary: "Services", operations }, request.context, "accumulated");
  const laidOut = layoutReasonAIProposal(accumulated, request.context);
  expect(parseReasonAIProposal(laidOut, request.context, "acceptance").operations).toHaveLength(150);
  const nodes = laidOut.operations.filter((operation) => operation.op === "add_node");
  expect(new Set(nodes.map((node) => `${node.x}:${node.y}`)).size).toBe(150);
  expect(layoutReasonAIProposal(accumulated, request.context)).toEqual(laidOut);
  expect(() => parseReasonAIProposal({ summary: "Too many", operations: [...operations, { ...operations[0], ref: "new:extra" }] }, request.context, "accumulated")).toThrow();
});

test("pending proposal survives a no-change turn and accepts a later delta revision", async () => {
  const initial = createPendingReasonAIProposal({ summary: "Gateway", operations: [{ op: "add_node", ref: "new:gateway", type: "service", label: "Gateway", x: 100, y: 100 }] }, request.context);
  const durableState = parseSystemDesignDurableConversationState({ pendingProposal: initial });
  let explained;
  for await (const event of streamSystemDesignGraph({ ...request, message: "Explain the gateway flow. Don't change anything." }, {
    ...execution(scripted([final("The gateway routes requests to the API.")])), durableState,
    onConversationState: (state) => { explained = state; },
  })) { void event; }
  expect(explained).toMatchObject({ pendingProposal: { proposalId: initial.proposalId, version: 1 } });
  let revised;
  for await (const event of streamSystemDesignGraph({ ...request, message: "Now add a queue." }, {
    ...execution(scripted([tool("propose_canvas_changes", { summary: "Add queue", operations: [{ op: "add_node", ref: "new:queue", type: "message_queue", label: "Queue", x: 0, y: 0 }, { op: "add_edge", type: "async_message", sourceNodeId: "new:gateway", targetNodeId: "new:queue" }] }), final("The queue is ready to review.")])),
    durableState: explained!, onConversationState: (state) => { revised = state; },
  })) { void event; }
  expect(revised).toMatchObject({ pendingProposal: { proposalId: initial.proposalId, version: 2, operationIds: [initial.operationIds[0], expect.any(String), expect.any(String)] } });
});

for (const streaming of [false, true]) {
  test(`${streaming ? "streaming" : "non-streaming"} provider rejects an unoffered tool and uses one no-tool correction`, async () => {
    process.env.NEBIUS_API_KEY = "system-design-agent-key";
    process.env.REASONAI_BASE_URL = "https://provider.test/v1";
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) {
        const call = { id: "unoffered-proposal", type: "function", function: { name: "propose_canvas_changes", arguments: JSON.stringify({ summary: "Delete DB", operations: [{ op: "delete_node", nodeId: "db" }] }) } };
        return streaming
          ? sse([{ choices: [{ delta: { tool_calls: [{ index: 0, ...call }] }, finish_reason: "tool_calls" }] }])
          : Response.json({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [call] } }] });
      }
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: "The database is a visible dependency." } }] });
    };
    const events = [];
    for await (const event of streamSystemDesignEvents({ ...request, message: "Analyze only. No canvas changes." }, new AbortController().signal, execution(systemDesignAgentProvider))) events.push(event);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].tool_choice).toBe("none");
    expect(events.some((event) => event.type === "tool.started" || event.type === "artifact.proposal")).toBe(false);
    expect(events.find((event) => event.type === "text.final")).toMatchObject({ text: "The database is a visible dependency." });
  });
}

for (const streaming of [false, true]) {
  test(`${streaming ? "streaming" : "non-streaming"} preamble is emitted once before a proposal tool`, async () => {
    process.env.NEBIUS_API_KEY = "system-design-agent-key";
    process.env.REASONAI_BASE_URL = "https://provider.test/v1";
    let calls = 0;
    const preamble = "I'll add a gateway and connect it to the API.";
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) {
        const toolCall = { id: "gateway-proposal", type: "function", function: { name: "propose_canvas_changes", arguments: JSON.stringify({ summary: "Gateway", operations: [{ op: "add_node", ref: "new:gateway", type: "service", label: "Gateway", x: 100, y: 100 }, { op: "add_edge", type: "http_request", sourceNodeId: "new:gateway", targetNodeId: "api" }] }) } };
        return streaming
          ? sse([{ choices: [{ delta: { content: preamble }, finish_reason: null }] }, { choices: [{ delta: { tool_calls: [{ index: 0, ...toolCall }] }, finish_reason: "tool_calls" }] }])
          : Response.json({ choices: [{ finish_reason: "tool_calls", message: { content: preamble, tool_calls: [toolCall] } }] });
      }
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: "The proposal is ready to review." } }] });
    };
    const events = [];
    for await (const event of streamSystemDesignEvents({ ...request, message: "Draw a gateway." }, new AbortController().signal, execution(systemDesignAgentProvider))) events.push(event);
    expect(events.filter((event) => event.type === "text.delta").map((event) => event.delta).join("")).toBe(`${preamble}The proposal is ready to review.`);
    expect(events.findIndex((event) => event.type === "text.delta")).toBeLessThan(events.findIndex((event) => event.type === "tool.started"));
    expect(events.some((event) => event.type === "artifact.proposal")).toBe(true);
  });
}

test("normal System Design chat takes the no-tool fast path", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  const events = [];
  for await (const event of streamSystemDesignEvents(request, new AbortController().signal, execution(scripted([final()], received)))) events.push(event);
  expect(received).toHaveLength(1);
  expect(events.map((event) => event.type)).toEqual(["run.started", "text.delta", "text.final", "run.completed"]);
  expect(events.some((event) => event.type.startsWith("tool."))).toBe(false);
  expect(received[0]).toMatchObject({ modelTier: "super", canEscalate: true });
  expect(events.find((event) => event.type === "text.final")).toMatchObject({ model: { preference: "auto", modelsUsed: ["super"], finalModel: "super", escalated: false } });
});

test("manual tiers resolve exact server model IDs and never offer escalation", async () => {
  process.env.NEBIUS_API_KEY = "system-design-agent-key";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] });
  };
  for (const [modelPreference, id] of [
    ["lightning", "nvidia/Nemotron-3_5-Lightning"],
    ["super", "nvidia/nemotron-3-super-120b-a12b"],
    ["ultra", "nvidia/Nemotron-3-Ultra-550b-a55b"],
  ] as const) {
    const received: SystemDesignAgentRoundInput[] = [];
    const events = [];
    for await (const event of streamSystemDesignEvents({ ...request, modelPreference }, new AbortController().signal, execution({
      async *streamRound(input, signal) {
        received.push(structuredClone(input));
        yield* systemDesignAgentProvider.streamRound(input, signal);
      },
    }))) events.push(event);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ modelTier: modelPreference, canEscalate: false });
    expect(events.find((event) => event.type === "text.final")).toMatchObject({ model: { preference: modelPreference, modelsUsed: [modelPreference], finalModel: modelPreference, escalated: false } });
    const body = bodies.at(-1)!;
    expect(body.model).toBe(id);
    expect((body.tools as Array<{ function: { name: string } }>).map((tool) => tool.function.name)).not.toContain("escalate_reasoning");
  }
});

test("Auto does not escalate after search execution", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  let searches = 0;
  const provider = scripted([
    tool("search_web", { query: "realtime chat architecture" }, "search-1"),
    { kind: "escalate" },
    final("A regional WebSocket gateway can fan out through durable workers [1]."),
  ], received);
  const executor: SystemDesignToolExecutor = { async execute(call) {
    searches++;
    const evidence = [{ id: 1, title: "Realtime chat architecture", url: "https://docs.example.com/chat", content: "Regional gateways and fanout." }];
    return { ok: true, searchEvidence: evidence, retrievalStatus: "used", message: { role: "tool", tool_call_id: call.id, content: JSON.stringify({ evidence }) } };
  } };
  const events = [];
  for await (const event of streamSystemDesignEvents(request, new AbortController().signal, execution(provider, executor))) events.push(event);
  expect(received.map((input) => input.modelTier)).toEqual(["super", "super"]);
  expect(received.map((input) => input.canEscalate)).toEqual([true, false]);
  expect(received[1].searchCount).toBe(1);
  expect(received[1].searchEvidence).toHaveLength(1);
  expect(received[1].agentMessages).toHaveLength(2);
  expect(searches).toBe(1);
  expect(events.at(-1)?.type).toBe("run.failed");
  expect(events.some((event) => event.type === "tool.started" && event.toolName === "escalate_reasoning")).toBe(false);
});

test("recent realtime-chat conversation takes priority over an older Rate Limiter canvas for draw it", async () => {
  process.env.NEBIUS_API_KEY = "system-design-agent-key";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length === 1
      ? Response.json({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "chat-proposal", type: "function", function: { name: "propose_canvas_changes", arguments: JSON.stringify({ summary: "Add a realtime chat gateway.", operations: [{ op: "add_node", ref: "new:chat-gateway", type: "service", label: "WebSocket Gateway", x: 100, y: 100 }] }) } }] } }] })
      : Response.json({ choices: [{ finish_reason: "stop", message: { content: "A WebSocket gateway is ready as a suggestion." } }] });
  };
  const durableState = parseSystemDesignDurableConversationState({ recentTurns: [{
    mode: "chat",
    user: "Research a production-grade realtime chat architecture for 1M concurrent users.",
    assistant: "Use regional WebSocket gateways, a distributed event log, and durable fanout workers.",
  }] });
  const events = [];
  for await (const event of streamSystemDesignEvents(
    { ...request, message: "now next please draw it", context: { ...request.context, title: "Distributed Rate Limiter" } },
    new AbortController().signal,
    { ...execution(systemDesignAgentProvider), durableState },
  )) events.push(event);
  const first = bodies[0];
  expect((first.tools as Array<{ function: { name: string } }>).map((tool) => tool.function.name)).toContain("propose_canvas_changes");
  expect(first.tool_choice).toBe("auto");
  expect(JSON.stringify(first.messages)).toContain("regional WebSocket gateways");
  expect(events.find((event) => event.type === "artifact.proposal")).toMatchObject({ data: { operations: [expect.objectContaining({ label: "WebSocket Gateway" })] } });
  expect(events.some((event) => event.type === "run.failed")).toBe(false);
});

test("explicit draw retries a text-only provider response and emits only a validated proposal", async () => {
  process.env.NEBIUS_API_KEY = "system-design-agent-key";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (bodies.length === 1) return sse([
      { choices: [{ delta: { content: "Draw a gateway yourself, then connect it to the database." }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]);
    if (bodies.length === 2) return sse([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "draw-proposal", type: "function", function: { name: "propose_canvas_changes", arguments: JSON.stringify({ summary: "Add a gateway to the architecture.", operations: [{ op: "add_node", ref: "new:gateway", type: "service", label: "Gateway", x: 100, y: 100 }, { op: "add_edge", type: "http_request", sourceNodeId: "new:gateway", targetNodeId: "api" }] }) } }] }, finish_reason: "tool_calls" }] },
    ]);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "The gateway and connection are ready to review." } }] });
  };
  const events = [];
  for await (const event of streamSystemDesignEvents({ ...request, message: "draw it" }, new AbortController().signal, execution(systemDesignAgentProvider))) events.push(event);
  expect(bodies).toHaveLength(3);
  for (const body of bodies.slice(0, 2)) {
    expect((body.tools as Array<{ function: { name: string } }>).map((tool) => tool.function.name)).toContain("propose_canvas_changes");
    expect(body.tool_choice).toBe("auto");
  }
  expect(JSON.stringify(events)).not.toContain("Draw a gateway yourself");
  expect(events.find((event) => event.type === "artifact.proposal")).toMatchObject({ data: { operations: [{ op: "add_node" }, { op: "add_edge" }] } });
  expect(events.at(-1)?.type).toBe("run.completed");
});

test("explicit draw cannot complete as text when the provider ignores forced tool choice twice", async () => {
  process.env.NEBIUS_API_KEY = "system-design-agent-key";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: "Manually draw these nodes." } }] });
  };
  const events = [];
  for await (const event of streamSystemDesignEvents({ ...request, message: "draw it" }, new AbortController().signal, execution(systemDesignAgentProvider))) events.push(event);
  expect(calls).toBe(2);
  expect(events.some((event) => event.type === "text.delta" || event.type === "text.final" || event.type === "artifact.proposal")).toBe(false);
  expect(events.at(-1)?.type).toBe("run.failed");
});

test("Ultra cannot escalate and visible Super text cannot produce a double answer", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  const invalidEvents = [];
  for await (const event of streamSystemDesignEvents(request, new AbortController().signal, execution(scripted([{ kind: "escalate" }, { kind: "escalate" }], received)))) invalidEvents.push(event);
  expect(received.map((input) => input.modelTier)).toEqual(["super", "ultra"]);
  expect(invalidEvents.at(-1)?.type).toBe("run.failed");

  const visibleRounds: SystemDesignAgentRoundInput[] = [];
  const visibleProvider: SystemDesignAgentProvider = { async *streamRound(input) {
    visibleRounds.push(structuredClone(input));
    yield { type: "text.delta", delta: "Super answer stands." };
    yield { type: "round", round: { kind: "escalate" } };
  } };
  const visibleEvents = [];
  for await (const event of streamSystemDesignEvents(request, new AbortController().signal, execution(visibleProvider))) visibleEvents.push(event);
  expect(visibleRounds).toHaveLength(1);
  expect(visibleEvents.find((event) => event.type === "text.final")).toMatchObject({ text: "Super answer stands.", model: { finalModel: "super", escalated: false } });
});

test("tool cap prevents post-execution escalation", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  const rounds = Array.from({ length: MAX_SYSTEM_DESIGN_TOOL_ROUNDS }, (_, index) => tool("search_web", { query: `reference ${index}` }, `search-${index}`));
  const executor: SystemDesignToolExecutor = { async execute(call) { return { ok: true, retrievalStatus: "empty", searchEvidence: [], message: { role: "tool", tool_call_id: call.id, content: "{}" } }; } };
  const events = [];
  for await (const event of streamSystemDesignEvents(request, new AbortController().signal, execution(scripted([...rounds, { kind: "escalate" }, final("Ultra completes after the tool cap.")], received), executor))) events.push(event);
  expect(received).toHaveLength(MAX_SYSTEM_DESIGN_TOOL_ROUNDS + 1);
  expect(received[MAX_SYSTEM_DESIGN_TOOL_ROUNDS]).toMatchObject({ modelTier: "super", allowTools: false, canEscalate: false });
  expect(events.filter((event) => event.type === "tool.started")).toHaveLength(MAX_SYSTEM_DESIGN_TOOL_ROUNDS);
  expect(events.at(-1)?.type).toBe("run.failed");
});

test("streamed Super text followed by escalation stands as one Super answer", async () => {
  process.env.NEBIUS_API_KEY = "system-design-agent-key";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return sse([
      { choices: [{ delta: { content: "Super answer." }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "escalate-1", type: "function", function: { name: "escalate_reasoning", arguments: '{"reason":"complex_synthesis"}' } }] }, finish_reason: "tool_calls" }] },
    ]);
  };
  const events = [];
  for await (const event of streamSystemDesignEvents(request, new AbortController().signal, execution(systemDesignAgentProvider))) events.push(event);
  expect(calls).toBe(1);
  expect(events.find((event) => event.type === "text.final")).toMatchObject({ text: "Super answer.", model: { finalModel: "super", escalated: false } });
  expect(events.some((event) => event.type === "run.failed")).toBe(false);
});

test("the single V2 mode flag independently enables DSA, System Design, or both", () => {
  for (const [mode, dsa, systemDesign] of [
    ["off", false, false],
    ["dsa", true, false],
    ["system_design", false, true],
    ["all", true, true],
  ] as const) {
    process.env.REASONAI_V2_MODE = mode;
    expect(isReasonAIDSAStreamingEnabled()).toBe(dsa);
    expect(isReasonAISystemDesignStreamingEnabled()).toBe(systemDesign);
  }
});

test("model-selected search loops through the agent and emits bounded evidence", async () => {
  const executor: SystemDesignToolExecutor = {
    async execute(call) {
      const evidence = [{ id: 1, title: "AWS limits", url: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html", content: "The service documents current limits." }];
      return {
        ok: true,
        searchEvidence: evidence,
        retrievalStatus: "used",
        message: { role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: true, evidence }) },
      };
    },
  };
  const events = [];
  for await (const event of streamSystemDesignEvents(
    { ...request, message: "What are the current AWS Lambda execution duration limits?" },
    new AbortController().signal,
    execution(scripted([tool("search_web", { query: "AWS Lambda execution duration limit" }, "search-1"), final("AWS documents the current limit [1].")]), executor),
  )) events.push(event);
  expect(events.map((event) => event.type).filter((type) => type !== "text.delta")).toEqual([
    "run.started", "tool.started", "sources.ready", "tool.completed", "text.final", "run.completed",
  ]);
  expect(events.find((event) => event.type === "tool.started")).toMatchObject({ toolCallId: "search-1", toolName: "search_web" });
});

test("Nemotron search_web fragmented SSE reaches Tavily, returns to Nemotron, and produces cited sources", async () => {
  process.env.NEBIUS_API_KEY = "system-design-agent-key";
  process.env.TAVILY_API_KEY = "tavily-test-key";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  process.env.REASONAI_MODEL = "agent-model";
  const providerBodies: Array<Record<string, unknown>> = [];
  const tavilyBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) === "https://api.tavily.com/search") {
      tavilyBodies.push(JSON.parse(String(init?.body)));
      return Response.json({ results: [{
        title: "AWS Lambda quotas",
        url: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html",
        content: "Function timeout: 900 seconds.",
      }] });
    }
    providerBodies.push(JSON.parse(String(init?.body)));
    if (providerBodies.length === 1) return sse([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_", type: "function", function: { name: "search_", arguments: "{\"query\":\"AWS Lambda " } }] }, finish_reason: null }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "123", function: { name: "web", arguments: "timeout limit\"}" } }] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ]);
    return sse([{ choices: [{ delta: { content: "AWS Lambda functions can run for a maximum of 15 minutes. [1]" }, finish_reason: "stop" }] }]);
  };

  const events = [];
  let finalResult: ReasonAIResponse | undefined;
  for await (const event of streamSystemDesignEvents(
    { ...request, message: "Search the web for the current AWS Lambda timeout limit" },
    new AbortController().signal,
    { ...execution(systemDesignAgentProvider), onFinalResult: (result) => { finalResult = result; } },
  )) events.push(event);

  expect((providerBodies[0].tools as Array<{ function: { name: string } }>).map((item) => item.function.name)).toContain("search_web");
  expect(providerBodies[0].model).toBe("nvidia/nemotron-3-super-120b-a12b");
  expect(tavilyBodies).toEqual([expect.objectContaining({ query: "AWS Lambda timeout limit" })]);
  expect(providerBodies).toHaveLength(2);
  expect(JSON.stringify(providerBodies[1])).toContain("Function timeout: 900 seconds.");
  expect(JSON.stringify(providerBodies[1])).toContain("https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html");
  expect(finalResult).toEqual({
    text: "AWS Lambda functions can run for a maximum of 15 minutes. [1]",
    outcome: "completed",
    sources: [{ id: 1, title: "AWS Lambda quotas", url: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html" }],
    model: { preference: "auto", modelsUsed: ["super"], finalModel: "super", escalated: false },
  });
  expect(events.map((event) => event.type).filter((type) => type !== "text.delta")).toEqual([
    "run.started", "tool.started", "sources.ready", "tool.completed", "text.final", "run.completed",
  ]);
});

test("System Design accepts a bounded JSON provider tool call fallback", async () => {
  process.env.NEBIUS_API_KEY = "system-design-agent-key";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  process.env.REASONAI_MODEL = "agent-model";
  const calls: string[] = [];
  globalThis.fetch = async () => Response.json({ choices: [{
    message: { content: null, tool_calls: [{ id: "call_search_1", type: "function", function: { name: "search_web", arguments: "{\"query\":\"AWS Lambda timeout limit\"}" } }] },
    finish_reason: "tool_calls",
  }] });
  const provider = systemDesignAgentProvider.streamRound({
    request, modelTier: "super", canEscalate: true, history: [], agentMessages: [], searchEvidence: [], searchCount: 0, allowTools: true,
  });
  for await (const event of provider) if (event.type === "round" && event.round.kind === "tools") calls.push(event.round.calls[0].arguments);
  expect(calls).toEqual(["{\"query\":\"AWS Lambda timeout limit\"}"]);
});

test("unreturned citations are removed and no Tavily evidence produces no sources", async () => {
  process.env.NEBIUS_API_KEY = "system-design-agent-key";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  process.env.REASONAI_MODEL = "agent-model";
  let providerRound = 0;
  globalThis.fetch = async () => providerRound++ === 0
    ? sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: "empty-search", type: "function", function: { name: "search_web", arguments: '{"query":"AWS Lambda timeout limit"}' } }] }, finish_reason: "tool_calls" }] }])
    : sse([{ choices: [{ delta: { content: "No verified result is available. [1]" }, finish_reason: "stop" }] }]);
  const executor: SystemDesignToolExecutor = { async execute(call) { return { ok: true, retrievalStatus: "empty", searchEvidence: [], message: { role: "tool", tool_call_id: call.id, content: '{"ok":true,"evidence":[]}' } }; } };
  let result: ReasonAIResponse | undefined;
  for await (const _event of streamSystemDesignEvents(request, new AbortController().signal, { ...execution(systemDesignAgentProvider, executor), onFinalResult: (value) => { result = value; } })) void _event;
  expect(providerRound).toBe(2);
  expect(result?.text).not.toContain("[1]");
  expect(result?.sources ?? []).toEqual([]);
});

test("source numbering remains deterministic and unsafe source links are rejected", () => {
  expect(parseReasonAISources([
    { id: 1, title: "First", url: "https://docs.example.com/one" },
    { id: 2, title: "Second", url: "https://docs.example.com/two" },
    { id: 3, title: "Unsafe", url: "http://docs.example.com/three" },
  ])).toEqual([
    { id: 1, title: "First", url: "https://docs.example.com/one" },
    { id: 2, title: "Second", url: "https://docs.example.com/two" },
  ]);
});

test("two Tavily citations map to their validated sources without reordering", async () => {
  process.env.NEBIUS_API_KEY = "system-design-agent-key";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  process.env.REASONAI_MODEL = "agent-model";
  globalThis.fetch = async () => sse([{ choices: [{ delta: { content: "The first limit is documented [1], and the second is documented separately [2]." }, finish_reason: "stop" }] }]);
  const evidence = [
    { id: 1, title: "First source", url: "https://docs.example.com/first", content: "First fact." },
    { id: 2, title: "Second source", url: "https://docs.example.com/second", content: "Second fact." },
  ];
  let result: ReasonAIResponse | undefined;
  for await (const event of systemDesignAgentProvider.streamRound({ request, modelTier: "super", canEscalate: true, history: [], agentMessages: [], searchEvidence: evidence, searchCount: 1, allowTools: false })) {
    if (event.type === "round" && event.round.kind === "final") result = event.round.result;
  }
  expect(result?.sources).toEqual([
    { id: 1, title: "First source", url: "https://docs.example.com/first" },
    { id: 2, title: "Second source", url: "https://docs.example.com/second" },
  ]);
});

test("the source-card UI renders server titles, citation numbers, and only safe HTTPS links", () => {
  const markup = JSON.stringify(ReasonAISources({ sources: [
    { id: 1, title: "AWS Lambda quotas", url: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html" },
    { id: 2, title: "Unsafe", url: "javascript:alert(1)" },
  ] }));
  expect(markup).toContain('"children":["[",1,"] "');
  expect(markup).toContain("AWS Lambda quotas");
  expect(markup).toContain('"href":"https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html"');
  expect(markup).not.toContain("javascript:");
  expect(markup).not.toContain("Unsafe");
});

test("Fix mode emits only a validated reviewable proposal artifact", async () => {
  const proposal = {
    summary: "Add a cache before database reads.",
    operations: [
      { op: "add_node", ref: "new:redis", type: "cache", label: "Redis", x: 150, y: 100 },
      { op: "add_edge", type: "database_read", sourceNodeId: "api", targetNodeId: "new:redis", label: "cached reads", protocol: "RESP" },
    ],
  };
  const before = structuredClone(request.context);
  const events = [];
  for await (const event of streamSystemDesignEvents(
    { ...request, mode: "fix", message: "Add a cache in front of the database." },
    new AbortController().signal,
    execution(scripted([tool("propose_canvas_changes", proposal, "proposal-1"), final("I prepared a minimal cache suggestion for review.")])),
  )) events.push(event);
  expect(events.map((event) => event.type)).toContain("artifact.proposal");
  expect(events.find((event) => event.type === "artifact.proposal")).toMatchObject({ data: { summary: proposal.summary } });
  expect(events.find((event) => event.type === "text.final")).toMatchObject({ outcome: "awaiting_approval" });
  expect(request.context).toEqual(before);
});

test("architecture analysis emits a validated temporary visual", async () => {
  const visualization = {
    type: "reliability",
    title: "Single database dependency",
    summary: "The API has one visible database dependency.",
    assumptions: ["No replica is shown."],
    nodes: [{ nodeId: "db", severity: "warning", reason: "Only one database is visible." }],
    edges: [{ edgeId: "api-db", severity: "warning", reason: "All visible reads use this path." }],
  };
  const events = [];
  for await (const event of streamSystemDesignEvents(
    { ...request, mode: "review", message: "Review this architecture for single points of failure." },
    new AbortController().signal,
    execution(scripted([tool("show_architecture_analysis", visualization, "analysis-1"), final("The database is the main visible dependency.")])),
  )) events.push(event);
  expect(events.map((event) => event.type)).toContain("visual.ready");
  expect(events.find((event) => event.type === "visual.ready")).toMatchObject({ data: { type: "reliability" } });
});

test("read-only proposal mismatch terminates with a blocked outcome", async () => {
  const readOnly = { ...request, mode: "review" as const, message: "Review only, do not change anything." };
  const events = [];
  for await (const event of streamSystemDesignEvents(
    readOnly,
    new AbortController().signal,
    execution(scripted([
      tool("propose_canvas_changes", { summary: "Delete database", operations: [{ op: "delete_node", nodeId: "db" }] }, "unauthorized-1"),
      final("The visible database is a dependency worth reviewing; I made no canvas changes."),
    ])),
  )) events.push(event);
  expect(events.map((event) => event.type)).toContain("tool.failed");
  expect(events.some((event) => event.type === "artifact.proposal")).toBe(false);
  expect(events.some((event) => event.type === "run.failed")).toBe(false);
  expect(events.find((event) => event.type === "text.final")).toMatchObject({ text: expect.stringContaining("blocked"), outcome: "blocked" });
  expect(events.at(-1)?.type).toBe("run.completed");
});

test("an actual provider contract mismatch receives one correction without execution", async () => {
  process.env.NEBIUS_API_KEY = "system-design-agent-key";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  process.env.REASONAI_MODEL = "agent-model";
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    if (bodies.length === 1) return sse([{ choices: [{
      delta: { tool_calls: [{ index: 0, id: "unexpected-proposal", type: "function", function: { name: "propose_canvas_changes", arguments: JSON.stringify({ summary: "Delete DB", operations: [{ op: "delete_node", nodeId: "db" }] }) } }] },
      finish_reason: "tool_calls",
    }] }]);
    return sse([{ choices: [{ delta: { content: "The database is a visible dependency. I made no canvas changes." }, finish_reason: "stop" }] }]);
  };
  const events = [];
  for await (const event of streamSystemDesignEvents(
    { ...request, mode: "review", message: "Analysis only. Do not modify the canvas." },
    new AbortController().signal,
    execution(systemDesignAgentProvider),
  )) events.push(event);
  expect((bodies[0].tools as Array<{ function: { name: string } }>).map((item) => item.function.name)).toEqual(["search_web", "show_architecture_analysis", "escalate_reasoning"]);
  expect(events.some((event) => event.type === "tool.started")).toBe(false);
  expect(events.some((event) => event.type === "run.failed")).toBe(false);
  expect(events.find((event) => event.type === "text.final")).toMatchObject({ text: "The database is a visible dependency. I made no canvas changes." });
  expect(events.at(-1)?.type).toBe("run.completed");
});

for (const [label, name, args] of [
  ["unknown tool", "delete_canvas", {}],
  ["malformed arguments", "show_architecture_analysis", "{"],
  ["invalid node reference", "propose_canvas_changes", { summary: "Move it", operations: [{ op: "move_node", nodeId: "missing", x: 10, y: 10 }] }],
] as const) {
  test(`${label} fails its tool safely and allows a final answer`, async () => {
    const events = [];
    for await (const event of streamSystemDesignGraph(
      { ...request, mode: name === "propose_canvas_changes" ? "fix" : request.mode },
      { durableState: defaultSystemDesignDurableConversationState(), provider: scripted([tool(name, args), final("The optional tool could not run; the canvas is unchanged.")]) },
    )) events.push(event);
    expect(events.some((event) => event.type === "tool.failed")).toBe(true);
    expect(events.at(-1)?.type).toBe("result");
  });
}

test("tool rounds are capped at four and the next provider pass must finalize", async () => {
  let executions = 0;
  const allowTools: boolean[] = [];
  const provider: SystemDesignAgentProvider = {
    async *streamRound(input) {
      allowTools.push(input.allowTools);
      yield { type: "round", round: input.allowTools ? tool("search_web", { query: `AWS service limit ${allowTools.length}` }, `round-${allowTools.length}`) : final() };
    },
  };
  const executor: SystemDesignToolExecutor = {
    async execute(call) {
      executions++;
      return { ok: false, reason: "No results", message: { role: "tool", tool_call_id: call.id, content: '{"ok":false}' } };
    },
  };
  for await (const _event of streamSystemDesignGraph(request, { durableState: defaultSystemDesignDurableConversationState(), provider, toolExecutor: executor })) void _event;
  expect(executions).toBe(MAX_SYSTEM_DESIGN_TOOL_ROUNDS);
  expect(allowTools).toEqual([true, true, true, true, false]);
});

test("cancellation reaches an active System Design tool and ends the run without a final answer", async () => {
  const controller = new AbortController();
  let toolSignal: AbortSignal | undefined;
  const blocking: SystemDesignToolExecutor = {
    async execute(call, context) {
      toolSignal = context.signal;
      await new Promise<void>((_resolve, reject) => context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true }));
      return { ok: false, reason: "cancelled", message: { role: "tool", tool_call_id: call.id, content: "{}" } };
    },
  };
  const events = [];
  for await (const event of streamSystemDesignEvents(
    request,
    controller.signal,
    execution(scripted([tool("search_web", { query: "current service limits" }, "cancel-search")]), blocking),
  )) {
    events.push(event);
    if (event.type === "tool.started") controller.abort();
  }
  expect(toolSignal?.aborted).toBe(true);
  expect(events.some((event) => event.type === "text.final")).toBe(false);
  expect(events.some((event) => event.type === "tool.failed")).toBe(true);
  expect(events.at(-1)?.type).toBe("run.cancelled");
});

test("System Design uses unified persistence with idempotent replay and compact state", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const idempotencyKey = crypto.randomUUID();
  const first = await prepareSystemDesignRun(repository, "user-a", { ...request, idempotencyKey });
  expect(first.kind).toBe("acquired");
  if (first.kind !== "acquired") return;
  await repository.finalizeRun("user-a", first.conversation.id, first.run.id, {
    status: "completed",
    lastSeq: 3,
    nextConversationState: defaultSystemDesignDurableConversationState(),
  });
  const replay = await prepareSystemDesignRun(repository, "user-a", { ...request, conversationId: first.conversation.id, idempotencyKey });
  expect(replay.kind).toBe("replay");
  expect(first.conversation.surface).toBe("system_design");
});

test("invalid proposals never invoke unsafe execution", async () => {
  const result = await systemDesignToolExecutor.execute(
    { id: "bad-proposal", name: "propose_canvas_changes", arguments: JSON.stringify({ summary: "Bad", operations: [{ op: "delete_node", nodeId: "missing" }] }) },
    { signal: new AbortController().signal, request: { ...request, mode: "fix", message: "Fix the design." }, searchEvidence: [], searchCount: 0 },
  );
  expect(result).toMatchObject({ ok: false, reason: "The canvas proposal was invalid." });
});
