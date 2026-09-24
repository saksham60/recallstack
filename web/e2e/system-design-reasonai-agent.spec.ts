import { expect, test } from "@playwright/test";
import type { ReasonAIRequest } from "../src/features/system-design/reasonai/contract";
import { systemDesignAgentProvider, type SystemDesignAgentProvider, type SystemDesignAgentRound, type SystemDesignAgentRoundInput } from "../src/features/system-design/reasonai/agent-provider";
import { streamSystemDesignEvents } from "../src/lib/reasonai/server/system-design-stream";
import { streamSystemDesignGraph } from "../src/lib/reasonai/server/langgraph/system-design/graph";
import { defaultSystemDesignDurableConversationState } from "../src/lib/reasonai/server/langgraph/system-design/state";
import { MAX_SYSTEM_DESIGN_TOOL_ROUNDS, systemDesignToolExecutor, type SystemDesignToolExecutor } from "../src/lib/reasonai/server/langgraph/system-design/tools";
import { MemoryReasonAIPersistenceRepository } from "../src/lib/reasonai/server/persistence/memory-repository";
import { prepareSystemDesignRun } from "../src/lib/reasonai/server/persistence/system-design-run";
import { isReasonAIDSAStreamingEnabled, isReasonAISystemDesignStreamingEnabled } from "../src/lib/config/server";

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

test("normal System Design chat takes the no-tool fast path", async () => {
  const received: SystemDesignAgentRoundInput[] = [];
  const events = [];
  for await (const event of streamSystemDesignEvents(request, new AbortController().signal, execution(scripted([final()], received)))) events.push(event);
  expect(received).toHaveLength(1);
  expect(events.map((event) => event.type)).toEqual(["run.started", "text.delta", "text.final", "run.completed"]);
  expect(events.some((event) => event.type.startsWith("tool."))).toBe(false);
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
  expect(events.map((event) => event.type)).toEqual([
    "run.started", "tool.started", "sources.ready", "tool.completed", "text.delta", "text.final", "run.completed",
  ]);
  expect(events.find((event) => event.type === "tool.started")).toMatchObject({ toolCallId: "search-1", toolName: "search_web" });
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

test("read-only proposal mismatch is recoverable and never emits an artifact or run failure", async () => {
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
  expect(events.at(-1)?.type).toBe("run.completed");
});

test("an actual provider contract mismatch on a read-only turn degrades to a completed answer", async () => {
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
  expect((bodies[0].tools as Array<{ function: { name: string } }>).map((item) => item.function.name)).toEqual(["search_web", "show_architecture_analysis"]);
  expect(events.some((event) => event.type === "tool.failed")).toBe(true);
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
