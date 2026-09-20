import { expect, test } from "@playwright/test";
import type { DSATutorRequest, DSATutorResponse } from "../src/features/dsa/reasonai/contract";
import {
  dsaTutorProvider,
  type DSATutorProviderStreamEvent,
} from "../src/features/dsa/reasonai/provider";
import { decodeTokenFactorySSE } from "../src/features/dsa/reasonai/provider-sse";
import { isReasonAIDSAStreamingEnabled } from "../src/lib/config/server";
import { createReasonAIRuntimeState, reduceReasonAIEvent } from "../src/lib/reasonai/runtime/reducer";
import { streamDSAEvents } from "../src/lib/reasonai/server/dsa-stream";
import { streamDSAGraph } from "../src/lib/reasonai/server/langgraph/dsa/graph";
import type { DSAGraphStreamEvent } from "../src/lib/reasonai/server/langgraph/dsa/events";
import { defaultDSADurableConversationState } from "../src/lib/reasonai/server/langgraph/dsa/state";
import { visualLesson } from "./helpers/dsa-visual";

const request: DSATutorRequest = {
  action: "chat",
  message: "Teach me about arrays",
  searchWeb: false,
  hintLevel: 1,
  history: [],
  context: {
    contentId: "content-1",
    slug: "arrays",
    title: "Arrays",
    category: "Arrays",
    userApproach: "A bounded learner idea",
    userCode: "",
    userNotes: "",
  },
};

const originalFetch = globalThis.fetch;
const originalEnv = {
  NEBIUS_API_KEY: process.env.NEBIUS_API_KEY,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  REASONAI_MODEL: process.env.REASONAI_MODEL,
  REASONAI_BASE_URL: process.env.REASONAI_BASE_URL,
  REASONAI_V2_MODE: process.env.REASONAI_V2_MODE,
};

function frame(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function textChunk(content: string, finishReason: string | null = null) {
  return { choices: [{ delta: { content }, finish_reason: finishReason }] };
}

function sseResponse(chunks: Array<string | Uint8Array>): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

function standardSSE(text = "  A validated streaming answer with enough content to release several provisional chunks.  ") {
  return sseResponse([
    frame(textChunk(text.slice(0, 34))),
    frame(textChunk(text.slice(34, 68))),
    frame(textChunk(text.slice(68), "stop")),
    "data: [DONE]\n\n",
  ]);
}

function graphExecution() {
  return { durableState: defaultDSADurableConversationState() };
}

function eventExecution() {
  return {
    ...graphExecution(),
    runId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    mark: () => undefined,
  };
}

async function fold(stream: AsyncIterable<DSATutorProviderStreamEvent>): Promise<DSATutorResponse> {
  let result: DSATutorResponse | undefined;
  for await (const event of stream) if (event.type === "result") result = event.result;
  if (!result) throw new Error("Missing result");
  return result;
}

test.beforeEach(() => {
  process.env.NEBIUS_API_KEY = "private-nebius-stream-key";
  delete process.env.TAVILY_API_KEY;
  process.env.REASONAI_MODEL = "stream-model";
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  delete process.env.REASONAI_V2_MODE;
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("Token Factory uses stream:true and emits deltas before normalized authoritative text", async () => {
  let sentBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(String(init?.body));
    return standardSSE();
  };

  const events: DSATutorProviderStreamEvent[] = [];
  for await (const event of dsaTutorProvider.stream(request)) events.push(event);
  expect(sentBody?.stream).toBe(true);
  expect(events.filter((event) => event.type === "text.delta").length).toBeGreaterThan(1);
  const provisional = events.flatMap((event) => event.type === "text.delta" ? [event.delta] : []).join("");
  const result = events.find((event) => event.type === "result")?.result;
  expect(provisional.length).toBeLessThan(result!.text.length);
  expect(result?.text).toBe("A validated streaming answer with enough content to release several provisional chunks.");
});

test("SSE parser handles coalesced frames, split frames, CRLF and split UTF-8", async () => {
  const encoder = new TextEncoder();
  const payload = frame(textChunk("Hello 🌍")) + frame(textChunk(" again", "stop")) + "data: [DONE]\r\n\r\n";
  const bytes = encoder.encode(payload);
  const emoji = encoder.encode("🌍");
  const emojiStart = bytes.findIndex((value, index) => emoji.every((part, offset) => bytes[index + offset] === part));
  const chunks = [bytes.slice(0, 7), bytes.slice(7, emojiStart + 1), bytes.slice(emojiStart + 1, emojiStart + 3), bytes.slice(emojiStart + 3)];
  const decoded = [];
  for await (const item of decodeTokenFactorySSE(sseResponse(chunks).body!)) decoded.push(item);
  expect(decoded).toHaveLength(2);
  expect(decoded[0].choices?.[0].delta?.content).toBe("Hello 🌍");
  expect(decoded[1].choices?.[0].finish_reason).toBe("stop");
});

test("SSE parser enforces separate first-event and idle deadlines", async () => {
  const collect = async (stream: ReadableStream<Uint8Array>, firstEventMs: number, idleMs: number) => {
    for await (const _frame of decodeTokenFactorySSE(stream, undefined, { firstEventMs, idleMs })) void _frame;
  };
  let firstCancelled = false;
  const silent = new ReadableStream<Uint8Array>({ cancel() { firstCancelled = true; } });
  await expect(collect(silent, 5, 50)).rejects.toThrow("did not start streaming");
  expect(firstCancelled).toBe(true);

  let idleCancelled = false;
  const encoder = new TextEncoder();
  const stalled = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(encoder.encode(frame(textChunk("started")))); },
    cancel() { idleCancelled = true; },
  });
  await expect(collect(stalled, 50, 5)).rejects.toThrow("became idle");
  expect(idleCancelled).toBe(true);
});

