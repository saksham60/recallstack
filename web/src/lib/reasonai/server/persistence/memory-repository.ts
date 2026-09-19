import "server-only";
import type { ReasonAIMessagePart } from "@/lib/reasonai/runtime/types";
import type {
  FinalizeRunInput,
  PersistedReasonAIMessage,
  PersistedReasonAIRun,
  ReasonAIConversation,
  ReasonAIConversationSummary,
  ReasonAIPersistenceRepository,
  ReasonAISurface,
  RunAcquisition,
} from "./types";

interface OwnedConversation extends ReasonAIConversationSummary { userId: string }
interface StoredMessage extends PersistedReasonAIMessage { ordinal: number }

const clone = <T>(value: T): T => structuredClone(value);

/** Deterministic adapter for tests and the explicitly guarded E2E auth bypass. */
export class MemoryReasonAIPersistenceRepository implements ReasonAIPersistenceRepository {
  private readonly conversations = new Map<string, OwnedConversation>();
  private readonly messages = new Map<string, StoredMessage>();
  private readonly runs = new Map<string, PersistedReasonAIRun>();
  private ordinal = 0;

  async createConversation(userId: string, input: { surface: ReasonAISurface; contextId?: string; title?: string }) {
    const now = new Date().toISOString();
    const conversation: OwnedConversation = { id: crypto.randomUUID(), userId, ...input, createdAt: now, updatedAt: now };
    this.conversations.set(conversation.id, conversation);
    return clone(this.publicConversation(conversation));
  }

  async listConversations(userId: string, filter: { surface?: ReasonAISurface; contextId?: string; limit: number }) {
    return [...this.conversations.values()]
      .filter((item) => item.userId === userId && (!filter.surface || item.surface === filter.surface) && (!filter.contextId || item.contextId === filter.contextId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      .slice(0, filter.limit)
      .map((item) => clone(this.publicConversation(item)));
  }

  async getConversation(userId: string, conversationId: string): Promise<ReasonAIConversation | undefined> {
    const conversation = this.owned(userId, conversationId);
    if (!conversation) return;
    const messages = [...this.messages.values()]
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id))
      .slice(-500)
      .map((item) => clone({
        id: item.id,
        conversationId: item.conversationId,
        ...(item.runId ? { runId: item.runId } : {}),
        role: item.role,
        parts: item.parts,
        status: item.status,
        createdAt: item.createdAt,
      }));
    return { ...clone(this.publicConversation(conversation)), messages };
  }

  async getConversationSummary(userId: string, conversationId: string) {
    const conversation = this.owned(userId, conversationId);
    return conversation ? clone(this.publicConversation(conversation)) : undefined;
  }

  async deleteConversation(userId: string, conversationId: string) {
    if (!this.owned(userId, conversationId)) return false;
    this.conversations.delete(conversationId);
    for (const [id, message] of this.messages) if (message.conversationId === conversationId) this.messages.delete(id);
    for (const [id, run] of this.runs) if (run.conversationId === conversationId) this.runs.delete(id);
    return true;
  }

  async acquireRun(userId: string, conversationId: string, idempotencyKey: string): Promise<RunAcquisition> {
    if (!this.owned(userId, conversationId)) throw new Error("Conversation not found.");
    const existing = [...this.runs.values()].find((run) => run.conversationId === conversationId && run.idempotencyKey === idempotencyKey);
    if (existing) return { kind: existing.status === "running" ? "active" : "replay", run: clone(existing) };
    const active = [...this.runs.values()].find((run) => run.conversationId === conversationId && run.status === "running");
    if (active) return { kind: "active", run: clone(active) };
    const now = new Date().toISOString();
    const run: PersistedReasonAIRun = {
      id: crypto.randomUUID(), conversationId, idempotencyKey, status: "running", lastSeq: 0,
      startedAt: now, createdAt: now, updatedAt: now,
    };
    this.runs.set(run.id, run);
    return { kind: "acquired", run: clone(run) };
  }

  async createMessage(userId: string, input: Omit<PersistedReasonAIMessage, "createdAt">) {
    if (!this.owned(userId, input.conversationId)) throw new Error("Conversation not found.");
    const existing = this.messages.get(input.id);
    if (existing) return clone(existing);
    const message: StoredMessage = { ...clone(input), parts: clone(input.parts as ReasonAIMessagePart[]), createdAt: new Date().toISOString(), ordinal: ++this.ordinal };
    this.messages.set(message.id, message);
    return clone(message);
  }

  async finalizeRun(userId: string, conversationId: string, runId: string, input: FinalizeRunInput) {
    if (!this.owned(userId, conversationId)) return;
    const run = this.runs.get(runId);
    if (!run || run.conversationId !== conversationId) return;
    const effectiveStatus = run.status === "running" ? input.status : run.status;
    if (input.assistant) {
      const existing = this.messages.get(input.assistant.id);
      const message: StoredMessage = {
        ...clone(input.assistant), conversationId, runId, status: effectiveStatus,
        createdAt: existing?.createdAt ?? new Date().toISOString(), ordinal: existing?.ordinal ?? ++this.ordinal,
      };
      this.messages.set(message.id, message);
    }
    if (run.status === "running") {
      const now = new Date().toISOString();
      Object.assign(run, {
        status: input.status, lastSeq: input.lastSeq, errorCode: input.errorCode, updatedAt: now,
        ...(input.status === "cancelled" ? { cancelledAt: now } : { completedAt: now }),
      });
    }
    return clone(run);
  }

  async cancelRun(userId: string, conversationId: string, runId: string) {
    if (!this.owned(userId, conversationId)) return false;
    const run = this.runs.get(runId);
    if (!run || run.conversationId !== conversationId) return false;
    if (run.status === "running" || run.status === "interrupted") {
      const now = new Date().toISOString();
      Object.assign(run, { status: "cancelled", cancelledAt: now, completedAt: undefined, updatedAt: now });
      for (const message of this.messages.values()) {
        if (message.runId === runId && message.role === "assistant") message.status = "cancelled";
      }
    }
    return true;
  }

  private owned(userId: string, conversationId: string) {
    const conversation = this.conversations.get(conversationId);
    return conversation?.userId === userId ? conversation : undefined;
  }

  private publicConversation(item: OwnedConversation): ReasonAIConversationSummary {
    return {
      id: item.id,
      surface: item.surface,
      ...(item.contextId ? { contextId: item.contextId } : {}),
      ...(item.title ? { title: item.title } : {}),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
