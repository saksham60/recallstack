import { expect, test } from "@playwright/test";
import type { ReasonAIEvent, ReasonAIKnownEvent } from "../src/lib/reasonai/runtime/events";
import { parseReasonAIEvent, ReasonAIProtocolError } from "../src/lib/reasonai/runtime/protocol";
import {
  createReasonAIRuntimeState,
  reduceReasonAIEvent,
} from "../src/lib/reasonai/runtime/reducer";
import {
  consumeReasonAIStream,
  decodeReasonAIStream,
  ReasonAINDJSONDecoder,
} from "../src/lib/reasonai/runtime/stream";

const base = (runId: string, seq: number) => ({ protocolVersion: 1 as const, runId, seq });
const started = (runId = "run-1", seq = 1) => ({ ...base(runId, seq), type: "run.started" as const });
const delta = (seq: number, text: string, partId = "text-a") => ({
  ...base("run-1", seq),
  type: "text.delta" as const,
  messageId: "message-1",
  partId,
  delta: text,
});

function apply(events: ReasonAIEvent[]) {
  return events.reduce(reduceReasonAIEvent, createReasonAIRuntimeState());
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function decode(chunks: Uint8Array[]): Promise<ReasonAIEvent[]> {
  const events: ReasonAIEvent[] = [];
  for await (const event of decodeReasonAIStream(streamFromChunks(chunks))) events.push(event);
  return events;
}

test("protocol validates V1 envelopes and safely normalizes an unknown V1 event", () => {
  expect(parseReasonAIEvent(started())).toEqual(started());
  expect(parseReasonAIEvent(delta(2, "line one\nline two"))).toEqual(delta(2, "line one\nline two"));
  expect(parseReasonAIEvent({ ...base("run-1", 2), type: "future.telemetry", privatePayload: "ignored" })).toEqual({
    ...base("run-1", 2),
    type: "protocol.unknown",
    eventType: "future.telemetry",
  });
  for (const invalid of [
    { ...started(), protocolVersion: 2 },
    { ...started(), runId: "" },
    { ...started(), seq: 0 },
    { ...started(), seq: -1 },
    { ...started(), seq: 1.5 },
  ]) expect(() => parseReasonAIEvent(invalid)).toThrow(ReasonAIProtocolError);
});

test("text deltas append by message and part while text.final becomes authoritative", () => {
  const state = apply([
    started(),
    delta(2, "Hel"),
    delta(3, "lo"),
    { ...base("run-1", 4), type: "tool.started", messageId: "message-1", toolCallId: "tool-1", toolName: "web_search", summary: "Searching" },
    delta(5, "After tool", "text-b"),
    { ...base("run-1", 6), type: "text.final", messageId: "message-1", partId: "text-a", text: "Hello." },
    delta(7, " ignored after final", "text-a"),
  ]);
  expect(state.messages).toHaveLength(1);
  expect(state.messages[0].parts).toEqual([
    { type: "text", partId: "text-a", text: "Hello.", finalized: true },
    { type: "tool", toolCallId: "tool-1", toolName: "web_search", status: "running", summary: "Searching" },
    { type: "text", partId: "text-b", text: "After tool", finalized: false },
  ]);
});

test("sequence, run, heartbeat, unknown-event and terminal protections are deterministic", () => {
  let state = apply([started(), delta(2, "kept")]);
  const beforeIgnored = state;
  expect(reduceReasonAIEvent(state, delta(2, "duplicate"))).toBe(state);
  expect(reduceReasonAIEvent(state, delta(1, "older"))).toBe(state);
  expect(reduceReasonAIEvent(state, { ...delta(3, "stale"), runId: "other-run" })).toBe(state);

  state = reduceReasonAIEvent(state, { ...base("run-1", 3), type: "run.heartbeat" });
  expect(state.lastSeq).toBe(3);
  expect(state.messages).toBe(beforeIgnored.messages);
  state = reduceReasonAIEvent(state, { ...base("run-1", 4), type: "protocol.unknown", eventType: "future.event" });
  expect(state.lastSeq).toBe(4);
  state = reduceReasonAIEvent(state, { ...base("run-1", 5), type: "run.completed" });
  expect(state).toMatchObject({ status: "completed", terminalEventReceived: true, lastSeq: 5 });
  expect(reduceReasonAIEvent(state, { ...base("run-1", 6), type: "run.failed", message: "late" })).toBe(state);
  expect(reduceReasonAIEvent(state, started("run-2", 1))).toBe(state);
});

test("tool, source and visual events update correlated parts without duplication", () => {
  const source = { sourceId: "source-1", title: "Documentation", url: "https://example.com/docs", kind: "documentation" };
  const state = apply([
    started(),
    { ...base("run-1", 2), type: "tool.started", messageId: "message-1", toolCallId: "tool-1", toolName: "web_search", summary: "Searching" },
    { ...base("run-1", 3), type: "tool.completed", messageId: "message-1", toolCallId: "tool-1", summary: "Found documentation" },
    { ...base("run-1", 4), type: "tool.started", messageId: "message-1", toolCallId: "tool-2", toolName: "web_extract" },
    { ...base("run-1", 5), type: "tool.failed", messageId: "message-1", toolCallId: "tool-2", summary: "Could not read page" },
    { ...base("run-1", 6), type: "sources.ready", messageId: "message-1", partId: "sources-1", sources: [source] },
    { ...base("run-1", 7), type: "visual.ready", messageId: "message-1", partId: "visual-1", data: { kind: "array" } },
  ]);
  expect(state.messages[0].parts).toEqual([
    { type: "tool", toolCallId: "tool-1", toolName: "web_search", status: "completed", summary: "Found documentation" },
    { type: "tool", toolCallId: "tool-2", toolName: "web_extract", status: "failed", summary: "Could not read page" },
    { type: "sources", partId: "sources-1", sources: [source] },
    { type: "visual", partId: "visual-1", data: { kind: "array" } },
  ]);
});

for (const status of ["applied", "discarded", "stale"] as const) {
  test(`artifact proposal can become ${status}`, () => {
    const state = apply([
      started(),
      {
        ...base("run-1", 2),
        type: "artifact.proposal",
        messageId: "message-1",
        partId: "artifact-1",
        proposalId: "proposal-1",
        data: { operations: [] },
        baseArtifactFingerprint: "sha256:future",
        touchedEntities: [{ entityType: "node", entityId: "node-1" }],
      },
      { ...base("run-1", 3), type: "artifact.status", messageId: "message-1", proposalId: "proposal-1", status },
    ]);
    expect(state.messages[0].parts[0]).toMatchObject({ type: "artifact", proposalId: "proposal-1", status });
  });
}

for (const terminal of ["run.completed", "run.failed", "run.cancelled"] as const) {
  test(`${terminal} is terminal and retains partial text`, () => {
    const terminalEvent: ReasonAIKnownEvent = terminal === "run.failed"
      ? { ...base("run-1", 3), type: terminal, code: "PROVIDER_ERROR", message: "Provider failed" }
      : { ...base("run-1", 3), type: terminal };
    const state = apply([started(), delta(2, "Partial answer"), terminalEvent]);
    expect(state.status).toBe(terminal.replace("run.", ""));
    expect(state.terminalEventReceived).toBe(true);
    expect(state.messages[0]).toMatchObject({
      status: terminal.replace("run.", ""),
      parts: [{ type: "text", text: "Partial answer" }],
    });
  });
}

test("NDJSON decoder handles one or many events, blank lines, CRLF and final lines without newline", () => {
  const decoder = new ReasonAINDJSONDecoder();
  const input = `\n${JSON.stringify(started())}\r\n${JSON.stringify(delta(2, "Hi"))}\n${JSON.stringify({ ...base("run-1", 3), type: "run.completed" })}`;
  expect(decoder.push(new TextEncoder().encode(input))).toEqual([started(), delta(2, "Hi")]);
  expect(decoder.finish()).toEqual([{ ...base("run-1", 3), type: "run.completed" }]);
});

test("NDJSON decoder handles events split across two and many chunks including split UTF-8", async () => {
  const events: ReasonAIKnownEvent[] = [started(), delta(2, "Hello 🌍"), { ...base("run-1", 3), type: "run.completed" }];
  const bytes = new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join("\n"));
  expect(await decode([bytes.slice(0, 25), bytes.slice(25)])).toEqual(events);
  expect(await decode(Array.from(bytes, (byte) => Uint8Array.of(byte)))).toEqual(events);
});

