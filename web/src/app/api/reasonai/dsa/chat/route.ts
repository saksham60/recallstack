import { isReasonAIDSAStreamingEnabled } from "@/lib/config/server";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import { DSAValidationError, parseDSATutorRequest } from "@/features/dsa/reasonai/contract";
import { dsaTutorProvider, DSATutorProviderError } from "@/features/dsa/reasonai/provider";
import { createReasonAINDJSONResponse, REASONAI_NDJSON_MEDIA_TYPE } from "@/lib/reasonai/runtime/response";
import { streamDSAEvents } from "@/lib/reasonai/server/dsa-stream";
import { prepareDSARun } from "@/lib/reasonai/server/persistence/dsa-run";
import { getReasonAIPersistenceRequestContext } from "@/lib/reasonai/server/persistence/request-context";
import { persistReasonAITranscript } from "@/lib/reasonai/server/persistence/stream";
import { ReasonAIPersistenceError } from "@/lib/reasonai/server/persistence/types";

export const runtime = "nodejs";
export const maxDuration = 65;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const acceptedAt = Date.now();
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  let persistenceContext;
  try {
    persistenceContext = await getReasonAIPersistenceRequestContext(request);
    if (persistenceContext instanceof Response) return persistenceContext;
  } catch { return reply({ error: "Session verification is temporarily unavailable. Please try again." }, 503); }
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Expected JSON." }, 415);
  let input;
  try { input = parseDSATutorRequest(await readBoundedJSON(request, 512 * 1024)); }
  catch (error) { return reply({ error: error instanceof DSAValidationError ? error.message : "Invalid or oversized request." }, 400); }
  const acceptsNDJSON = request.headers.get("accept")?.toLowerCase().split(",").some((value) => value.trim().startsWith(REASONAI_NDJSON_MEDIA_TYPE));
  if (isReasonAIDSAStreamingEnabled() && acceptsNDJSON) {
    if (!input.idempotencyKey) return reply({ error: "A valid idempotency key is required.", code: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
    try {
      const prepared = await prepareDSARun(persistenceContext.repository, persistenceContext.userId, input as typeof input & { idempotencyKey: string });
      const headers = {
        "X-ReasonAI-Conversation-Id": prepared.conversation.id,
        "X-ReasonAI-Run-Id": prepared.run.id,
      };
      if (prepared.kind === "active") {
        return reply({ error: "A ReasonAI response is already running for this conversation.", code: "RUN_IN_PROGRESS", conversationId: prepared.conversation.id, runId: prepared.run.id }, 409);
      }
      if (prepared.kind === "replay") {
        return Response.json({ conversationId: prepared.conversation.id, runId: prepared.run.id, status: prepared.run.status, replayed: true }, { headers: { ...headers, "Cache-Control": "no-store" } });
      }
      const events = streamDSAEvents(input, request.signal, acceptedAt, {
        runId: prepared.run.id,
        messageId: prepared.assistantMessageId,
      });
      const persisted = persistReasonAITranscript(
        persistenceContext.repository,
        persistenceContext.userId,
        prepared.conversation.id,
        prepared.run.id,
        events,
      );
      return createReasonAINDJSONResponse(persisted, { headers }, request.signal);
    } catch (error) {
      if (error instanceof ReasonAIPersistenceError && error.code === "NOT_FOUND") {
        return reply({ error: "Conversation not found.", code: "CONVERSATION_NOT_FOUND" }, 404);
      }
      return reply({ error: "Conversation history is temporarily unavailable.", code: "PERSISTENCE_UNAVAILABLE" }, 503);
    }
  }
  try { return reply(await dsaTutorProvider.complete(input, request.signal)); }
  catch (error) {
    return error instanceof DSATutorProviderError ? reply({ error: error.message }, error.status)
      : reply({ error: "ReasonAI is temporarily unavailable. Please try again." }, 502);
  }
}
