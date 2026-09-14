import "client-only";
import { getBrowserClient } from "@/lib/supabase/client";
import { createAuthenticatedReasonAIRequest, type ReasonAIEndpoint } from "./authenticated-request";

let request: ReturnType<typeof createAuthenticatedReasonAIRequest> | undefined;
export function fetchReasonAI(endpoint: ReasonAIEndpoint, body: string, signal?: AbortSignal) {
  request ??= createAuthenticatedReasonAIRequest(getBrowserClient().auth);
  return request(endpoint, body, signal);
}
