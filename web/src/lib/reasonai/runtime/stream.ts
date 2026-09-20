import type { ReasonAIEvent } from "./events";
import { parseReasonAIEvent, ReasonAIProtocolError } from "./protocol";
import {
  createReasonAIRuntimeState,
  interruptReasonAIRun,
  reduceReasonAIEvent,
} from "./reducer";
import type { ReasonAIRuntimeState } from "./types";

export const MAX_EVENT_LINE_BYTES = 512 * 1024;
export const MAX_INCOMPLETE_BUFFER_BYTES = 512 * 1024;

export interface ReasonAINDJSONDecoderOptions {
  maxEventLineBytes?: number;
  maxIncompleteBufferBytes?: number;
}

export class ReasonAINDJSONDecoder {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly encoder = new TextEncoder();
  private readonly maxEventLineBytes: number;
  private readonly maxIncompleteBufferBytes: number;
  private buffer = "";
  private finished = false;

  constructor(options: ReasonAINDJSONDecoderOptions = {}) {
    this.maxEventLineBytes = positiveLimit(options.maxEventLineBytes ?? MAX_EVENT_LINE_BYTES, "maxEventLineBytes");
    this.maxIncompleteBufferBytes = positiveLimit(options.maxIncompleteBufferBytes ?? MAX_INCOMPLETE_BUFFER_BYTES, "maxIncompleteBufferBytes");
  }

  push(chunk: Uint8Array): ReasonAIEvent[] {
    if (this.finished) throw new ReasonAIProtocolError("ReasonAI stream decoder is already finished.");
    try {
      this.buffer += this.decoder.decode(chunk, { stream: true });
    } catch {
      throw new ReasonAIProtocolError("ReasonAI stream contains invalid UTF-8.");
    }
    return this.drain(false);
  }

  finish(): ReasonAIEvent[] {
    if (this.finished) return [];
    this.finished = true;
    try {
      this.buffer += this.decoder.decode();
    } catch {
      throw new ReasonAIProtocolError("ReasonAI stream contains invalid UTF-8.");
    }
    return this.drain(true);
  }

  private drain(final: boolean): ReasonAIEvent[] {
    const events: ReasonAIEvent[] = [];
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.trim()) events.push(this.parseLine(line));
      newlineIndex = this.buffer.indexOf("\n");
    }

    if (final && this.buffer.trim()) {
      const line = this.buffer.replace(/\r$/, "");
      this.buffer = "";
      events.push(this.parseLine(line));
    }

    if (this.byteLength(this.buffer) > this.maxIncompleteBufferBytes) {
      this.buffer = "";
      throw new ReasonAIProtocolError("ReasonAI stream incomplete buffer exceeded its limit.");
    }
    return events;
  }

  private parseLine(line: string): ReasonAIEvent {
    if (this.byteLength(line) > this.maxEventLineBytes) {
      throw new ReasonAIProtocolError("ReasonAI stream event line exceeded its limit.");
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new ReasonAIProtocolError("ReasonAI stream contains malformed JSON.");
    }
    return parseReasonAIEvent(value);
  }

  private byteLength(value: string): number {
    return this.encoder.encode(value).byteLength;
  }
}

function positiveLimit(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer.`);
  return value;
}

export async function* decodeReasonAIStream(
  stream: ReadableStream<Uint8Array>,
  options: ReasonAINDJSONDecoderOptions = {},
): AsyncGenerator<ReasonAIEvent> {
  const decoder = new ReasonAINDJSONDecoder(options);
  const reader = stream.getReader();
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of decoder.push(value)) yield event;
    }
    for (const event of decoder.finish()) yield event;
    completed = true;
  } finally {
    if (!completed) {
      try { await reader.cancel(); }
      catch (error) {
        console.error("[REASONAI_NDJSON_READER_CLEANUP_FAILED]", {
          category: error instanceof Error ? error.name : "unknown",
        });
      }
    }
    reader.releaseLock();
  }
}

export type ReasonAIStreamTermination = "completed" | "failed" | "cancelled" | "interrupted";

export interface ReasonAIStreamResult {
  state: ReasonAIRuntimeState;
  termination: ReasonAIStreamTermination;
}

export async function consumeReasonAIStream(
  stream: ReadableStream<Uint8Array>,
  initialState: ReasonAIRuntimeState = createReasonAIRuntimeState(),
  options: ReasonAINDJSONDecoderOptions = {},
): Promise<ReasonAIStreamResult> {
  let state = initialState;
  for await (const event of decodeReasonAIStream(stream, options)) {
    state = reduceReasonAIEvent(state, event);
  }
  state = interruptReasonAIRun(state);
  const termination: ReasonAIStreamTermination =
    state.status === "completed" || state.status === "failed" || state.status === "cancelled"
      ? state.status
      : "interrupted";
  return { state, termination };
}

export const NDJSONDecoder = ReasonAINDJSONDecoder;
