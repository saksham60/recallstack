import type { ReasonAISurface } from "../persistence/types";

export const LEARNER_MEMORY_TYPES = ["preference", "strength", "misconception", "goal", "strategy", "progress"] as const;
export type LearnerMemoryType = typeof LEARNER_MEMORY_TYPES[number];

export interface LearnerMemory {
  id: string;
  userId: string;
  surface: ReasonAISurface;
  memoryType: LearnerMemoryType;
  memoryKey: string;
  content: string;
  confidence: number;
  sourceConversationId?: string;
  sourceRunId?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}
export interface LearnerMemoryCandidate {
  memoryType: LearnerMemoryType;
  memoryKey: string;
  content: string;
  confidence: number;
}

export interface LearnerMemoryQuery {
  surface: ReasonAISurface;
  contextId?: string;
  category?: string;
  limit: number;
}

export interface LearnerMemoryRepository {
  findRelevant(userId: string, query: LearnerMemoryQuery): Promise<LearnerMemory[]>;
  upsert(userId: string, input: {
    surface: ReasonAISurface;
    candidates: LearnerMemoryCandidate[];
    sourceConversationId: string;
    sourceRunId: string;
  }): Promise<LearnerMemory[]>;
}
