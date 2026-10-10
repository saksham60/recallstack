import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import { getReasonAIPersistenceRequestContext } from "@/lib/reasonai/server/persistence/request-context";
import { isReasonAIUUID, ReasonAIPersistenceError, type ReasonAIProposalTransition } from "@/lib/reasonai/server/persistence/types";
import { parseSystemDesignDurableConversationState } from "@/lib/reasonai/server/langgraph/system-design/state";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, { params }: Context) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  const { id } = await params;
  if (!isReasonAIUUID(id)) return reply({ error: "Conversation not found." }, 404);
  const context = await getReasonAIPersistenceRequestContext(request);
  if (context instanceof Response) return context;
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Expected JSON." }, 415);
  try {
    const value = await readBoundedJSON(request, 4 * 1024) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some((key) => !["eventId", "proposalId", "version", "action", "operationIndex", "realNodeId", "postFingerprint"].includes(key))) throw new Error("Invalid request.");
    const { eventId, proposalId, version, action, operationIndex, realNodeId, postFingerprint } = value;
    if (!isReasonAIUUID(eventId) || !isReasonAIUUID(proposalId) || !Number.isInteger(version) || Number(version) < 1
      || !["accept_all", "accept_item", "dismiss_item", "discard"].includes(String(action))) throw new Error("Invalid proposal transition.");
    const itemAction = action === "accept_item" || action === "dismiss_item";
    if (itemAction !== (Number.isInteger(operationIndex) && Number(operationIndex) >= 0 && Number(operationIndex) < 150)) throw new Error("Invalid proposal item.");
    const accepting = action === "accept_all" || action === "accept_item";
    if (accepting !== (typeof postFingerprint === "string" && /^fnv64:[0-9a-f]{16}$/.test(postFingerprint))) throw new Error("Invalid post-commit fingerprint.");
    if (realNodeId !== undefined && (action !== "accept_item" || typeof realNodeId !== "string" || !/^node_[0-9a-f-]{36}$/.test(realNodeId))) throw new Error("Invalid node mapping.");
    const summary = await context.repository.getConversationSummary(context.userId, id);
    if (!summary || summary.surface !== "system_design") return reply({ error: "Conversation not found." }, 404);
    const stored = await context.repository.getConversationState(context.userId, id);
    if (!stored) return reply({ error: "Proposal not found." }, 404);
    const state = parseSystemDesignDurableConversationState(stored.state);
    const pending = state.pendingProposal;
    if (!pending || pending.proposalId !== proposalId || pending.version !== version) return reply({ error: "Proposal version changed. Refresh before continuing." }, 409);
    const item = itemAction ? pending.proposal.operations[operationIndex as number] : undefined;
    if (itemAction && !item) throw new Error("Invalid proposal item.");
    if (realNodeId !== undefined && item?.op !== "add_node") throw new Error("Invalid node mapping.");
    if (action === "accept_item" && item?.op === "add_node" && realNodeId === undefined) throw new Error("Missing node mapping.");
    const input: ReasonAIProposalTransition = {
      eventId, proposalId, version: version as number, action: action as ReasonAIProposalTransition["action"],
      expectedStateVersion: stored.stateVersion,
      ...(itemAction ? { operationId: pending.operationIds[operationIndex as number] } : {}),
      ...(item?.op === "add_node" && realNodeId ? { ref: item.ref, realNodeId } : {}),
      ...(typeof postFingerprint === "string" ? { postFingerprint } : {}),
    };
    const result = await context.repository.transitionProposal(context.userId, id, input);
    if (!result) return reply({ error: "Proposal not found." }, 404);
    return reply({ ...result, verification: accepting ? "client_reported_local_commit" : "server_state" });
  } catch (error) {
    if (error instanceof ReasonAIPersistenceError) return reply({ error: error.message, code: error.code }, error.code === "STATE_INVALID" ? 409 : 503);
    return reply({ error: error instanceof Error ? error.message : "Invalid proposal transition." }, 400);
  }
}
