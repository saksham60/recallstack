import { expect, test } from "@playwright/test";
import { createAuthenticatedReasonAIRequest } from "../src/lib/reasonai/authenticated-request";
import type { ReasonAIKnownEvent } from "../src/lib/reasonai/runtime/events";
import { ReasonAIProtocolError } from "../src/lib/reasonai/runtime/protocol";
import {
  createReasonAINDJSONResponse,
  encodeReasonAIEvent,
} from "../src/lib/reasonai/runtime/response";
import {
  requestReasonAIEventStream,
  ReasonAIStreamResponseError,
} from "../src/lib/reasonai/streaming-client";
import { createControlledAsyncSource } from "./helpers/controlled-async-source";

const endpoint = "/api/reasonai/chat";
const session = (token: string | null) => ({
  data: { session: token ? { access_token: token } : null },
  error: null,
});
const base = (seq: number) => ({ protocolVersion: 1 as const, runId: "run-transport", seq });
const started = (): ReasonAIKnownEvent => ({ ...base(1), type: "run.started" });
const delta = (): ReasonAIKnownEvent => ({
  ...base(2),
  type: "text.delta",
  messageId: "message-1",
  partId: "text-1",
  delta: "first line\nsecond line",
});
const completed = (): ReasonAIKnownEvent => ({ ...base(3), type: "run.completed" });

test("NDJSON response helper validates events and applies safe streaming headers", async () => {
  const response = createReasonAINDJSONResponse([started(), delta(), completed()], {
    headers: { "X-Trace-Id": "trace-1", "Cache-Control": "public" },
  });

  expect(response.headers.get("Content-Type")).toBe("application/x-ndjson; charset=utf-8");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("X-Trace-Id")).toBe("trace-1");
  const lines = (await response.text()).trimEnd().split("\n");
  expect(lines).toHaveLength(3);
  expect(lines.map((line) => JSON.parse(line).type)).toEqual([
    "run.started",
    "text.delta",
    "run.completed",
  ]);
  expect(JSON.parse(lines[1]).delta).toBe("first line\nsecond line");

  expect(() => encodeReasonAIEvent({ ...started(), seq: 0 })).toThrow(ReasonAIProtocolError);
});

test("authenticated transport yields controlled events before the response closes", async () => {
  const source = createControlledAsyncSource<ReasonAIKnownEvent>();
  let requestInit: RequestInit | undefined;
  const authenticatedRequest = createAuthenticatedReasonAIRequest(
    { getSession: async () => session("access-token"), refreshSession: async () => session("unused") },
    async (_url, init) => {
      requestInit = init;
      return createReasonAINDJSONResponse(source);
    },
  );
  const stream = requestReasonAIEventStream(authenticatedRequest, endpoint, '{"message":"hello"}');

  const first = stream.next();
  source.emit(started());
  await expect(first).resolves.toEqual({ done: false, value: started() });
  expect(new Headers(requestInit?.headers).get("Authorization")).toBe("Bearer access-token");
  expect(new Headers(requestInit?.headers).get("Accept")).toBe("application/x-ndjson");
  expect(requestInit?.body).toBe('{"message":"hello"}');

  const second = stream.next();
  let secondSettled = false;
  void second.finally(() => { secondSettled = true; });
  await Promise.resolve();
  expect(secondSettled).toBe(false);
  source.emit(delta());
  await expect(second).resolves.toEqual({ done: false, value: delta() });

  const third = stream.next();
  source.emit(completed());
  await expect(third).resolves.toEqual({ done: false, value: completed() });
  source.close();
  await expect(stream.next()).resolves.toEqual({ done: true, value: undefined });
});

