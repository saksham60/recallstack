import "server-only";
import { getReasonAIConfiguration } from "@/lib/config/server";
import { traceLLMResponse } from "./langsmith";

/** Shared Token Factory transport; surfaces supply their own bounded context and instructions. */
export function requestReasonAICompletion(body: Record<string, unknown>, signal: AbortSignal) {
  const { apiKey, baseUrl, model } = getReasonAIConfiguration();
  if (!apiKey) throw new Error("ReasonAI is currently unavailable.");
  const request = { model, ...body };
  return traceLLMResponse(request, () => fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST", cache: "no-store", redirect: "error", signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }), signal);
}
