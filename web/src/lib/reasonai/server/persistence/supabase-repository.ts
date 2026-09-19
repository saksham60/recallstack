import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReasonAIMessagePart, ReasonAIMessageStatus } from "@/lib/reasonai/runtime/types";
import {
  ReasonAIPersistenceError,
  type FinalizeRunInput,
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
    ...(typeof row.completed_at === "string" ? { completedAt: row.completed_at } : {}),
    ...(typeof row.cancelled_at === "string" ? { cancelledAt: row.cancelled_at } : {}),
    ...(typeof row.error_code === "string" ? { errorCode: row.error_code } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const conversationColumns = "id,surface,context_id,title,created_at,updated_at";
const runColumns = "id,conversation_id,idempotency_key,status,last_seq,started_at,completed_at,cancelled_at,error_code,created_at,updated_at";

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

  async deleteConversation(userId: string, conversationId: string) {
    const { data, error } = await this.client.from("reasonai_conversations").delete()
      .eq("id", conversationId).eq("user_id", userId).select("id").maybeSingle();
    if (error) unavailable();
    return Boolean(data);
  }

  async acquireRun(userId: string, conversationId: string, idempotencyKey: string): Promise<RunAcquisition> {
    const owned = await this.getConversationSummary(userId, conversationId);
    if (!owned) throw new ReasonAIPersistenceError("NOT_FOUND", "Conversation not found.");
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    const inserted = await this.client.from("reasonai_runs").insert({
      id: runId,
      conversation_id: conversationId,
      idempotency_key: idempotencyKey,
      status: "running",
      started_at: now,
      updated_at: now,
    }).select(runColumns).single();
    if (!inserted.error && inserted.data) return { kind: "acquired", run: run(inserted.data as Row) };
    if (inserted.error?.code !== "23505") unavailable();

    const duplicate = await this.client.from("reasonai_runs").select(runColumns)
      .eq("conversation_id", conversationId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (duplicate.error) unavailable();
    if (duplicate.data) {
      const existing = run(duplicate.data as Row);
      return { kind: existing.status === "running" ? "active" : "replay", run: existing };
    }
    const active = await this.client.from("reasonai_runs").select(runColumns)
      .eq("conversation_id", conversationId).eq("status", "running").maybeSingle();
    if (active.error || !active.data) unavailable();
    return { kind: "active", run: run(active.data as Row) };
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
    if (!await this.getConversationSummary(userId, conversationId)) return;
    const currentResult = await this.client.from("reasonai_runs").select(runColumns)
      .eq("id", runId).eq("conversation_id", conversationId).maybeSingle();
    if (currentResult.error) unavailable();
    if (!currentResult.data) return;
    const current = run(currentResult.data as Row);
    const effectiveStatus = current.status === "running" ? input.status : current.status;
    if (input.assistant) await this.upsertAssistant(conversationId, runId, input.assistant, effectiveStatus);

    let finalRun = current;
    if (current.status === "running") {
      const now = new Date().toISOString();
      const updated = await this.client.from("reasonai_runs").update({
        status: input.status,
        last_seq: input.lastSeq,
        error_code: input.errorCode,
        updated_at: now,
        ...(input.status === "cancelled" ? { cancelled_at: now } : { completed_at: now }),
      }).eq("id", runId).eq("conversation_id", conversationId).eq("status", "running")
        .select(runColumns).maybeSingle();
      if (updated.error) unavailable();
      if (updated.data) finalRun = run(updated.data as Row);
      else {
        const raced = await this.client.from("reasonai_runs").select(runColumns).eq("id", runId).maybeSingle();
        if (raced.error || !raced.data) unavailable();
        finalRun = run(raced.data as Row);
        if (input.assistant && finalRun.status !== "running") await this.setAssistantStatus(runId, finalRun.status);
      }
    }
    await this.touchConversation(conversationId);
    return finalRun;
  }

  async cancelRun(userId: string, conversationId: string, runId: string) {
    if (!await this.getConversationSummary(userId, conversationId)) return false;
    const now = new Date().toISOString();
    const { data, error } = await this.client.from("reasonai_runs").update({
      status: "cancelled", cancelled_at: now, completed_at: null, updated_at: now,
    }).eq("id", runId).eq("conversation_id", conversationId).in("status", ["running", "interrupted"])
      .select("id").maybeSingle();
    if (error) unavailable();
    if (!data) {
      const existing = await this.client.from("reasonai_runs").select("id").eq("id", runId).eq("conversation_id", conversationId).maybeSingle();
      if (existing.error) unavailable();
      return Boolean(existing.data);
    }
    await this.setAssistantStatus(runId, "cancelled");
    await this.touchConversation(conversationId);
    return true;
  }

  private async upsertAssistant(
    conversationId: string,
    runId: string,
    assistant: NonNullable<FinalizeRunInput["assistant"]>,
    status: Exclude<PersistedReasonAIRun["status"], "running">,
  ) {
    const { error } = await this.client.from("reasonai_messages").upsert({
      id: assistant.id,
      conversation_id: conversationId,
      run_id: runId,
      role: "assistant",
      parts: assistant.parts,
      status,
    }, { onConflict: "id" });
    if (error) unavailable();
  }

  private async setAssistantStatus(runId: string, status: PersistedReasonAIRun["status"]) {
    if (status === "running") return;
    const { error } = await this.client.from("reasonai_messages").update({ status }).eq("run_id", runId).eq("role", "assistant");
    if (error) unavailable();
  }

  private async touchConversation(conversationId: string) {
    const { error } = await this.client.from("reasonai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    if (error) unavailable();
  }
}