test("streaming requests retain the single-refresh authenticated retry", async () => {
  let calls = 0;
  let refreshes = 0;
  const accepts: Array<string | null> = [];
  const authenticatedRequest = createAuthenticatedReasonAIRequest(
    {
      getSession: async () => session("expired"),
      refreshSession: async () => { refreshes += 1; return session("fresh"); },
    },
    async (_url, init) => {
      calls += 1;
      accepts.push(new Headers(init?.headers).get("Accept"));
      return calls === 1
        ? new Response(null, { status: 401 })
        : createReasonAINDJSONResponse([started(), completed()]);
    },
  );

  const received: ReasonAIKnownEvent[] = [];
  for await (const event of requestReasonAIEventStream(authenticatedRequest, endpoint, "{}")) {
    if (event.type !== "protocol.unknown") received.push(event);
  }
  expect(received.map((event) => event.type)).toEqual(["run.started", "run.completed"]);
  expect({ calls, refreshes, accepts }).toEqual({
    calls: 2,
    refreshes: 1,
    accepts: ["application/x-ndjson", "application/x-ndjson"],
  });
});

test("transport rejects HTTP and media-type mismatches without exposing response bodies", async () => {
  const httpStream = requestReasonAIEventStream(
    async () => new Response("private upstream detail", { status: 502 }),
    endpoint,
    "{}",
  );
  await expect(httpStream.next()).rejects.toMatchObject({
    name: "ReasonAIStreamResponseError",
    message: "ReasonAI stream request failed.",
    status: 502,
  });

  const jsonStream = requestReasonAIEventStream(
    async () => Response.json({ answer: "legacy" }),
    endpoint,
    "{}",
  );
  await expect(jsonStream.next()).rejects.toEqual(expect.any(ReasonAIStreamResponseError));

  const emptyStream = requestReasonAIEventStream(
    async () => new Response(null, { headers: { "Content-Type": "application/x-ndjson" } }),
    endpoint,
    "{}",
  );
  await expect(emptyStream.next()).rejects.toThrow("did not include a body");
});

test("consumer cancellation and abort propagate to a controlled server source", async () => {
  const cancelledSource = createControlledAsyncSource<ReasonAIKnownEvent>();
  const cancelledStream = requestReasonAIEventStream(
    async () => createReasonAINDJSONResponse(cancelledSource),
    endpoint,
    "{}",
  );
  const first = cancelledStream.next();
  cancelledSource.emit(started());
  await first;
  await cancelledStream.return(undefined);
  expect(cancelledSource.cancelled).toBe(true);

  const abortedSource = createControlledAsyncSource<ReasonAIKnownEvent>();
  const controller = new AbortController();
  const abortedStream = requestReasonAIEventStream(
    async () => createReasonAINDJSONResponse(abortedSource, {}, controller.signal),
    endpoint,
    "{}",
    controller.signal,
  );
  const pending = abortedStream.next();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(abortedSource.cancelled).toBe(true);
});

test("server source failures remain stream failures", async () => {
  const source = createControlledAsyncSource<ReasonAIKnownEvent>();
  const stream = requestReasonAIEventStream(
    async () => createReasonAINDJSONResponse(source),
    endpoint,
    "{}",
  );
  const pending = stream.next();
  source.fail(new Error("controlled failure"));
  await expect(pending).rejects.toThrow("controlled failure");
});

test("ReadableStream cancellation awaits async iterator return", async () => {
  let returned = false;
  let releaseReturn!: () => void;
  const returnGate = new Promise<void>((resolve) => { releaseReturn = resolve; });
  let calls = 0;
  const source: AsyncIterable<ReasonAIKnownEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => calls++ === 0 ? { done: false, value: started() } : new Promise(() => undefined),
        return: async () => {
          await returnGate;
          returned = true;
          return { done: true, value: undefined };
        },
      };
    },
  };
  const reader = createReasonAINDJSONResponse(source).body!.getReader();
  await reader.read();
  const cancelling = reader.cancel("test cancellation");
  await Promise.resolve();
  expect(returned).toBe(false);
  releaseReturn();
  await cancelling;
  expect(returned).toBe(true);
});

test("iterator return failures are contained and do not hang cancellation", async () => {
  let calls = 0;
  const source: AsyncIterable<ReasonAIKnownEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => calls++ === 0 ? { done: false, value: started() } : new Promise(() => undefined),
        return: async () => { throw new Error("controlled cleanup failure"); },
      };
    },
  };
  const original = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    const reader = createReasonAINDJSONResponse(source).body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(errors.some((args) => args[0] === "[REASONAI_STREAM_CLEANUP_FAILED]")).toBe(true);
  } finally {
    console.error = original;
  }
});
