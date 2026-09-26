import createClient from "openapi-fetch";
import type { paths } from "@/lib/api/types";
import { publicConfig } from "@/lib/config/public";
import { getReasonAIConfiguration } from "@/lib/config/server";
import { authenticateApiRequestWithContext } from "@/lib/supabase/api-auth";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import { createReasonAINDJSONResponse } from "@/lib/reasonai/runtime/response";
import { storyChatSchema, streamStoryAnswer } from "@/features/feed/reasonai";
import { storySchema } from "@/features/feed/model";

export const runtime = "nodejs";
export const maxDuration = 90;
const reply = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply("Invalid request origin.", 403);
  const auth = await authenticateApiRequestWithContext(request);
  if (auth instanceof Response) return auth;
  if (!request.headers.get("content-type")?.includes("application/json")) return reply("Expected JSON.", 415);
  let input;
  try { input = storyChatSchema.parse(await readBoundedJSON(request, 192 * 1024)); }
  catch { return reply("Invalid or oversized story conversation.", 400); }
  if (!getReasonAIConfiguration().apiKey) return reply("ReasonAI is currently unavailable. Please try again later.", 503);

  // Re-read with the learner's token. Client metadata cannot grant story access or ground an answer.
  const authorization = request.headers.get("authorization") ?? `Bearer ${(await auth.supabase.auth.getSession()).data.session?.access_token ?? ""}`;
  const api = createClient<paths>({ baseUrl: publicConfig.apiBaseUrl });
  try {
    const { data, response } = await api.GET("/api/v1/knowledge/stories/{storyId}", {
      params: { path: { storyId: input.context.id } }, headers: { Authorization: authorization },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)]), cache: "no-store", redirect: "error",
    });
    if (!response.ok) return reply(response.status === 404 ? "This story is no longer available." : "Couldn’t load the story. Please try again.", [401, 403, 404, 429].includes(response.status) ? response.status : 503);
    const story = storySchema.parse(data);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(65000)]);
    return createReasonAINDJSONResponse(streamStoryAnswer(input, story, signal), {}, signal);
  } catch { return reply("Couldn’t load the story. Please try again.", 503); }
}
