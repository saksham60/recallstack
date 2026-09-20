import "server-only";

export const MAX_PROVIDER_SSE_FRAME_BYTES = 256 * 1024;
export const MAX_PROVIDER_SSE_BUFFER_BYTES = 256 * 1024;
export const PROVIDER_FIRST_EVENT_TIMEOUT_MS = 30_000;
export const PROVIDER_IDLE_STREAM_TIMEOUT_MS = 30_000;

export class DSAProviderStreamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "DSAProviderStreamError";
  }
}

export interface TokenFactoryStreamChoice {
  delta?: {
    content?: unknown;
    reasoning_content?: unknown;
    tool_calls?: unknown;
  };
  finish_reason?: unknown;
}

export interface TokenFactoryStreamFrame {
  choices?: TokenFactoryStreamChoice[];
  error?: unknown;
}

export interface ProviderStreamTimeouts {
  firstEventMs?: number;
  idleMs?: number;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseFrame(frame: string): TokenFactoryStreamFrame | "done" | undefined {
  const data = frame
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /u, ""))
    .join("\n");
  if (!data) return;
  if (data === "[DONE]") return "done";
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as TokenFactoryStreamFrame;
  } catch {
    throw new DSAProviderStreamError("ReasonAI provider returned a malformed stream.");
  }
}

/** Bounded, UTF-8-safe decoder for OpenAI-compatible SSE responses. */
export async function* decodeTokenFactorySSE(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  timeouts: ProviderStreamTimeouts = {},
): AsyncGenerator<TokenFactoryStreamFrame> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const reader = stream.getReader();
  let buffer = "";
  let doneFrame = false;
  let completed = false;
  let receivedChunk = false;
  try {
    while (true) {
      signal?.throwIfAborted();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutMs = receivedChunk
        ? timeouts.idleMs ?? PROVIDER_IDLE_STREAM_TIMEOUT_MS
        : timeouts.firstEventMs ?? PROVIDER_FIRST_EVENT_TIMEOUT_MS;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DSAProviderStreamError(receivedChunk
          ? "ReasonAI provider stream became idle."
          : "ReasonAI provider did not start streaming in time.")), timeoutMs);
      });
      let result: ReadableStreamReadResult<Uint8Array>;
      try { result = await Promise.race([reader.read(), timeout]); }
      finally { if (timer) clearTimeout(timer); }
      const { done, value } = result;
      if (done) break;
      receivedChunk = true;
      try { buffer += decoder.decode(value, { stream: true }); }
      catch { throw new DSAProviderStreamError("ReasonAI provider returned invalid UTF-8."); }
      if (byteLength(buffer) > MAX_PROVIDER_SSE_BUFFER_BYTES) {
        throw new DSAProviderStreamError("ReasonAI provider stream buffer exceeded its limit.");
      }
      let boundary = buffer.search(/\r?\n\r?\n/u);
      while (boundary >= 0) {
        const separator = buffer.startsWith("\r\n\r\n", boundary) ? 4 : 2;
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + separator);
        if (byteLength(frame) > MAX_PROVIDER_SSE_FRAME_BYTES) {
          throw new DSAProviderStreamError("ReasonAI provider stream frame exceeded its limit.");
        }
        const parsed = parseFrame(frame);
        if (parsed === "done") { doneFrame = true; break; }
        if (parsed) yield parsed;
        boundary = buffer.search(/\r?\n\r?\n/u);
      }
      if (doneFrame) break;
    }
    try { buffer += decoder.decode(); }
    catch { throw new DSAProviderStreamError("ReasonAI provider returned invalid UTF-8."); }
    if (!doneFrame) {
      const parsed = buffer.trim() ? parseFrame(buffer) : undefined;
      if (parsed === "done") doneFrame = true;
      else if (parsed) yield parsed;
    }
    if (!doneFrame) throw new DSAProviderStreamError("ReasonAI provider stream ended unexpectedly.");
    completed = true;
  } finally {
    if (!completed) {
      try { await reader.cancel(); }
      catch (error) {
        console.error("[DSA_PROVIDER_STREAM_CLEANUP_FAILED]", {
          category: error instanceof Error ? error.name : "unknown",
        });
      }
    }
    reader.releaseLock();
  }
}
