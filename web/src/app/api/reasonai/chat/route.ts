import { cookies } from "next/headers";
import { authenticateApiRequest } from "@/lib/supabase/api-auth";
import { isE2EAuthBypassEnabled, isReasonAISystemDesignStreamingEnabled, isSystemDesignEnabled } from "@/lib/config/server";
import { parseReasonAIRequest } from "@/features/system-design/reasonai/contract";
import { readBoundedJSON, reasonAIProvider, ReasonAIProviderError } from "@/features/system-design/reasonai/provider";
import { createReasonAITrace } from "@/features/system-design/reasonai/trace";
import { createReasonAINDJSONResponse, REASONAI_NDJSON_MEDIA_TYPE } from "@/lib/reasonai/runtime/response";
import { streamSystemDesignEvents } from "@/lib/reasonai/server/system-design-stream";
import { defaultSystemDesignDurableConversationState, parseSystemDesignDurableConversationState, type SystemDesignDurableConversationState } from "@/lib/reasonai/server/langgraph/system-design/state";
import { prepareSystemDesignRun, type PreparedSystemDesignRun } from "@/lib/reasonai/server/persistence/system-design-run";
import { getReasonAIPersistenceRequestContext } from "@/lib/reasonai/server/persistence/request-context";
import { persistReasonAITranscript } from "@/lib/reasonai/server/persistence/stream";
import { ReasonAIPersistenceError } from "@/lib/reasonai/server/persistence/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const traceId = crypto.randomUUID();
  const trace = createReasonAITrace(traceId);
  const started = Date.now();
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
  const acceptsNDJSON = request.headers.get("accept")?.toLowerCase().split(",").some((value) => value.trim().startsWith(REASONAI_NDJSON_MEDIA_TYPE));
  const streaming = isReasonAISystemDesignStreamingEnabled() && acceptsNDJSON;
  let persistenceContext: Awaited<ReturnType<typeof getReasonAIPersistenceRequestContext>> | undefined;
  try {
    if (streaming) {
      persistenceContext = await getReasonAIPersistenceRequestContext(request);
      if (persistenceContext instanceof Response) return finish(persistenceContext);
    } else if (!(isE2EAuthBypassEnabled() && (await cookies()).has("e2e-bypass-auth"))) {
      const authError = await authenticateApiRequest(request);
      if (authError) return finish(authError);
    }
  } catch {
    return reply({ error: "Session verification is temporarily unavailable. Please try again." }, 503);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Expected JSON." }, 415);
  let input;
  try { input = parseReasonAIRequest(await readBoundedJSON(request, 512 * 1024)); }
  catch { return reply({ error: "Invalid request. Use a message up to 4,000 characters and an active diagram with at most 200 nodes and 400 connections." }, 400); }
  trace("REQUEST_VALIDATED", { status: "success" });

  if (streaming && persistenceContext && !(persistenceContext instanceof Response)) {
    if (!input.idempotencyKey) return reply({ error: "A valid idempotency key is required.", code: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
    let prepared: PreparedSystemDesignRun | undefined;
    try {
      prepared = await prepareSystemDesignRun(
        persistenceContext.repository,
        persistenceContext.userId,
        input as typeof input & { idempotencyKey: string },
      );
      const headers = {
        "X-ReasonAI-Conversation-Id": prepared.conversation.id,
        "X-ReasonAI-Run-Id": prepared.run.id,
        "X-ReasonAI-Trace-Id": traceId,
      };
      if (prepared.kind === "active") {
        return reply({ error: "A ReasonAI response is already running for this conversation.", code: "RUN_IN_PROGRESS", conversationId: prepared.conversation.id, runId: prepared.run.id }, 409);
      }
      if (prepared.kind === "replay") {
        return finish(Response.json({ conversationId: prepared.conversation.id, runId: prepared.run.id, status: prepared.run.status, replayed: true }, { headers }));
      }
      let durableState: SystemDesignDurableConversationState;
      try {
        const persistedState = await persistenceContext.repository.getConversationState(persistenceContext.userId, prepared.conversation.id);
        durableState = persistedState ? parseSystemDesignDurableConversationState(persistedState.state) : defaultSystemDesignDurableConversationState();
      } catch (error) {
        if (error instanceof ReasonAIPersistenceError) throw error;
        throw new ReasonAIPersistenceError("STATE_INVALID", "Conversation state is invalid.");
      }
      let nextConversationState: SystemDesignDurableConversationState | undefined;
      const events = streamSystemDesignEvents(input, request.signal, {
        durableState,
        runId: prepared.run.id,
        messageId: prepared.assistantMessageId,
        onConversationState: (state) => { nextConversationState = state; },
      });
      const persistedStream = persistReasonAITranscript(
        persistenceContext.repository,
        persistenceContext.userId,
        prepared.conversation.id,
        prepared.run.id,
        events,
        undefined,
        () => nextConversationState,
      );
      return createReasonAINDJSONResponse(persistedStream, { headers }, request.signal);
    } catch (error) {
      if (prepared?.kind === "acquired") {
        try {
          await persistenceContext.repository.finalizeRun(persistenceContext.userId, prepared.conversation.id, prepared.run.id, {
            status: "failed",
            lastSeq: 0,
            errorCode: error instanceof ReasonAIPersistenceError ? error.code : "STATE_UNAVAILABLE",
          });
        } catch (finalizeError) {
          console.error("[SYSTEM_DESIGN_V2_LIFECYCLE]", { runId: prepared.run.id, stage: "run.finalize_failed", category: finalizeError instanceof Error ? finalizeError.name : "unknown" });
        }
      }
      if (error instanceof ReasonAIPersistenceError && error.code === "NOT_FOUND") return reply({ error: "Conversation not found.", code: "CONVERSATION_NOT_FOUND" }, 404);
      console.error("[SYSTEM_DESIGN_V2_UNAVAILABLE]", { category: error instanceof Error ? error.name : "unknown" });
      return reply({
        error: "Conversation state is temporarily unavailable.",
        code: error instanceof ReasonAIPersistenceError && error.code === "STATE_INVALID" ? "STATE_INVALID" : "STATE_UNAVAILABLE",
      }, 503);
    }
  }

  try { return reply(await reasonAIProvider.complete(input, request.signal, traceId)); }
  catch (error) {
    return error instanceof ReasonAIProviderError
      ? reply({ error: error.message }, error.status)
      : reply({ error: "ReasonAI is temporarily unavailable. Please try again." }, 502);
  }
}
