import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { Client } from "langsmith";
import { RunTree } from "langsmith/run_trees";
import { getReasonAIConfiguration, getTavilyConfiguration } from "@/lib/config/server";

const activeRun = new AsyncLocalStorage<RunTree>();
const pending = new Set<Promise<unknown>>();
let client: Client | undefined;

export function isLangSmithEnabled() {
  return process.env.LANGSMITH_TRACING === "true" && Boolean(process.env.LANGSMITH_API_KEY);
}

function langSmithProject() {
  return process.env.LANGSMITH_PROJECT?.trim() || "default";
}

function smithClient() {
  return client ??= new Client({
    apiKey: process.env.LANGSMITH_API_KEY,
    ...(process.env.LANGSMITH_ENDPOINT ? { apiUrl: process.env.LANGSMITH_ENDPOINT } : {}),
    ...(process.env.LANGSMITH_WORKSPACE_ID ? { workspaceId: process.env.LANGSMITH_WORKSPACE_ID } : {}),
  });
}

function redact(value: string) {
  let result = value;
  for (const secret of [getReasonAIConfiguration().apiKey, getTavilyConfiguration().apiKey, process.env.LANGSMITH_API_KEY]) {
    if (secret) result = result.replaceAll(secret, "[redacted]");
  }
  return result.replace(/\b(?:Bearer\s+\S+|(?:tvly-|sk-|ghp_|github_pat_)[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/giu, "[redacted]")
    .replace(/\b(api[_ -]?key|password|secret|access[_ -]?token)\s*[:=]\s*[^\s,;]+/giu, "$1=[redacted]");
}

function safe(value: unknown, maxString = Infinity): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === "string" ? redact(item).slice(0, maxString) : item));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { value: parsed };
  } catch { return { value: "[unserializable]" }; }
}

function errorSummary(error: unknown) {
  return error instanceof Error
    ? { errorName: error.name, message: redact(error.message).slice(0, 500) }
    : { errorName: "unknown" };
}

function track(task: Promise<unknown>, operation: "post" | "patch") {
  const quiet = task.catch((error) => {
    console.error("langsmith.trace.failed", {
      operation,
      project: langSmithProject(),
      ...errorSummary(error),
    });
    return undefined;
  }).finally(() => pending.delete(quiet));
  pending.add(quiet);
}

function start(name: string, runType: "chain" | "llm" | "tool", inputs: unknown, metadata: Record<string, unknown> = {}) {
  if (!isLangSmithEnabled()) return undefined;
  const parent = activeRun.getStore();
  const run = parent
    ? parent.createChild({ name, run_type: runType, inputs: safe(inputs, runType === "tool" ? 4_000 : Infinity), metadata: safe(metadata) })
    : new RunTree({
        name,
        run_type: runType,
        inputs: safe(inputs, runType === "tool" ? 4_000 : Infinity),
        metadata: safe(metadata),
        project_name: langSmithProject(),
        client: smithClient(),
      });
  const posted = run.postRun();
  track(posted, "post");
  return {
    run,
    finish(outputs: unknown, error?: string) {
      track(posted.then(async () => {
        await run.end(safe(outputs, runType === "tool" ? 4_000 : Infinity), error);
        await run.patchRun();
      }), "patch");
    },
  };
}

/** Flush after the HTTP response; telemetry is never on the token path. */
export async function flushLangSmith() {
  if (!client) {
    if (isLangSmithEnabled()) console.info("langsmith.flush.skipped", { project: langSmithProject(), reason: "client_not_initialized" });
    return;
  }
  const pendingCount = pending.size;
  await Promise.allSettled([...pending]);
  try {
    await client.flush();
    console.info("langsmith.flush.completed", { project: langSmithProject(), pendingCount });
  } catch (error) {
    console.error("langsmith.flush.failed", { project: langSmithProject(), ...errorSummary(error) });
  }
}

export async function traceTurn<T>(name: string, input: unknown, metadata: Record<string, unknown>, execute: () => Promise<T>): Promise<T> {
  const span = start(name, "chain", input, metadata);
  if (!span) return execute();
  return activeRun.run(span.run, async () => {
    try {
      const result = await execute();
      span.finish({ result });
      return result;
    } catch (error) {
      span.finish({ status: "failed" }, error instanceof Error ? error.name : "unknown");
      throw error;
    }
  });
}

