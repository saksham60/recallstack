import { expect, test } from "@playwright/test";
import { Client } from "langsmith";
import { RunTree } from "langsmith/run_trees";
import { streamStoryAnswer } from "../src/features/feed/reasonai";
import type { FeedStory } from "../src/features/feed/model";
import { flushLangSmith, traceTool, traceTurn, traceTurnStream } from "../src/lib/reasonai/server/langsmith";

const originalFetch = globalThis.fetch;
const originalPost = RunTree.prototype.postRun;
const originalPatch = RunTree.prototype.patchRun;
const originalFlush = Client.prototype.flush;
const originalEnv = {
  tracing: process.env.LANGSMITH_TRACING,
  smithKey: process.env.LANGSMITH_API_KEY,
  nebiusKey: process.env.NEBIUS_API_KEY,
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  RunTree.prototype.postRun = originalPost;
  RunTree.prototype.patchRun = originalPatch;
  Client.prototype.flush = originalFlush;
  for (const [name, value] of [["LANGSMITH_TRACING", originalEnv.tracing], ["LANGSMITH_API_KEY", originalEnv.smithKey], ["NEBIUS_API_KEY", originalEnv.nebiusKey]] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test("traces a streamed user turn and actual model prompt without changing the stream", async () => {
  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGSMITH_API_KEY = "test-smith-key";
  process.env.NEBIUS_API_KEY = "test-provider-key";
  const runs: RunTree[] = [];
  RunTree.prototype.postRun = async function () { runs.push(this); };
  RunTree.prototype.patchRun = async function () {};
  Client.prototype.flush = async function () {};
  globalThis.fetch = async () => new Response(
    'data: {"choices":[{"delta":{"reasoning_content":"private chain-of-thought sentinel","content":"A cache saves repeated work."}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    { headers: { "content-type": "text/event-stream" } },
  );
  const story: FeedStory = {
    id: "10000000-0000-4000-8000-000000000001", title: "Caching", summary: "Caches speed reads.", whyItMatters: "Less latency.",
    topics: ["data"], source: { key: "source", name: "Journal" }, sourceUrl: "https://example.test/story", imageUrl: "",
    publishedAt: "2026-09-25T10:00:00Z", importanceScore: 0.8, qualityScore: 0.8,
    viewerState: { saved: false, seenAt: null },
  };
  const events = [];
  for await (const event of traceTurnStream("reasonai.knowledge", { query: "Explain caching" }, { user_id: "user-1" }, streamStoryAnswer({ context: story, message: "Explain caching", history: [] }, story, new AbortController().signal))) {
    events.push(event);
  }
  await flushLangSmith();
  expect(events.at(-1)?.type).toBe("run.completed");
  expect(events.find((event) => event.type === "text.final")).toMatchObject({ text: "A cache saves repeated work." });
  expect(runs).toHaveLength(2);
  const root = runs.find((run) => run.run_type === "chain")!;
  const model = runs.find((run) => run.run_type === "llm")!;
  expect(root.inputs).toMatchObject({ query: "Explain caching" });
  expect(root.metadata.user_id).toBe("user-1");
  expect((root as unknown as { project_name?: string }).project_name).toBe("reasonai-production");
  expect(root.outputs).toMatchObject({
    status: "completed",
    final_answer: "A cache saves repeated work.",
  });
  expect(model.parent_run?.id ?? model.parent_run_id).toBe(root.id);
  expect(JSON.stringify(model.inputs)).toContain("You are ReasonAI");
  expect(JSON.stringify(model.inputs)).toContain("Explain caching");
  expect(JSON.stringify(model.outputs)).toContain("A cache saves repeated work.");
  expect(JSON.stringify({ input: model.inputs, output: model.outputs })).not.toContain("private chain-of-thought sentinel");
  expect(JSON.stringify({ input: model.inputs, output: model.outputs })).not.toContain("test-provider-key");
});

test("summarizes streamed tools, sources, and model metadata on the root trace", async () => {
  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGSMITH_API_KEY = "test-smith-key";
  const runs: RunTree[] = [];
  RunTree.prototype.postRun = async function () { runs.push(this); };
  RunTree.prototype.patchRun = async function () {};
  Client.prototype.flush = async function () {};

  async function* source() {
    yield { type: "run.started" };
    yield { type: "tool.started", toolName: "search_web" };
    yield {
      type: "sources.ready",
      sources: [{ sourceId: "source-1", title: "Caching", url: "https://example.test/cache", kind: "search" }],
    };
    yield {
      type: "text.final",
      text: "Use a cache for repeated reads.",
      model: {
        preference: "auto",
        modelsUsed: ["super", "ultra"],
        finalModel: "ultra",
        escalated: true,
      },
    };
    yield { type: "run.completed" };
  }

  const events = [];
  for await (const event of traceTurnStream(
    "reasonai.system_design",
    { query: "Design this" },
    { user_id: "user-4", surface: "system_design" },
    source(),
  )) events.push(event);
  await flushLangSmith();

  expect(events).toHaveLength(5);
  const root = runs.find((run) => run.run_type === "chain")!;
  expect(root.outputs).toMatchObject({
    status: "completed",
    final_answer: "Use a cache for repeated reads.",
    tools_used: ["search_web"],
    model: {
      preference: "auto",
      modelsUsed: ["super", "ultra"],
      finalModel: "ultra",
      escalated: true,
    },
  });
  expect(JSON.stringify(root.outputs)).toContain("https://example.test/cache");
});

test("traces tool execution and leaves the disabled path unchanged", async () => {
  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGSMITH_API_KEY = "test-smith-key";
  const runs: RunTree[] = [];
  RunTree.prototype.postRun = async function () { runs.push(this); };
  RunTree.prototype.patchRun = async function () {};
  Client.prototype.flush = async function () {};
  const result = await traceTurn("reasonai.dsa", { query: "Find details" }, { user_id: "user-2" }, () =>
    traceTool("search_web", { query: "cache" }, async () => ({ ok: true, results: ["source"] })));
  await flushLangSmith();
  expect(result.ok).toBe(true);
  expect(runs).toHaveLength(2);
  expect(runs.find((run) => run.run_type === "tool")?.parent_run?.id).toBe(runs.find((run) => run.run_type === "chain")?.id);
  process.env.LANGSMITH_TRACING = "false";
  expect(await traceTool("search_web", { query: "cache" }, async () => "unchanged")).toBe("unchanged");
  expect(runs).toHaveLength(2);
});

test("continues the user operation when LangSmith is unavailable", async () => {
  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGSMITH_API_KEY = "test-smith-key";
  RunTree.prototype.postRun = async function () { throw new Error("LangSmith offline"); };
  Client.prototype.flush = async function () {};
  expect(await traceTurn("reasonai.dsa", { query: "Help" }, { user_id: "user-3" }, async () => "answer")).toBe("answer");
  await expect(flushLangSmith()).resolves.toBeUndefined();
});
