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
  ReasonAIProposalTransition,
  ReasonAIProposalTransitionResult,
} from "./types";
import { isRunLeaseExpired, RUN_LEASE_EXPIRED_CODE } from "./lease";
import { parseDSADurableConversationState } from "../langgraph/dsa/state";
import { parseSystemDesignDurableConversationState } from "../langgraph/system-design/state";
import type { PersistedReasonAIConversationState } from "./types";

interface OwnedConversation extends ReasonAIConversationSummary { userId: string }
interface StoredMessage extends PersistedReasonAIMessage { ordinal: number }

const clone = <T>(value: T): T => structuredClone(value);

/** Deterministic adapter for tests and the explicitly guarded E2E auth bypass. */
export class MemoryReasonAIPersistenceRepository implements ReasonAIPersistenceRepository {
  private readonly conversations = new Map<string, OwnedConversation>();
  private readonly messages = new Map<string, StoredMessage>();
  private readonly runs = new Map<string, PersistedReasonAIRun>();
  private readonly states = new Map<string, PersistedReasonAIConversationState>();
  private readonly proposalEvents = new Map<string, { conversationId: string; input: ReasonAIProposalTransition; result: ReasonAIProposalTransitionResult }>();
  private ordinal = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  private timestamp() { return this.now().toISOString(); }

