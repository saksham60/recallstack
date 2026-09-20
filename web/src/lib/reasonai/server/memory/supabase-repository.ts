import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearnerMemory, LearnerMemoryRepository, LearnerMemoryType } from "./types";

type Row = Record<string, unknown>;

function item(row: Row): LearnerMemory {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    surface: row.surface as LearnerMemory["surface"],
    memoryType: row.memory_type as LearnerMemoryType,
    memoryKey: String(row.memory_key),
    content: String(row.content),
    confidence: Number(row.confidence),
    ...(typeof row.source_conversation_id === "string" ? { sourceConversationId: row.source_conversation_id } : {}),
    ...(typeof row.source_run_id === "string" ? { sourceRunId: row.source_run_id } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(typeof row.last_used_at === "string" ? { lastUsedAt: row.last_used_at } : {}),
  };
}
const columns = "id,user_id,surface,memory_type,memory_key,content,confidence,source_conversation_id,source_run_id,created_at,updated_at,last_used_at";

export class SupabaseLearnerMemoryRepository implements LearnerMemoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findRelevant(userId: string, query: Parameters<LearnerMemoryRepository["findRelevant"]>[1]) {
    const { data, error } = await this.client.from("reasonai_learner_memories").select(columns)
      .eq("user_id", userId).eq("surface", query.surface)
      .order("updated_at", { ascending: false }).limit(Math.min(query.limit * 3, 24));
    if (error || !data) throw new Error("Learner memory is unavailable.");
    const terms = [query.contextId, query.category].filter(Boolean).map((value) => String(value).toLowerCase());
    return (data as Row[]).map(item).sort((a, b) => {
      const score = (memory: LearnerMemory) => terms.reduce((sum, term) => sum + (memory.memoryKey.toLowerCase().includes(term) ? 1 : 0), 0)
        + (memory.memoryType === "preference" ? 1 : 0);
      return score(b) - score(a) || b.updatedAt.localeCompare(a.updatedAt);
    }).slice(0, query.limit);
  }

  async upsert(userId: string, input: Parameters<LearnerMemoryRepository["upsert"]>[1]) {
    if (!input.candidates.length) return [];
    const now = new Date().toISOString();
    const { data, error } = await this.client.from("reasonai_learner_memories").upsert(
      input.candidates.map((candidate) => ({
        user_id: userId,
        surface: input.surface,
        memory_type: candidate.memoryType,
        memory_key: candidate.memoryKey,
        content: candidate.content,
        confidence: candidate.confidence,
        source_conversation_id: input.sourceConversationId,
        source_run_id: input.sourceRunId,
        updated_at: now,
      })),
      { onConflict: "user_id,surface,memory_key" },
    ).select(columns);
    if (error || !data) throw new Error("Learner memory is unavailable.");
    return (data as Row[]).map(item);
  }
}
