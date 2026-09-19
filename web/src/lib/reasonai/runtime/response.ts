import type { ReasonAIKnownEvent } from "./events";
import { parseReasonAIEvent, ReasonAIProtocolError } from "./protocol";

export const REASONAI_NDJSON_MEDIA_TYPE = "application/x-ndjson";

const encoder = new TextEncoder();

/** Serializes one validated protocol event as exactly one NDJSON record. */
export function encodeReasonAIEvent(event: ReasonAIKnownEvent): Uint8Array {
  const parsed = parseReasonAIEvent(event);
  if (parsed.type === "protocol.unknown") {
    throw new ReasonAIProtocolError("ReasonAI server cannot emit an unknown event type.");
  }
  return encoder.encode(`${JSON.stringify(parsed)}\n`);
}

function asyncIteratorFor(
  source: AsyncIterable<ReasonAIKnownEvent> | Iterable<ReasonAIKnownEvent>,
): AsyncIterator<ReasonAIKnownEvent> {
  if (Symbol.asyncIterator in source) return source[Symbol.asyncIterator]();
  const iterator = source[Symbol.iterator]();
  return {
    next: async () => iterator.next(),
    return: iterator.return ? async (value) => iterator.return!(value) : undefined,
  };
}

/** Converts a pull-based event source into an encoded stream and forwards cancellation. */
export function createReasonAIEventStream(
  source: AsyncIterable<ReasonAIKnownEvent> | Iterable<ReasonAIKnownEvent>,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const iterator = asyncIteratorFor(source);
  let stopped = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

  const stopIterator = (reason?: unknown) => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener("abort", onAbort);
    void iterator.return?.(reason).catch(() => undefined);
  };
  const onAbort = () => {
    if (stopped) return;
    const reason = signal?.reason ?? new DOMException("The operation was aborted.", "AbortError");
    stopIterator(reason);
    streamController?.error(reason);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    },
    async pull(controller) {
      if (stopped) return;
      try {
        const result = await iterator.next();
        if (stopped) return;
        if (result.done) {
          stopped = true;
          signal?.removeEventListener("abort", onAbort);
          controller.close();
          return;
        }
        controller.enqueue(encodeReasonAIEvent(result.value));
      } catch (error) {
        if (stopped) return;
        stopped = true;
        signal?.removeEventListener("abort", onAbort);
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (stopped) return;
      stopped = true;
      signal?.removeEventListener("abort", onAbort);
      await iterator.return?.(reason);
    },
  });
}

/** Builds the standard no-store NDJSON response used by future streaming routes. */
export function createReasonAINDJSONResponse(
  source: AsyncIterable<ReasonAIKnownEvent> | Iterable<ReasonAIKnownEvent>,
  init: ResponseInit = {},
  signal?: AbortSignal,
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", `${REASONAI_NDJSON_MEDIA_TYPE}; charset=utf-8`);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(createReasonAIEventStream(source, signal), { ...init, headers });
}
