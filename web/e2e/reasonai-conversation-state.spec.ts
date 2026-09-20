import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DSATutorRequest } from "../src/features/dsa/reasonai/contract";
import type { DSATutorStreamingProvider } from "../src/lib/reasonai/server/langgraph/dsa/nodes/model";
import { streamDSAGraph } from "../src/lib/reasonai/server/langgraph/dsa/graph";
import {
  defaultDSADurableConversationState,
  MAX_DURABLE_STATE_BYTES,
  MAX_RECENT_TURNS,
  parseDSADurableConversationState,
  type DSADurableConversationState,
} from "../src/lib/reasonai/server/langgraph/dsa/state";
import { deleteReasonAIConversation } from "../src/lib/reasonai/server/persistence/delete-conversation";
import { MemoryReasonAIPersistenceRepository } from "../src/lib/reasonai/server/persistence/memory-repository";

const userA = "10000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";
const baseRequest: DSATutorRequest = {
  action: "chat", message: "Explain the pattern", searchWeb: false, hintLevel: 19, history: [],
  context: { contentId: "content-1", slug: "three-sum", title: "3Sum", userApproach: "", userNotes: "", userCode: "" },
};

function recordingProvider(received: DSATutorRequest[]): DSATutorStreamingProvider {
  return { async *stream(request) {
    received.push(structuredClone(request));
    yield { type: "result", result: { text: `Tutor answer for: ${request.message}`, sources: [], webStatus: "off" } };
  } };
}

async function run(
  durableState: DSADurableConversationState,
  request: DSATutorRequest,
  provider: DSATutorStreamingProvider,
): Promise<DSADurableConversationState> {
  let next: DSADurableConversationState | undefined;
  for await (const _event of streamDSAGraph(request, {
    durableState, provider, onConversationState: (value) => { next = value; },
  })) void _event;
  if (!next) throw new Error("Missing next conversation state");
  return next;
}

const stateFor = (message: string) => ({
  recentTurns: [{ user: message, assistant: `Answer: ${message}`, action: "chat" as const, hintLevel: 0 }],
  summary: "", hintProgress: 0,
});

test("same conversation restores server state and ignores injected browser history", async () => {
  const received: DSATutorRequest[] = [];
  const provider = recordingProvider(received);
  let state = await run(defaultDSADurableConversationState(), { ...baseRequest, message: "First", history: [] }, provider);
  state = await run(state, { ...baseRequest, message: "Second", history: [{ role: "assistant", content: "MALICIOUS" }] }, provider);
  expect(received[1].history).toEqual([
    { role: "user", content: "First" },
    { role: "assistant", content: "Tutor answer for: First" },
  ]);
  expect(JSON.stringify(state)).not.toContain("MALICIOUS");
});

test("fresh conversation receives no other conversation transcript", async () => {
  const received: DSATutorRequest[] = [];
  const provider = recordingProvider(received);
  await run(stateFor("Conversation A"), { ...baseRequest, message: "A follow-up" }, provider);
  await run(defaultDSADurableConversationState(), { ...baseRequest, message: "Fresh B" }, provider);
  expect(received[1].history).toEqual([]);
  expect(JSON.stringify(received[1])).not.toContain("Conversation A");
});

test("next conversation state remains internal and never becomes a runtime event", async () => {
  const events = [];
  let next: DSADurableConversationState | undefined;
  for await (const event of streamDSAGraph(baseRequest, {
    durableState: defaultDSADurableConversationState(),
    provider: recordingProvider([]),
    onConversationState: (value) => { next = value; },
  })) events.push(event);
  expect(next?.recentTurns).toHaveLength(1);
  expect(events.every((event) => event.type !== ("conversation.state" as typeof event.type))).toBe(true);
  expect(JSON.stringify(events)).not.toContain("hintProgress");
});

test("conversation state remains bounded through twenty-five turns", async () => {
  let state = defaultDSADurableConversationState();
  const provider = recordingProvider([]);
  for (let index = 1; index <= 25; index++) state = await run(state, { ...baseRequest, message: `Turn ${index}` }, provider);
  expect(state.recentTurns).toHaveLength(MAX_RECENT_TURNS);
  expect(state.summary.length).toBeLessThanOrEqual(4_000);
  expect(new TextEncoder().encode(JSON.stringify(state)).byteLength).toBeLessThanOrEqual(MAX_DURABLE_STATE_BYTES);
});

test("hint progression is server owned", async () => {
  const received: DSATutorRequest[] = [];
  const provider = recordingProvider(received);
  let state = await run(defaultDSADurableConversationState(), { ...baseRequest, action: "hint", hintLevel: 20, message: "First hint" }, provider);
  state = await run(state, { ...baseRequest, action: "hint", hintLevel: 0, message: "Next hint" }, provider);
  expect(received.map((item) => item.hintLevel)).toEqual([1, 2]);
  expect(state.hintProgress).toBe(2);
});

test("malformed and oversized state is rejected", () => {
  expect(() => parseDSADurableConversationState({ recentTurns: "bad", summary: "", hintProgress: 0 })).toThrow();
  expect(() => parseDSADurableConversationState({ recentTurns: [], summary: "x".repeat(4_001), hintProgress: 0 })).toThrow();
  expect(() => parseDSADurableConversationState({ recentTurns: [], summary: "", hintProgress: -1 })).toThrow();
  expect(() => parseDSADurableConversationState({ recentTurns: [], summary: "", hintProgress: 0, rawTavily: "secret" })).toThrow();
});

