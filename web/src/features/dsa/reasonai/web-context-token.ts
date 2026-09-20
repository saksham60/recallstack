import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getReasonAIConfiguration } from "@/lib/config/server";
import type { DSAProblemContext } from "./contract";
import type { WebContext } from "./web-context";

const LIFETIME = 15 * 60 * 1000;
function binding(context: DSAProblemContext) {
  return [context.contentId, context.title, context.sourceUrl ?? ""];
}
function signature(payload: string, key: string) {
  return createHmac("sha256", key).update(`dsa-source-context:v1:${payload}`).digest();
}
/** Signed, short-lived public-source evidence. Kept only in conversation memory. */
export function issueWebContextToken(context: DSAProblemContext, results: WebContext["results"]): string | undefined {
  const { apiKey } = getReasonAIConfiguration();
  if (!apiKey || !results.length) return;
  const payload = Buffer.from(JSON.stringify({ version: 1, expires: Date.now() + LIFETIME, binding: binding(context), results })).toString("base64url");
  const token = `${payload}.${signature(payload, apiKey).toString("base64url")}`;
  return token.length <= 64000 ? token : undefined;
}
export function readWebContextToken(context: DSAProblemContext, token?: string): WebContext["results"] | undefined {
  const { apiKey } = getReasonAIConfiguration();
  if (!apiKey || !token || token.length > 64000) return;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return;
    const provided = Buffer.from(parts[1], "base64url"), expected = signature(parts[0], apiKey);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return;
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (data.version !== 1 || !Number.isFinite(data.expires) || data.expires <= Date.now() || data.expires > Date.now() + LIFETIME || JSON.stringify(data.binding) !== JSON.stringify(binding(context))) return;
    if (!Array.isArray(data.results) || !data.results.length || data.results.length > 5) return;
    return data.results;
  } catch { return; }
}
