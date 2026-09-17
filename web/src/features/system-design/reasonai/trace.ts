export const REASONAI_SUGGESTIONS_UNAVAILABLE = "Canvas suggestions could not be prepared safely. The architecture analysis is still available.";

export type ReasonAITrace = (stage: string, metadata?: {
  status?: "started" | "success" | "failed" | "skipped";
  errorCode?: string; operationIndex?: number; field?: string;
  tool?: "propose_canvas_changes" | "show_architecture_analysis" | "search_web" | "unknown";
  durationMs?: number; operationCount?: number; searchCount?: number; repairAttempt?: number;
}) => void;

/** Call sites supply fixed codes and counts, never caught messages or payloads. */
export function createReasonAITrace(traceId: string, client = false): ReasonAITrace {
  const id = /^[a-f0-9-]{36}$/i.test(traceId) ? traceId : "unavailable";
  return (stage, metadata = {}) => {
    if (client && process.env.NODE_ENV !== "development") return;
    console.info("[ReasonAI trace]", { traceId: id, stage, ...metadata });
  };
}
