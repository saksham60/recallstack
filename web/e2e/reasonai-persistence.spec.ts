import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { DSATutorRequest } from "../src/features/dsa/reasonai/contract";
import type { ReasonAIKnownEvent } from "../src/lib/reasonai/runtime/events";
import { prepareDSARun } from "../src/lib/reasonai/server/persistence/dsa-run";
import { MemoryReasonAIPersistenceRepository } from "../src/lib/reasonai/server/persistence/memory-repository";
import { persistReasonAITranscript } from "../src/lib/reasonai/server/persistence/stream";

const userA = "10000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";
const request: DSATutorRequest = {
  action: "chat",
  message: "Explain two pointers",
  searchWeb: false,
  hintLevel: 0,
  history: [],
  context: {
    contentId: "content-1",
    slug: "two-sum",
    title: "Two Sum",
    userApproach: "",
    userNotes: "",
    userCode: "",
  },
};

test("migration creates transcript tables, RLS ownership policies and database concurrency constraints", () => {
  const sql = readFileSync("supabase/migrations/20260919_reasonai_persistence.sql", "utf8");
  for (const table of ["reasonai_conversations", "reasonai_messages", "reasonai_runs"]) {
    expect(sql).toContain(`create table if not exists public.${table}`);
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  }
  expect(sql).toContain("unique (conversation_id, idempotency_key)");
  expect(sql).toMatch(/unique index[\s\S]+on public\.reasonai_runs \(conversation_id\) where status = 'running'/);
  expect(sql).toContain("c.user_id = auth.uid()");
  expect(sql).not.toContain("service_role");
  expect(sql).not.toContain("thread_id");
});

test("conversation CRUD is owner-scoped, bounded, ordered and delete cascades", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const a = await repository.createConversation(userA, { surface: "dsa", contextId: "content-1", title: "A" });
  await repository.createConversation(userB, { surface: "dsa", contextId: "content-1", title: "B" });
  const run = await repository.acquireRun(userA, a.id, crypto.randomUUID());
  expect(run.kind).toBe("acquired");
  await repository.createMessage(userA, {
    id: crypto.randomUUID(), conversationId: a.id, runId: run.run.id, role: "user", status: "completed",
    parts: [{ type: "text", partId: crypto.randomUUID(), text: "first", finalized: true }],
  });
  await repository.createMessage(userA, {
    id: crypto.randomUUID(), conversationId: a.id, runId: run.run.id, role: "assistant", status: "completed",
    parts: [{ type: "text", partId: crypto.randomUUID(), text: "second", finalized: true }],
  });
  expect((await repository.listConversations(userA, { surface: "dsa", contextId: "content-1", limit: 10 })).map((item) => item.title)).toEqual(["A"]);
  expect(await repository.getConversation(userB, a.id)).toBeUndefined();
  expect((await repository.getConversation(userA, a.id))?.messages.map((item) => item.role)).toEqual(["user", "assistant"]);
  expect(await repository.deleteConversation(userB, a.id)).toBe(false);
  expect(await repository.deleteConversation(userA, a.id)).toBe(true);
  expect(await repository.getConversation(userA, a.id)).toBeUndefined();
  await expect(repository.acquireRun(userA, a.id, crypto.randomUUID())).rejects.toThrow("not found");
});

test("run acquisition enforces idempotency and one active run under concurrency", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const conversation = await repository.createConversation(userA, { surface: "dsa", contextId: "content-1" });
  const key = crypto.randomUUID();
  const first = await repository.acquireRun(userA, conversation.id, key);
  expect(first.kind).toBe("acquired");
  expect((await repository.acquireRun(userA, conversation.id, key)).kind).toBe("active");
  const competing = await Promise.all([
    repository.acquireRun(userA, conversation.id, crypto.randomUUID()),
    repository.acquireRun(userA, conversation.id, crypto.randomUUID()),
  ]);
  expect(competing.every((item) => item.kind === "active")).toBe(true);
  await repository.finalizeRun(userA, conversation.id, first.run.id, { status: "completed", lastSeq: 7 });
  const replay = await repository.acquireRun(userA, conversation.id, key);
  expect(replay).toMatchObject({ kind: "replay", run: { status: "completed", lastSeq: 7 } });
  expect((await repository.acquireRun(userA, conversation.id, crypto.randomUUID())).kind).toBe("acquired");
});

