import { z } from "zod";
import type { ReasonAIContext, ReasonAIOperation, ReasonAIProposal } from "./contract";

export const ArchitectureFindingSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  category: z.string().trim().min(1).max(100),
  affectedRefs: z.array(z.string().min(1).max(256)).max(50),
  explanation: z.string().trim().min(1).max(2_000),
  recommendation: z.string().trim().min(1).max(2_000),
}).strict();

export const ArchitectureReviewSchema = z.object({
  verdict: z.enum(["pass", "needs_revision"]),
  findings: z.array(ArchitectureFindingSchema).max(20),
  suggestedImprovements: z.array(z.string().min(1).max(1_000)).max(10),
}).strict();
export type ArchitectureReview = z.infer<typeof ArchitectureReviewSchema>;

export const ArchitectureReviewMetadataSchema = z.object({
  status: z.enum(["not_started", "passed", "needs_revision", "incomplete", "failed"]),
  attempts: z.number().int().min(0).max(100),
  repairAttempts: z.number().int().min(0).max(100),
  lastValidatedProposalVersion: z.number().int().positive(),
  reviewedProposalVersion: z.number().int().positive().optional(),
  reviewedFingerprint: z.string().min(1).max(100).optional(),
  findings: z.array(ArchitectureFindingSchema).max(20),
  incompleteReason: z.string().min(1).max(100).optional(),
}).strict().superRefine((review, ctx) => {
  if (review.status === "passed" && (review.attempts === 0
    || review.reviewedProposalVersion !== review.lastValidatedProposalVersion || !review.reviewedFingerprint)) {
    ctx.addIssue({ code: "custom", message: "A passing review must identify the current checkpoint." });
  }
});
export type ArchitectureReviewMetadata = z.infer<typeof ArchitectureReviewMetadataSchema>;

export interface ArchitectureReviewInput {
  request: import("./contract").ReasonAIRequest;
  proposalId: string;
  version: number;
  fingerprint: string;
  proposal: ReasonAIProposal;
  topology: Pick<ReasonAIContext, "nodes" | "edges">;
  operationIds: string[];
}

export interface ProposalDelta {
  proposalId: string;
  baseVersion: number;
  summary?: string;
  changes: Array<
    | { kind: "add"; operation: ReasonAIOperation; beforeOperationId?: string }
    | { kind: "replace"; operationId: string; operation: ReasonAIOperation }
    | { kind: "remove"; operationId: string }
  >;
}

const operation = z.record(z.string(), z.unknown());
export const ProposalDeltaSchema = z.object({
  proposalId: z.uuid(), baseVersion: z.number().int().positive(), summary: z.string().min(1).max(2_000).optional(),
  changes: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("add"), operation, beforeOperationId: z.uuid().optional() }).strict(),
    z.object({ kind: z.literal("replace"), operationId: z.uuid(), operation }).strict(),
    z.object({ kind: z.literal("remove"), operationId: z.uuid() }).strict(),
  ])).min(1).max(50),
}).strict();
