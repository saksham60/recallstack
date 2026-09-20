import "server-only";
import type { LearnerMemory, LearnerMemoryRepository } from "./types";

const clone = <T>(value: T): T => structuredClone(value);

/** Deterministic, user-scoped test adapter with the same semantic upsert key as Postgres. */
export class MemoryLearnerMemoryRepository implements LearnerMemoryRepository {
  private readonly items = new Map<string, LearnerMemory>();

  async findRelevant(userId: string, query: Parameters<LearnerMemoryRepository["findRelevant"]>[1]) {
    const terms = [query.contextId, query.category].filter(Boolean).map((item) => String(item).toLowerCase());
    return [...this.items.values()]
      .filter((item) => item.userId === userId && item.surface === query.surface)
      .sort((a, b) => {
        const score = (item: LearnerMemory) => terms.reduce((sum, term) => sum + (item.memoryKey.toLowerCase().includes(term) ? 1 : 0), 0)
          + (item.memoryType === "preference" ? 1 : 0);
        return score(b) - score(a) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);
      })
      .slice(0, query.limit)
      .map(clone);
  }

  async upsert(userId: string, input: Parameters<LearnerMemoryRepository["upsert"]>[1]) {
    const now = new Date().toISOString();
    const written: LearnerMemory[] = [];
    for (const candidate of input.candidates) {
      const key = `${userId}\u0000${input.surface}\u0000${candidate.memoryKey}`;
      const existing = this.items.get(key);
      const item: LearnerMemory = {
        id: existing?.id ?? crypto.randomUUID(),
        userId,
        surface: input.surface,
        ...candidate,
        sourceConversationId: input.sourceConversationId,
        sourceRunId: input.sourceRunId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastUsedAt: existing?.lastUsedAt,
      };
      this.items.set(key, item);
      written.push(clone(item));
    }
    return written;
  }
}
