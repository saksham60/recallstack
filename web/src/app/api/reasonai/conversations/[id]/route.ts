import { getReasonAIPersistenceRequestContext } from "@/lib/reasonai/server/persistence/request-context";
import { isReasonAIUUID, ReasonAIPersistenceError } from "@/lib/reasonai/server/persistence/types";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isReasonAIUUID(id)) return reply({ error: "Conversation not found." }, 404);
  const context = await getReasonAIPersistenceRequestContext(request);
  if (context instanceof Response) return context;
  try {
    const conversation = await context.repository.getConversation(context.userId, id);
    return conversation ? reply({ conversation }) : reply({ error: "Conversation not found." }, 404);
  } catch (error) {
    return error instanceof ReasonAIPersistenceError
      ? reply({ error: error.message, code: error.code }, 503)
      : reply({ error: "Conversation history is temporarily unavailable." }, 503);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  const { id } = await params;
  if (!isReasonAIUUID(id)) return reply({ error: "Conversation not found." }, 404);
  const context = await getReasonAIPersistenceRequestContext(request);
  if (context instanceof Response) return context;
  try {
    return await context.repository.deleteConversation(context.userId, id)
      ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })
      : reply({ error: "Conversation not found." }, 404);
  } catch {
    return reply({ error: "Conversation history is temporarily unavailable." }, 503);
  }
}

