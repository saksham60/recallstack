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

/**
 * Pumps one source iterator for the lifetime of the response. A single pull
 * owns the pump, so server-side terminal work continues after text.final even
 * when the client never asks for another chunk.
 */
export function createReasonAIEventStream(
  source: AsyncIterable<ReasonAIKnownEvent> | Iterable<ReasonAIKnownEvent>,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const iterator = asyncIteratorFor(source);
  let stopped = false;
  let closePromise: Promise<void> | undefined;
  let pumpPromise: Promise<void> | undefined;
  let abortReason: unknown;
  let notifyAbort: (() => void) | undefined;
  const aborted = new Promise<void>((resolve) => { notifyAbort = resolve; });

  const closeIterator = (reason?: unknown): Promise<void> => {
    if (closePromise) return closePromise;
    stopped = true;
    signal?.removeEventListener("abort", onAbort);
    closePromise = (async () => {
      try { await iterator.return?.(reason); }
      catch (error) {
        console.error("[REASONAI_STREAM_CLEANUP_FAILED]", {
          stage: "iterator.return",
          category: error instanceof Error ? error.name : "unknown",
        });
      }
    })();
    return closePromise;
  };
  const onAbort = () => {
    abortReason = signal?.reason ?? new DOMException("The operation was aborted.", "AbortError");
    notifyAbort?.();
  };

  const pump = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    try {
      while (!stopped) {
        const next = iterator.next();
        const result = await Promise.race([
          next.then((value) => ({ kind: "next" as const, value })),
          aborted.then(() => ({ kind: "abort" as const })),
        ]);
        if (result.kind === "abort") throw abortReason;
        if (stopped) return;
        if (result.value.done) {
          stopped = true;
          signal?.removeEventListener("abort", onAbort);
          controller.close();
          return;
        }
        controller.enqueue(encodeReasonAIEvent(result.value.value));
      }
    } catch (error) {
      if (!stopped) controller.error(error);
      await closeIterator(error);
    }
  };

  return new ReadableStream<Uint8Array>({
    start() {
      if (signal?.aborted) onAbort();
      else signal?.addEventListener("abort", onAbort, { once: true });
    },
    pull(controller) {
      if (!pumpPromise) pumpPromise = pump(controller);
      return pumpPromise;
    },
    async cancel(reason) {
      notifyAbort?.();
      await closeIterator(reason);
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
