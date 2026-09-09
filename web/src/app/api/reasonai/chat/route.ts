import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isE2EAuthBypassEnabled, isSystemDesignEnabled } from "@/lib/config/server";
import { parseReasonAIRequest } from "@/features/system-design/reasonai/contract";
import { readBoundedJSON, reasonAIProvider, ReasonAIProviderError } from "@/features/system-design/reasonai/provider";

export const runtime = "nodejs";
export const maxDuration = 65;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!isSystemDesignEnabled()) return reply({ error: "System Design is unavailable." }, 404);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  try {
    if (!(isE2EAuthBypassEnabled() && (await cookies()).has("e2e-bypass-auth"))) {
      const { data: { user }, error } = await (await createClient()).auth.getUser();
      if (error || !user) return reply({ error: "Sign in to use ReasonAI." }, 401);
    }
  } catch { return reply({ error: "Unable to verify your session. Please sign in again." }, 401); }
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Expected JSON." }, 415);
  let input;
  try { input = parseReasonAIRequest(await readBoundedJSON(request, 512 * 1024)); }
  catch { return reply({ error: "Invalid request. Use a message up to 4,000 characters and an active diagram with at most 200 nodes and 400 connections." }, 400); }
  try { return reply(await reasonAIProvider.complete(input)); }
  catch (error) {
    return error instanceof ReasonAIProviderError
      ? reply({ error: error.message }, error.status)
      : reply({ error: "ReasonAI is temporarily unavailable. Please try again." }, 502);
  }
}
