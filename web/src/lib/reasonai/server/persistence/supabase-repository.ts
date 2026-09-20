import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReasonAIMessagePart, ReasonAIMessageStatus } from "@/lib/reasonai/runtime/types";
import {
  ReasonAIPersistenceError,
  type FinalizeRunInput,
  type PersistedReasonAIConversationState,
  type PersistedReasonAIMessage,
  type PersistedReasonAIRun,
  type ReasonAIConversation,
  type ReasonAIConversationSummary,
  type ReasonAIPersistenceRepository,
  type ReasonAISurface,
  type RunAcquisition,
} from "./types";

type Row = Record<string, unknown>;

function unavailable(): never {
  throw new ReasonAIPersistenceError("PERSISTENCE_UNAVAILABLE", "Conversation history is temporarily unavailable.");
}

function conversation(row: Row): ReasonAIConversationSummary {
  return {
    id: String(row.id),
    surface: row.surface as ReasonAISurface,
    ...(typeof row.context_id === "string" ? { contextId: row.context_id } : {}),
    ...(typeof row.title === "string" ? { title: row.title } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function message(row: Row): PersistedReasonAIMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    ...(typeof row.run_id === "string" ? { runId: row.run_id } : {}),
    role: row.role as "user" | "assistant",
    parts: row.parts as ReasonAIMessagePart[],
    status: row.status as ReasonAIMessageStatus,
    createdAt: String(row.created_at),
  };
}

function run(row: Row): PersistedReasonAIRun {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    idempotencyKey: String(row.idempotency_key),
    status: row.status as PersistedReasonAIRun["status"],
    lastSeq: Number(row.last_seq),
    ...(typeof row.started_at === "string" ? { startedAt: row.started_at } : {}),
    heartbeatAt: String(row.heartbeat_at),
    ...(typeof row.completed_at === "string" ? { completedAt: row.completed_at } : {}),
    ...(typeof row.cancelled_at === "string" ? { cancelledAt: row.cancelled_at } : {}),
    ...(typeof row.error_code === "string" ? { errorCode: row.error_code } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function conversationState(row: Row): PersistedReasonAIConversationState {
  return {
    conversationId: String(row.conversation_id),
    state: row.state,
    stateVersion: Number(row.state_version),
    ...(typeof row.last_run_id === "string" ? { lastRunId: row.last_run_id } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const conversationColumns = "id,surface,context_id,title,created_at,updated_at";

/** Uses the authenticated Supabase client directly so every operation remains RLS-scoped. */
export class SupabaseReasonAIPersistenceRepository implements ReasonAIPersistenceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createConversation(userId: string, input: { surface: ReasonAISurface; contextId?: string; title?: string }) {
    const { data, error } = await this.client.from("reasonai_conversations").insert({
      user_id: userId,
      surface: input.surface,
      context_id: input.contextId,
      title: input.title,
    }).select(conversationColumns).single();
    if (error || !data) unavailable();
    return conversation(data as Row);
  }

  async listConversations(userId: string, filter: { surface?: ReasonAISurface; contextId?: string; limit: number }) {
    let query = this.client.from("reasonai_conversations").select(conversationColumns).eq("user_id", userId);
    if (filter.surface) query = query.eq("surface", filter.surface);
    if (filter.contextId) query = query.eq("context_id", filter.contextId);
    const { data, error } = await query.order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(filter.limit);
    if (error || !data) unavailable();
    return (data as Row[]).map(conversation);
  }

  async getConversation(userId: string, conversationId: string): Promise<ReasonAIConversation | undefined> {
    const summary = await this.getConversationSummary(userId, conversationId);
    if (!summary) return;
    const messages = await this.client.from("reasonai_messages")
      .select("id,conversation_id,run_id,role,parts,status,created_at,ordinal")
      .eq("conversation_id", conversationId).order("ordinal", { ascending: false }).limit(500);
    if (messages.error || !messages.data) unavailable();
    return { ...summary, messages: (messages.data as Row[]).reverse().map(message) };
  }

  async getConversationSummary(userId: string, conversationId: string) {
    const { data, error } = await this.client.from("reasonai_conversations").select(conversationColumns)
      .eq("id", conversationId).eq("user_id", userId).maybeSingle();
    if (error) unavailable();
    return data ? conversation(data as Row) : undefined;
  }

  async getConversationState(userId: string, conversationId: string) {
    void userId; // Parent ownership is enforced by the state table SELECT policy.
    const { data, error } = await this.client.from("reasonai_conversation_state")
      .select("conversation_id,state,state_version,last_run_id,created_at,updated_at")
      .eq("conversation_id", conversationId).maybeSingle();
    if (error) unavailable();
    return data ? conversationState(data as Row) : undefined;
  }

  async deleteConversation(userId: string, conversationId: string) {
    const { data, error } = await this.client.from("reasonai_conversations").delete()
      .eq("id", conversationId).eq("user_id", userId).select("id").maybeSingle();
    if (error) unavailable();
    return Boolean(data);
  }

  async acquireRun(userId: string, conversationId: string, idempotencyKey: string): Promise<RunAcquisition> {
    void userId; // Ownership is enforced inside the security-invoker RPC with auth.uid().
    const { data, error } = await this.client.rpc("reasonai_acquire_run", {
      p_conversation_id: conversationId,
      p_idempotency_key: idempotencyKey,
      p_run_id: crypto.randomUUID(),
    });
    if (error) unavailable();
    const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
    if (!row) throw new ReasonAIPersistenceError("NOT_FOUND", "Conversation not found.");
    const kind = row.acquisition_kind;
    if (kind !== "acquired" && kind !== "active" && kind !== "replay") unavailable();
    return {
      kind,
      run: run(row),
      ...(kind !== "active" && typeof row.recovered_run_id === "string" ? { recoveredRunId: row.recovered_run_id } : {}),
    } as RunAcquisition;
  }

  async createMessage(userId: string, input: Omit<PersistedReasonAIMessage, "createdAt">) {
    if (!await this.getConversationSummary(userId, input.conversationId)) {
      throw new ReasonAIPersistenceError("NOT_FOUND", "Conversation not found.");
    }
    const { data, error } = await this.client.from("reasonai_messages").insert({
      id: input.id,
      conversation_id: input.conversationId,
      run_id: input.runId,
      role: input.role,
      parts: input.parts,
      status: input.status,
    }).select("id,conversation_id,run_id,role,parts,status,created_at").single();
    if (error || !data) unavailable();
    await this.touchConversation(input.conversationId);
    return message(data as Row);
  }

  async finalizeRun(userId: string, conversationId: string, runId: string, input: FinalizeRunInput) {
    void userId;
    const { data, error } = await this.client.rpc("reasonai_finalize_run", {
      p_conversation_id: conversationId,
      p_run_id: runId,
      p_status: input.status,
      p_last_seq: input.lastSeq,
      p_error_code: input.errorCode ?? null,
      p_assistant_id: input.assistant?.id ?? null,
      p_assistant_parts: input.assistant?.parts ?? null,
      p_next_state: input.nextConversationState ?? null,
    });
    if (error) unavailable();
    const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
    return row ? run(row) : undefined;
  }

  async heartbeatRun(userId: string, conversationId: string, runId: string) {
    void userId;
    const now = new Date().toISOString();
    const { data, error } = await this.client.from("reasonai_runs").update({ heartbeat_at: now, updated_at: now })
      .eq("id", runId).eq("conversation_id", conversationId).eq("status", "running")
      .select("id").maybeSingle();
    if (error) unavailable();
    return Boolean(data);
  }

  async cancelRun(userId: string, conversationId: string, runId: string) {
    if (!await this.getConversationSummary(userId, conversationId)) return false;
    const now = new Date().toISOString();
    const { data, error } = await this.client.from("reasonai_runs").update({
      status: "cancelled", cancelled_at: now, completed_at: null, updated_at: now,
    }).eq("id", runId).eq("conversation_id", conversationId).eq("status", "running")
      .select("id").maybeSingle();
    if (error) unavailable();
    if (!data) {
      const existing = await this.client.from("reasonai_runs").select("id").eq("id", runId).eq("conversation_id", conversationId).maybeSingle();
      if (existing.error) unavailable();
      return Boolean(existing.data);
    }
    await this.touchConversation(conversationId);
    return true;
  }

  private async touchConversation(conversationId: string) {
    const { error } = await this.client.from("reasonai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    if (error) unavailable();
  }
}