  async createConversation(userId: string, input: { surface: ReasonAISurface; contextId?: string; title?: string }) {
    const now = this.timestamp();
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

  async getConversationState(userId: string, conversationId: string) {
    if (!this.owned(userId, conversationId)) return;
    const state = this.states.get(conversationId);
    return state ? clone(state) : undefined;
  }

  async transitionProposal(userId: string, conversationId: string, input: ReasonAIProposalTransition): Promise<ReasonAIProposalTransitionResult | undefined> {
    const conversation = this.owned(userId, conversationId);
    if (!conversation || conversation.surface !== "system_design") return;
    const priorEvent = this.proposalEvents.get(input.eventId);
    if (priorEvent) {
      if (priorEvent.conversationId !== conversationId || JSON.stringify({ ...priorEvent.input, expectedStateVersion: undefined }) !== JSON.stringify({ ...input, expectedStateVersion: undefined })) throw new Error("Proposal event ID was reused.");
      return { ...priorEvent.result, duplicate: true };
    }
    const stored = this.states.get(conversationId);
    if (!stored || stored.stateVersion !== input.expectedStateVersion) throw new Error("Stale proposal transition.");
    if ([...this.runs.values()].some((run) => run.conversationId === conversationId && run.status === "running")) throw new Error("Proposal transition conflicts with an active run.");
    const state = parseSystemDesignDurableConversationState(stored.state);
    const pending = state.pendingProposal;
    if (!pending || pending.proposalId !== input.proposalId || pending.version !== input.version || !["pending", "partially_accepted"].includes(pending.status)) throw new Error("Stale proposal transition.");
    if (input.action === "discard") pending.status = "discarded";
    else if (input.action === "accept_all") {
      if (!input.postFingerprint || pending.acceptedOperationIds.length || pending.dismissedOperationIds.length) throw new Error("Invalid accept-all transition.");
      pending.acceptedOperationIds = [...pending.operationIds];
      pending.status = "accepted";
      pending.lastReportedFingerprint = input.postFingerprint;
    } else {
      if (!input.operationId || !pending.operationIds.includes(input.operationId) || pending.acceptedOperationIds.includes(input.operationId) || pending.dismissedOperationIds.includes(input.operationId)) throw new Error("Invalid item transition.");
      if (input.action === "accept_item") {
        if (!input.postFingerprint) throw new Error("Missing post-commit fingerprint.");
        pending.acceptedOperationIds.push(input.operationId);
        pending.lastReportedFingerprint = input.postFingerprint;
        if (input.ref && input.realNodeId) pending.refMappings[input.ref] = input.realNodeId;
      } else pending.dismissedOperationIds.push(input.operationId);
      pending.status = pending.acceptedOperationIds.length + pending.dismissedOperationIds.length === pending.operationIds.length
        ? pending.acceptedOperationIds.length ? "accepted" : "discarded" : "partially_accepted";
    }
    stored.state = parseSystemDesignDurableConversationState(state);
    stored.stateVersion++;
    stored.updatedAt = this.timestamp();
    const result = { stateVersion: stored.stateVersion, status: pending.status, duplicate: false };
    this.proposalEvents.set(input.eventId, { conversationId, input: clone(input), result });
    return clone(result);
  }

  async deleteConversation(userId: string, conversationId: string) {
    if (!this.owned(userId, conversationId)) return false;
    this.conversations.delete(conversationId);
    for (const [id, message] of this.messages) if (message.conversationId === conversationId) this.messages.delete(id);
    for (const [id, run] of this.runs) if (run.conversationId === conversationId) this.runs.delete(id);
    this.states.delete(conversationId);
    for (const [id, event] of this.proposalEvents) if (event.conversationId === conversationId) this.proposalEvents.delete(id);
    return true;
  }

  async acquireRun(userId: string, conversationId: string, idempotencyKey: string): Promise<RunAcquisition> {
    if (!this.owned(userId, conversationId)) throw new Error("Conversation not found.");
    const existing = [...this.runs.values()].find((run) => run.conversationId === conversationId && run.idempotencyKey === idempotencyKey);
    if (existing) {
      if (existing.status === "running" && isRunLeaseExpired(existing.heartbeatAt, this.now().getTime())) {
        const now = this.timestamp();
        Object.assign(existing, { status: "interrupted", errorCode: RUN_LEASE_EXPIRED_CODE, completedAt: now, updatedAt: now });
        return { kind: "replay", run: clone(existing), recoveredRunId: existing.id };
      }
      return { kind: existing.status === "running" ? "active" : "replay", run: clone(existing) };
    }
    const active = [...this.runs.values()].find((run) => run.conversationId === conversationId && run.status === "running");
    let recoveredRunId: string | undefined;
    if (active) {
      if (!isRunLeaseExpired(active.heartbeatAt, this.now().getTime())) return { kind: "active", run: clone(active) };
      const recoveredAt = this.timestamp();
      Object.assign(active, { status: "interrupted", errorCode: RUN_LEASE_EXPIRED_CODE, completedAt: recoveredAt, updatedAt: recoveredAt });
      recoveredRunId = active.id;
    }
    const now = this.timestamp();
    const run: PersistedReasonAIRun = {
      id: crypto.randomUUID(), conversationId, idempotencyKey, status: "running", lastSeq: 0,
      startedAt: now, heartbeatAt: now, createdAt: now, updatedAt: now,
    };
    this.runs.set(run.id, run);
    return { kind: "acquired", run: clone(run), ...(recoveredRunId ? { recoveredRunId } : {}) };
  }

  async createMessage(userId: string, input: Omit<PersistedReasonAIMessage, "createdAt">) {
    if (!this.owned(userId, input.conversationId)) throw new Error("Conversation not found.");
    const existing = this.messages.get(input.id);
    if (existing) return clone(existing);
    const message: StoredMessage = { ...clone(input), parts: clone(input.parts as ReasonAIMessagePart[]), createdAt: this.timestamp(), ordinal: ++this.ordinal };
    this.messages.set(message.id, message);
    return clone(message);
  }

  async finalizeRun(userId: string, conversationId: string, runId: string, input: FinalizeRunInput) {
    if (!this.owned(userId, conversationId)) return;
    const run = this.runs.get(runId);
    if (!run || run.conversationId !== conversationId) return;
    if (run.status !== "running") return clone(run);
    if (input.status === "completed") {
      if (input.nextConversationState === undefined) throw new Error("Completed runs require conversation state.");
      const surface = this.conversations.get(conversationId)?.surface;
      if (surface === "system_design") parseSystemDesignDurableConversationState(input.nextConversationState);
      else parseDSADurableConversationState(input.nextConversationState);
    } else if (input.nextConversationState !== undefined) {
      throw new Error("Non-completed runs cannot advance conversation state.");
    }
    if (input.assistant) {
      const existing = this.messages.get(input.assistant.id);
      const message: StoredMessage = {
        ...clone(input.assistant), conversationId, runId, status: input.status,
        createdAt: existing?.createdAt ?? this.timestamp(), ordinal: existing?.ordinal ?? ++this.ordinal,
      };
      this.messages.set(message.id, message);
    }
    const now = this.timestamp();
    Object.assign(run, {
      status: input.status, lastSeq: input.lastSeq, errorCode: input.errorCode, updatedAt: now,
      ...(input.status === "cancelled" ? { cancelledAt: now } : { completedAt: now }),
    });
    if (input.status === "completed") {
      const previous = this.states.get(conversationId);
      this.states.set(conversationId, {
        conversationId,
        state: clone(input.nextConversationState),
        stateVersion: (previous?.stateVersion ?? 0) + 1,
        lastRunId: runId,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      });
    }
    return clone(run);
  }

  async heartbeatRun(userId: string, conversationId: string, runId: string) {
    if (!this.owned(userId, conversationId)) return false;
    const run = this.runs.get(runId);
    if (!run || run.conversationId !== conversationId || run.status !== "running") return false;
    const now = this.timestamp();
    Object.assign(run, { heartbeatAt: now, updatedAt: now });
    return true;
  }

  async cancelRun(userId: string, conversationId: string, runId: string) {
    if (!this.owned(userId, conversationId)) return false;
    const run = this.runs.get(runId);
    if (!run || run.conversationId !== conversationId) return false;
    if (run.status === "running") {
      const now = this.timestamp();
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
