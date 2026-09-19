import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import { getReasonAIPersistenceRequestContext } from "@/lib/reasonai/server/persistence/request-context";
import { ReasonAIPersistenceError, type ReasonAISurface } from "@/lib/reasonai/server/persistence/types";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function safeText(value: unknown, limit: number, required = false): string | undefined {
  if (value === undefined && !required) return;
  if (typeof value !== "string" || value.length > limit || (required && !value.trim())) throw new Error();
  return value.trim() || undefined;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  const context = await getReasonAIPersistenceRequestContext(request);
  if (context instanceof Response) return context;
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Expected JSON." }, 415);
  try {
    const value = await readBoundedJSON(request, 32 * 1024);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["surface", "contextId", "title"].includes(key))) throw new Error();
    if (input.surface !== "dsa" && input.surface !== "system_design") throw new Error();
    const created = await context.repository.createConversation(context.userId, {
      surface: input.surface,
      ...(safeText(input.contextId, 256) ? { contextId: safeText(input.contextId, 256) } : {}),
      ...(safeText(input.title, 300) ? { title: safeText(input.title, 300) } : {}),
    });
    return reply({ conversationId: created.id, surface: created.surface, contextId: created.contextId, createdAt: created.createdAt }, 201);
  } catch (error) {
    return error instanceof ReasonAIPersistenceError
      ? reply({ error: error.message, code: error.code }, 503)
      : reply({ error: "Invalid conversation request." }, 400);
  }
}

export async function GET(request: Request) {
  const context = await getReasonAIPersistenceRequestContext(request);
  if (context instanceof Response) return context;
  try {
    const search = new URL(request.url).searchParams;
    const surfaceValue = search.get("surface");
    const surface = surfaceValue === null ? undefined : surfaceValue as ReasonAISurface;
    if (surface && surface !== "dsa" && surface !== "system_design") throw new Error();
    const contextId = search.get("contextId")?.trim() || undefined;
    if (contextId && contextId.length > 256) throw new Error();
    const rawLimit = search.get("limit");
    const limit = rawLimit === null ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error();
    const conversations = await context.repository.listConversations(context.userId, { surface, contextId, limit });
    return reply({ conversations, limit });
  } catch (error) {
    return error instanceof ReasonAIPersistenceError
      ? reply({ error: error.message, code: error.code }, 503)
      : reply({ error: "Invalid conversation filters." }, 400);
  }
}

