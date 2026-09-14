import { cookies } from "next/headers";
import { authenticateApiRequest } from "@/lib/supabase/api-auth";
import { isE2EAuthBypassEnabled } from "@/lib/config/server";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import { DSAValidationError, parseDSATutorRequest } from "@/features/dsa/reasonai/contract";
import { dsaTutorProvider, DSATutorProviderError } from "@/features/dsa/reasonai/provider";

export const runtime = "nodejs";
export const maxDuration = 65;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  try {
    if (!(isE2EAuthBypassEnabled() && (await cookies()).has("e2e-bypass-auth"))) {
      const authError = await authenticateApiRequest(request);
      if (authError) return authError;
    }
  } catch { return reply({ error: "Session verification is temporarily unavailable. Please try again." }, 503); }
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Expected JSON." }, 415);
  let input;
  try { input = parseDSATutorRequest(await readBoundedJSON(request, 512 * 1024)); }
  catch (error) { return reply({ error: error instanceof DSAValidationError ? error.message : "Invalid or oversized request." }, 400); }
  try { return reply(await dsaTutorProvider.complete(input, request.signal)); }
  catch (error) {
    return error instanceof DSATutorProviderError ? reply({ error: error.message }, error.status)
      : reply({ error: "ReasonAI is temporarily unavailable. Please try again." }, 502);
  }
}