test("provider rejects unexpected EOF, malformed/provider error frames, HTTP 429 and empty content", async () => {
  const failures: Array<{ response: () => Response; status?: number }> = [
    { response: () => sseResponse([frame(textChunk("partial"))]) },
    { response: () => sseResponse(["data: {bad}\n\n"]) },
    { response: () => sseResponse([frame({ error: { code: "429", message: "private detail" } }), "data: [DONE]\n\n"]), status: 429 },
    { response: () => new Response("private detail", { status: 429 }), status: 429 },
    { response: () => sseResponse([frame(textChunk("", "stop")), "data: [DONE]\n\n"]) },
  ];
  for (const failure of failures) {
    globalThis.fetch = async () => failure.response();
    const result = dsaTutorProvider.complete(request);
    if (failure.status) await expect(result).rejects.toMatchObject({ status: failure.status });
    else await expect(result).rejects.toMatchObject({ status: 502 });
  }
});

test("abort stops provider stream consumption", async () => {
  const controller = new AbortController();
  globalThis.fetch = async () => {
    controller.abort();
    return standardSSE();
  };
  await expect(dsaTutorProvider.complete(request, controller.signal)).rejects.toMatchObject({ status: 504 });
});

test("rolling holdback prevents a configured credential split across chunks from reaching deltas", async () => {
  process.env.NEBIUS_API_KEY = "secret-split-value";
  const text = "A safe prefix long enough to stream before secret-split-value appears.";
  globalThis.fetch = async () => sseResponse([
    frame(textChunk(text.slice(0, 48))),
    frame(textChunk(text.slice(48, 56))),
    frame(textChunk(text.slice(56), "stop")),
    "data: [DONE]\n\n",
  ]);
  const deltas: string[] = [];
  let failure: unknown;
  try {
    for await (const event of dsaTutorProvider.stream(request)) {
      if (event.type === "text.delta") deltas.push(event.delta);
    }
  } catch (error) { failure = error; }
  expect(failure).toMatchObject({ status: 502 });
  expect(deltas.join("")).not.toContain("secret-split-value");
});

for (const action of ["chat", "hint", "review", "solution"] as const) {
  test(`complete folds the authoritative ${action} stream result`, async () => {
    globalThis.fetch = async () => standardSSE(`  ${action} response with enough deterministic content to pass the rolling credential holdback safely.  `);
    const streamed = await fold(dsaTutorProvider.stream({ ...request, action }));
    const completed = await dsaTutorProvider.complete({ ...request, action });
    expect(completed).toEqual(streamed);
  });
}