test("DSA preparation creates one user turn and duplicate idempotency never executes twice", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const idempotencyKey = crypto.randomUUID();
  const first = await prepareDSARun(repository, userA, { ...request, idempotencyKey });
  expect(first.kind).toBe("acquired");
  if (first.kind !== "acquired") throw new Error("Expected acquired run");
  let executions = 1;
  await repository.finalizeRun(userA, first.conversation.id, first.run.id, { status: "completed", lastSeq: 2 });
  const repeated = await prepareDSARun(repository, userA, { ...request, conversationId: first.conversation.id, idempotencyKey });
  if (repeated.kind === "acquired") executions++;
  expect(repeated.kind).toBe("replay");
  expect(executions).toBe(1);
  expect((await repository.getConversation(userA, first.conversation.id))?.messages).toHaveLength(1);
  await expect(prepareDSARun(repository, userB, { ...request, conversationId: first.conversation.id, idempotencyKey: crypto.randomUUID() }))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("completed streams persist authoritative final text, sources, visuals and terminal run state", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const idempotencyKey = crypto.randomUUID();
  const prepared = await prepareDSARun(repository, userA, { ...request, idempotencyKey });
  if (prepared.kind !== "acquired") throw new Error("Expected acquired run");
  const partId = crypto.randomUUID();
  const events: ReasonAIKnownEvent[] = [
    { protocolVersion: 1, runId: prepared.run.id, seq: 1, type: "run.started" },
    { protocolVersion: 1, runId: prepared.run.id, seq: 2, type: "text.delta", messageId: prepared.assistantMessageId, partId, delta: "provisional suffix" },
    { protocolVersion: 1, runId: prepared.run.id, seq: 3, type: "text.final", messageId: prepared.assistantMessageId, partId, text: "Authoritative answer." },
    { protocolVersion: 1, runId: prepared.run.id, seq: 4, type: "sources.ready", messageId: prepared.assistantMessageId, partId: crypto.randomUUID(), sources: [{ sourceId: "source-1", title: "Reference", url: "https://example.com/reference", kind: "search" }], retrievalStatus: "used", contextToken: "signed-context" },
    { protocolVersion: 1, runId: prepared.run.id, seq: 5, type: "visual.ready", messageId: prepared.assistantMessageId, partId: crypto.randomUUID(), data: { type: "array", title: "Trace", summary: "Summary", steps: [] } },
    { protocolVersion: 1, runId: prepared.run.id, seq: 6, type: "run.completed" },
  ];
  const delivered = [];
  for await (const event of persistReasonAITranscript(repository, userA, prepared.conversation.id, prepared.run.id, events)) delivered.push(event);
  expect(delivered).toEqual(events);
  const restored = await repository.getConversation(userA, prepared.conversation.id);
  const assistant = restored?.messages.find((item) => item.role === "assistant");
  expect(assistant).toMatchObject({ status: "completed" });
  expect(assistant?.parts.find((part) => part.type === "text")).toMatchObject({ text: "Authoritative answer.", finalized: true });
  expect(assistant?.parts.some((part) => part.type === "sources")).toBe(true);
  expect(assistant?.parts.find((part) => part.type === "sources")).not.toHaveProperty("contextToken");
  expect(assistant?.parts.some((part) => part.type === "visual")).toBe(true);
  expect((await repository.acquireRun(userA, prepared.conversation.id, idempotencyKey)).kind).toBe("replay");
});

