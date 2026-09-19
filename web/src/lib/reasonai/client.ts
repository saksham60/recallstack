import "client-only";
import { getBrowserClient } from "@/lib/supabase/client";
import { createAuthenticatedReasonAIFetch, createAuthenticatedReasonAIRequest, type ReasonAIEndpoint, type ReasonAIResourceEndpoint } from "./authenticated-request";
import type { ReasonAINDJSONDecoderOptions } from "./runtime/stream";
import { requestReasonAIEventStream } from "./streaming-client";

let request: ReturnType<typeof createAuthenticatedReasonAIRequest> | undefined;
let resourceRequest: ReturnType<typeof createAuthenticatedReasonAIFetch> | undefined;
export function fetchReasonAI(endpoint: ReasonAIEndpoint, body: string, signal?: AbortSignal) {
  request ??= createAuthenticatedReasonAIRequest(getBrowserClient().auth);
  return request(endpoint, body, signal);
}

/** Opens a negotiated stream request while leaving response decoding to the caller. */
export function fetchReasonAIStreamResponse(endpoint: ReasonAIEndpoint, body: string, signal?: AbortSignal) {
  request ??= createAuthenticatedReasonAIRequest(getBrowserClient().auth);
  return request(endpoint, body, signal, "application/x-ndjson");
}

/** Incremental authenticated transport for ReasonAI V1 event streams. */
export function streamReasonAI(
  endpoint: ReasonAIEndpoint,
  body: string,
  signal?: AbortSignal,
  decoderOptions?: ReasonAINDJSONDecoderOptions,
) {
  request ??= createAuthenticatedReasonAIRequest(getBrowserClient().auth);
  return requestReasonAIEventStream(request, endpoint, body, signal, decoderOptions);
}

function fetchReasonAIResource(endpoint: ReasonAIResourceEndpoint, init: RequestInit, signal?: AbortSignal) {
  resourceRequest ??= createAuthenticatedReasonAIFetch(getBrowserClient().auth);
  return resourceRequest(endpoint, init, signal);
}

export function fetchReasonAIConversation(conversationId: string, signal?: AbortSignal) {
  return fetchReasonAIResource(`/api/reasonai/conversations/${conversationId}`, { method: "GET" }, signal);
}

export function cancelReasonAIRun(conversationId: string, runId: string) {
  return fetchReasonAIResource(`/api/reasonai/conversations/${conversationId}/runs/${runId}/cancel`, { method: "POST" });
}