test("visual tool fragments are accumulated, validated and equal through stream folding", async () => {
  const args = JSON.stringify(visualLesson);
  const visualSSE = () => sseResponse([
    frame({ choices: [{ delta: { tool_calls: [{ index: 0, type: "function", function: { name: "present_visual_lesson", arguments: args.slice(0, 100) } }] }, finish_reason: null }] }),
    frame({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(100) } }] }, finish_reason: "tool_calls" }] }),
    "data: [DONE]\n\n",
  ]);
  globalThis.fetch = async () => visualSSE();
  const visualRequest = { ...request, action: "visualize" as const };
  const streamed = await fold(dsaTutorProvider.stream(visualRequest));
  const completed = await dsaTutorProvider.complete(visualRequest);
  expect(streamed.visual).toEqual(visualLesson);
  expect(completed).toEqual(streamed);
});

test("web evidence, filtered sources and signed context retain stream/complete parity", async () => {
  process.env.TAVILY_API_KEY = "private-tavily-stream-key";
  const originalNow = Date.now;
  Date.now = () => 1_800_000_000_000;
  try {
    globalThis.fetch = async (url) => String(url).includes("tavily")
      ? Response.json({ results: [{ title: "Arrays", url: "https://example.com/arrays", content: "Given an input array, return the requested output value using the supplied requirements and constraints from this public reference." }] })
      : standardSSE("  Source-grounded answer [1] with enough deterministic content to stream safely.  ");
    const sourceRequest = { ...request, action: "explain" as const, message: "Explain this problem", searchWeb: true };
    const streamed = await fold(dsaTutorProvider.stream(sourceRequest));
    const completed = await dsaTutorProvider.complete(sourceRequest);
    expect(completed).toEqual(streamed);
    expect(streamed.sources).toEqual([{ title: "Arrays", url: "https://example.com/arrays", kind: "search" }]);
    expect(streamed.webStatus).toBe("used");
    expect(streamed.webContextToken).toBeTruthy();
  } finally { Date.now = originalNow; }
});

test("LangGraph agent forwards provider deltas and a validated request-scoped result", async () => {
  globalThis.fetch = async () => standardSSE();
  const events: DSAGraphStreamEvent[] = [];
  for await (const event of streamDSAGraph(request, graphExecution())) events.push(event);
  expect(events[0].type).toBe("text.delta");
  expect(events.at(-1)?.type).toBe("result");
});

test("DSA event adapter emits one ordered terminal sequence and authoritative final replacement", async () => {
  globalThis.fetch = async () => standardSSE();
  const events = [];
  for await (const event of streamDSAEvents(request, new AbortController().signal, eventExecution())) events.push(event);
  expect(events.map((event) => event.type)).toEqual([
    "run.started",
    "text.delta",
    "text.delta",
    "text.delta",
    "text.final",
    "sources.ready",
    "run.completed",
  ]);
  const state = events.reduce(reduceReasonAIEvent, createReasonAIRuntimeState());
  expect(state.status).toBe("completed");
  expect(state.messages[0].parts.find((part) => part.type === "text")).toMatchObject({
    text: "A validated streaming answer with enough content to release several provisional chunks.",
    finalized: true,
  });
  expect(state.messages[0].parts.find((part) => part.type === "sources")).toMatchObject({ retrievalStatus: "off" });
});

test("DSA event adapter converts post-establishment provider failure and abort to one terminal event", async () => {
  globalThis.fetch = async () => sseResponse([frame(textChunk("partial content that is long enough to release"))]);
  const failed = [];
  for await (const event of streamDSAEvents(request, new AbortController().signal, eventExecution())) failed.push(event.type);
  expect(failed.at(-1)).toBe("run.failed");
  expect(failed).not.toContain("run.completed");

  const controller = new AbortController();
  controller.abort();
  const cancelled = [];
  for await (const event of streamDSAEvents(request, controller.signal, eventExecution())) cancelled.push(event.type);
  expect(cancelled).toEqual(["run.started", "run.cancelled"]);
});

test("DSA V2 enablement accepts only dsa and all modes", () => {
  for (const [mode, enabled] of [[undefined, false], ["off", false], ["dsa", true], ["all", true], ["system-design", false]] as const) {
    if (mode === undefined) delete process.env.REASONAI_V2_MODE;
    else process.env.REASONAI_V2_MODE = mode;
    expect(isReasonAIDSAStreamingEnabled()).toBe(enabled);
  }
});