test("cancelled and disconnected streams retain useful partial assistant output", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const cancelled = await prepareDSARun(repository, userA, { ...request, idempotencyKey: crypto.randomUUID() });
  if (cancelled.kind !== "acquired") throw new Error("Expected acquired run");
  const cancelledEvents: ReasonAIKnownEvent[] = [
    { protocolVersion: 1, runId: cancelled.run.id, seq: 1, type: "run.started" },
    { protocolVersion: 1, runId: cancelled.run.id, seq: 2, type: "text.delta", messageId: cancelled.assistantMessageId, partId: "text", delta: "Useful partial" },
    { protocolVersion: 1, runId: cancelled.run.id, seq: 3, type: "run.cancelled" },
  ];
  for await (const event of persistReasonAITranscript(repository, userA, cancelled.conversation.id, cancelled.run.id, cancelledEvents)) void event;
  expect((await repository.getConversation(userA, cancelled.conversation.id))?.messages.at(-1)).toMatchObject({ status: "cancelled", parts: [{ text: "Useful partial" }] });

  const interrupted = await prepareDSARun(repository, userA, { ...request, conversationId: cancelled.conversation.id, idempotencyKey: crypto.randomUUID() });
  if (interrupted.kind !== "acquired") throw new Error("Expected acquired run");
  const interruptedMessageId = interrupted.assistantMessageId;
  async function* openStream(): AsyncGenerator<ReasonAIKnownEvent> {
    yield { protocolVersion: 1, runId: interrupted.run.id, seq: 1, type: "run.started" };
    yield { protocolVersion: 1, runId: interrupted.run.id, seq: 2, type: "text.delta", messageId: interruptedMessageId, partId: "text", delta: "Disconnected partial" };
    await new Promise(() => undefined);
  }
  const stream = persistReasonAITranscript(repository, userA, interrupted.conversation.id, interrupted.run.id, openStream());
  await stream.next();
  await stream.next();
  await stream.return(undefined);
  const restored = await repository.getConversation(userA, interrupted.conversation.id);
  expect(restored?.messages.at(-1)).toMatchObject({ status: "interrupted", parts: [{ text: "Disconnected partial" }] });
  expect(await repository.cancelRun(userA, interrupted.conversation.id, interrupted.run.id)).toBe(true);
  expect((await repository.getConversation(userA, interrupted.conversation.id))?.messages.at(-1)?.status).toBe("cancelled");
});

test("failed runs retain visible partial text without representing it as completed", async () => {
  const repository = new MemoryReasonAIPersistenceRepository();
  const prepared = await prepareDSARun(repository, userA, { ...request, idempotencyKey: crypto.randomUUID() });
  if (prepared.kind !== "acquired") throw new Error("Expected acquired run");
  const events: ReasonAIKnownEvent[] = [
    { protocolVersion: 1, runId: prepared.run.id, seq: 1, type: "run.started" },
    { protocolVersion: 1, runId: prepared.run.id, seq: 2, type: "text.delta", messageId: prepared.assistantMessageId, partId: "text", delta: "Visible before failure" },
    { protocolVersion: 1, runId: prepared.run.id, seq: 3, type: "run.failed", message: "Safe failure", code: "PROVIDER_FAILURE" },
  ];
  for await (const event of persistReasonAITranscript(repository, userA, prepared.conversation.id, prepared.run.id, events)) void event;
  const transcript = await repository.getConversation(userA, prepared.conversation.id);
  expect(transcript?.messages.at(-1)).toMatchObject({ status: "failed", parts: [{ text: "Visible before failure", finalized: false }] });
  const replay = await repository.acquireRun(userA, prepared.conversation.id, prepared.run.idempotencyKey);
  expect(replay).toMatchObject({ kind: "replay", run: { status: "failed", errorCode: "PROVIDER_FAILURE", lastSeq: 3 } });
});