export async function* traceTurnStream<T extends { type?: string }>(name: string, input: unknown, metadata: Record<string, unknown>, source: AsyncIterable<T>): AsyncGenerator<T> {
  const span = start(name, "chain", input, metadata);
  if (!span) { yield* source; return; }
  const iterator = source[Symbol.asyncIterator]();
  let status = "cancelled";
  let failure: string | undefined;
  let drained = false;
  try {
    while (true) {
      const next = await activeRun.run(span.run, () => iterator.next());
      if (next.done) { drained = true; break; }
      if (next.value.type === "run.completed") status = "completed";
      if (next.value.type === "run.failed" || next.value.type === "run.cancelled") status = next.value.type;
      yield next.value;
    }
  } catch (error) {
    status = "failed";
    failure = error instanceof Error ? error.name : "unknown";
    throw error;
  } finally {
    if (!drained) {
      try { await activeRun.run(span.run, () => iterator.return?.()); } catch { /* Preserve the original stream outcome. */ }
    }
    span.finish({ status }, failure);
  }
}

export async function traceTool<T>(name: string, input: unknown, execute: () => Promise<T>): Promise<T> {
  const span = start(name, "tool", input);
  if (!span) return execute();
  return activeRun.run(span.run, async () => {
    try {
      const result = await execute();
      span.finish({ result });
      return result;
    } catch (error) {
      span.finish({ status: "failed" }, error instanceof Error ? error.name : "unknown");
      throw error;
    }
  });
}

/** Capture the actual provider request and its consumed response without buffering the user stream. */
export async function traceLLMResponse(body: Record<string, unknown>, execute: () => Promise<Response>, signal?: AbortSignal): Promise<Response> {
  const span = start("nebius.chat.completions", "llm", { messages: body.messages, tools: body.tools, tool_choice: body.tool_choice }, {
    model: body.model, temperature: body.temperature, max_tokens: body.max_tokens, stream: body.stream,
  });
  if (!span) return execute();
  let response: Response;
  try { response = await execute(); }
  catch (error) {
    span.finish({ status: "request_failed" }, error instanceof Error ? error.name : "unknown");
    throw error;
  }
  if (!response.ok || !response.body) {
    span.finish({ httpStatus: response.status }, response.ok ? "missing_body" : `http_${response.status}`);
    return response;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const streaming = response.headers.get("content-type")?.includes("text/event-stream") ?? false;
  let raw = "", lineBuffer = "", content = "", finishReason: unknown, usage: unknown;
  const calls = new Map<number, { name: string; arguments: string }>();
  let finished = false;
  const append = (value: string) => { content = (content + value).slice(0, 24_000); };
  const frame = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const value = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown; tool_calls?: Array<{ index?: number; function?: { name?: string; arguments?: string } }> }; finish_reason?: unknown }>; usage?: unknown };
      const choice = value.choices?.[0];
      if (typeof choice?.delta?.content === "string") append(choice.delta.content);
      for (const call of choice?.delta?.tool_calls ?? []) {
        const index = call.index ?? 0, current = calls.get(index) ?? { name: "", arguments: "" };
        if (call.function?.name) current.name += call.function.name;
        if (call.function?.arguments) current.arguments = (current.arguments + call.function.arguments).slice(0, 12_000);
        calls.set(index, current);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (value.usage) usage = value.usage;
    } catch { /* Invalid provider frames remain the caller's error to handle. */ }
  };
  const collect = (chunk: Uint8Array) => {
    const text = decoder.decode(chunk, { stream: true });
    if (!streaming) { raw = (raw + text).slice(0, 256_000); return; }
    lineBuffer += text;
    let end: number;
    while ((end = lineBuffer.indexOf("\n")) >= 0) {
      frame(lineBuffer.slice(0, end).replace(/\r$/u, ""));
      lineBuffer = lineBuffer.slice(end + 1);
    }
    if (lineBuffer.length > 128_000) lineBuffer = "";
  };
  const finish = (error?: string) => {
    if (finished) return;
    finished = true;
    signal?.removeEventListener("abort", onAbort);
    if (streaming) frame(lineBuffer);
    else {
      try {
        const value = JSON.parse(raw) as { choices?: Array<{ message?: { content?: unknown; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> }; finish_reason?: unknown }>; usage?: unknown };
        const choice = value.choices?.[0];
        if (typeof choice?.message?.content === "string") append(choice.message.content);
        choice?.message?.tool_calls?.forEach((call, index) => calls.set(index, { name: call.function?.name ?? "", arguments: call.function?.arguments ?? "" }));
        finishReason = choice?.finish_reason;
        usage = value.usage;
      } catch { /* The caller validates malformed provider JSON. */ }
    }
    span.finish({ content, tool_calls: [...calls.values()], finish_reason: finishReason, usage, httpStatus: response.status }, error);
  };
  const onAbort = () => finish("aborted");
  signal?.addEventListener("abort", onAbort, { once: true });
  return new Response(new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const item = await reader.read();
        if (item.done) { finish(); controller.close(); return; }
        collect(item.value);
        controller.enqueue(item.value);
      } catch (error) {
        finish(error instanceof Error ? error.name : "stream_error");
        controller.error(error);
      }
    },
    async cancel(reason) { try { await reader.cancel(reason); } finally { finish("cancelled"); } },
  }), { status: response.status, statusText: response.statusText, headers: response.headers });
}
