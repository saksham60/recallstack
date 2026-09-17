import { cookies } from "next/headers";
import { authenticateApiRequest } from "@/lib/supabase/api-auth";
import { isE2EAuthBypassEnabled, isSystemDesignEnabled } from "@/lib/config/server";
import { parseReasonAIRequest } from "@/features/system-design/reasonai/contract";
import { readBoundedJSON, reasonAIProvider, ReasonAIProviderError } from "@/features/system-design/reasonai/provider";

import { createReasonAITrace } from "@/features/system-design/reasonai/trace";

export const runtime = "nodejs";
export const maxDuration = 65;

export async function POST(request: Request) {
  const traceId = crypto.randomUUID(), trace = createReasonAITrace(traceId), started = Date.now();
  trace("REQUEST_RECEIVED", { status: "started" });
  const finish = (response: Response) => {
    response.headers.set("X-ReasonAI-Trace-Id", traceId);
    response.headers.set("Cache-Control", "no-store");
    trace("RESPONSE_SENT", { status: response.ok ? "success" : "failed", durationMs: Date.now() - started });
    return response;
  };
  const reply = (body: unknown, status = 200) => finish(Response.json(body, { status }));
  if (!isSystemDesignEnabled()) return reply({ error: "System Design is unavailable." }, 404);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  try {
    if (!(isE2EAuthBypassEnabled() && (await cookies()).has("e2e-bypass-auth"))) {
      const authError = await authenticateApiRequest(request);
      if (authError) return finish(authError);
    }
  } catch { return reply({ error: "Session verification is temporarily unavailable. Please try again." }, 503); }
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Expected JSON." }, 415);
  let input;
  try { input = parseReasonAIRequest(await readBoundedJSON(request, 512 * 1024)); }
  catch { return reply({ error: "Invalid request. Use a message up to 4,000 characters and an active diagram with at most 200 nodes and 400 connections." }, 400); }
  trace("REQUEST_VALIDATED", { status: "success" });
  try { return reply(await reasonAIProvider.complete(input, request.signal, traceId)); }
  catch (error) {
    return error instanceof ReasonAIProviderError
      ? reply({ error: error.message }, error.status)
      : reply({ error: "ReasonAI is temporarily unavailable. Please try again." }, 502);
  }
}