test("NDJSON decoder rejects malformed JSON, unsupported versions and bounded line or buffer overflow", () => {
  expect(() => new ReasonAINDJSONDecoder().push(new TextEncoder().encode("not-json\n"))).toThrow("malformed JSON");
  expect(() => new ReasonAINDJSONDecoder().push(new TextEncoder().encode(`${JSON.stringify({ ...started(), protocolVersion: 2 })}\n`))).toThrow("Unsupported");
  expect(() => new ReasonAINDJSONDecoder({ maxEventLineBytes: 20 }).push(new TextEncoder().encode(`${JSON.stringify(started())}\n`))).toThrow("event line exceeded");
  expect(() => new ReasonAINDJSONDecoder({ maxIncompleteBufferBytes: 8 }).push(new TextEncoder().encode('{"never":'))).toThrow("incomplete buffer exceeded");
});

test("unexpected EOF classifies the run as interrupted while preserving partial text", async () => {
  const bytes = new TextEncoder().encode(`${JSON.stringify(started())}\n${JSON.stringify(delta(2, "Still useful"))}`);
  const result = await consumeReasonAIStream(streamFromChunks([bytes]));
  expect(result.termination).toBe("interrupted");
  expect(result.state).toMatchObject({ status: "interrupted", terminalEventReceived: false });
  expect(result.state.messages[0]).toMatchObject({
    status: "interrupted",
    parts: [{ type: "text", text: "Still useful", finalized: false }],
  });
});

test("stream consumption distinguishes all terminal results", async () => {
  for (const terminal of ["run.completed", "run.failed", "run.cancelled"] as const) {
    const event = terminal === "run.failed"
      ? { ...base("run-1", 2), type: terminal, message: "Failed" }
      : { ...base("run-1", 2), type: terminal };
    const bytes = new TextEncoder().encode(`${JSON.stringify(started())}\n${JSON.stringify(event)}\n`);
    const result = await consumeReasonAIStream(streamFromChunks([bytes]));
    expect(result.termination).toBe(terminal.replace("run.", ""));
  }
});
