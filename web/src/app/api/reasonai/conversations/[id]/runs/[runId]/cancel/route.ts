import { getReasonAIPersistenceRequestContext } from "@/lib/reasonai/server/persistence/request-context";
import { isReasonAIUUID } from "@/lib/reasonai/server/persistence/types";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string; runId: string }> };

export async function POST(request: Request, { params }: Context) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  const { id, runId } = await params;
  if (!isReasonAIUUID(id) || !isReasonAIUUID(runId)) return reply({ error: "Run not found." }, 404);
  const context = await getReasonAIPersistenceRequestContext(request);
  if (context instanceof Response) return context;
  try {
    return await context.repository.cancelRun(context.userId, id, runId)
      ? reply({ runId, status: "cancelled" })
      : reply({ error: "Run not found." }, 404);
  } catch {
    return reply({ error: "Conversation history is temporarily unavailable." }, 503);
  }
}