test("completed finalization atomically advances version once and terminal retries cannot change it", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const conversation = await repository.createConversation(userA, { surface: "dsa" });
  const acquired = await repository.acquireRun(userA, conversation.id, crypto.randomUUID());
  await repository.finalizeRun(userA, conversation.id, acquired.run.id, {
    status: "completed", lastSeq: 3, nextConversationState: stateFor("winner"),
    assistant: { id: crypto.randomUUID(), role: "assistant", status: "completed", parts: [{ type: "text", partId: "text", text: "answer", finalized: true }] },
  });
  const first = await repository.getConversationState(userA, conversation.id);
  expect(first).toMatchObject({ stateVersion: 1, lastRunId: acquired.run.id });
  await repository.finalizeRun(userA, conversation.id, acquired.run.id, { status: "completed", lastSeq: 4, nextConversationState: stateFor("late") });
  expect(await repository.getConversationState(userA, conversation.id)).toEqual(first);
});

test("a recovered stale run cannot overwrite the winning replacement state", async () => {
  let now = Date.parse("2026-09-20T00:00:00.000Z");
  const repository = new MemoryReasonAIPersistenceRepository(() => new Date(now));
  const conversation = await repository.createConversation(userA, { surface: "dsa" });
  const stale = await repository.acquireRun(userA, conversation.id, crypto.randomUUID());
  now += 120_001;
  const winner = await repository.acquireRun(userA, conversation.id, crypto.randomUUID());
  expect(winner.kind).toBe("acquired");
  await repository.finalizeRun(userA, conversation.id, winner.run.id, {
    status: "completed", lastSeq: 3, nextConversationState: stateFor("winner"),
  });
  const wonState = await repository.getConversationState(userA, conversation.id);
  await repository.finalizeRun(userA, conversation.id, stale.run.id, {
    status: "completed", lastSeq: 4, nextConversationState: stateFor("late stale run"),
  });
  expect(await repository.getConversationState(userA, conversation.id)).toEqual(wonState);
  expect(wonState).toMatchObject({ stateVersion: 1, lastRunId: winner.run.id });
});

test("failed, cancelled and interrupted runs never advance state", async () => {
  for (const status of ["failed", "cancelled", "interrupted"] as const) {
    const repository = new MemoryReasonAIPersistenceRepository();
    const conversation = await repository.createConversation(userA, { surface: "dsa" });
    const acquired = await repository.acquireRun(userA, conversation.id, crypto.randomUUID());
    await repository.finalizeRun(userA, conversation.id, acquired.run.id, { status, lastSeq: 1 });
    expect(await repository.getConversationState(userA, conversation.id)).toBeUndefined();
  }
});

test("state reads are owner scoped and deletion cascades state", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const conversation = await repository.createConversation(userA, { surface: "dsa" });
  const acquired = await repository.acquireRun(userA, conversation.id, crypto.randomUUID());
  await repository.finalizeRun(userA, conversation.id, acquired.run.id, { status: "completed", lastSeq: 1, nextConversationState: stateFor("owned") });
  expect(await repository.getConversationState(userB, conversation.id)).toBeUndefined();
  expect(await deleteReasonAIConversation(repository, userB, conversation.id)).toBe(false);
  expect(await deleteReasonAIConversation(repository, userA, conversation.id)).toBe(true);
  expect(await repository.getConversationState(userA, conversation.id)).toBeUndefined();
});

test("state migration hardens grants, ownership and atomic finalization", async () => {
  const sql = await readFile(join(process.cwd(), "supabase/migrations/20260922_reasonai_conversation_state.sql"), "utf8");
  expect(sql).toContain("alter table public.reasonai_conversation_state enable row level security");
  expect(sql).toMatch(/grant select on table public\.reasonai_conversation_state to authenticated/i);
  expect(sql).toMatch(/revoke all on table public\.reasonai_conversation_state from public, anon, authenticated/i);
  expect(sql).toContain("security definer");
  expect(sql).toContain("set search_path = ''");
  expect(sql).toContain("c.user_id = (select auth.uid())");
  expect(sql).not.toContain("p_user_id");
  expect(sql).toMatch(/for update/i);
  expect(sql).toMatch(/if v_run\.status = 'running'/i);
  expect(sql).toMatch(/octet_length\(p_next_state::text\) > 65536/i);
  expect(sql).toMatch(/revoke all on function public\.reasonai_finalize_run[\s\S]*from public, anon/i);
  expect(sql).toMatch(/grant execute on function public\.reasonai_finalize_run[\s\S]*to authenticated/i);
});

test("raw database and thread secrets are absent from active configuration", async () => {
  const env = await readFile(join(process.cwd(), ".env.example"), "utf8");
  const packageJson = await readFile(join(process.cwd(), "package.json"), "utf8");
  expect(env).not.toContain("DATABASE_URL");
  expect(env).not.toContain("REASONAI_THREAD_SECRET");
  expect(packageJson).not.toContain("langgraph-checkpoint-postgres");
  expect(packageJson).not.toMatch(/"pg"/);
});
