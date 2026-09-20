import { isReasonAIDSAStreamingEnabled, isReasonAILearnerMemoryEnabled } from "@/lib/config/server";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import { DSAValidationError, parseDSATutorRequest } from "@/features/dsa/reasonai/contract";
import { dsaTutorProvider, DSATutorProviderError } from "@/features/dsa/reasonai/provider";
import { createReasonAINDJSONResponse, REASONAI_NDJSON_MEDIA_TYPE } from "@/lib/reasonai/runtime/response";
import { streamDSAEvents, type DSAPerformanceStage } from "@/lib/reasonai/server/dsa-stream";
import {
  defaultDSADurableConversationState,
  parseDSADurableConversationState,
  type DSADurableConversationState,
} from "@/lib/reasonai/server/langgraph/dsa/state";
import { learnerMemoryExtractor } from "@/lib/reasonai/server/memory/extractor";
import { prepareDSARun, type PreparedDSARun } from "@/lib/reasonai/server/persistence/dsa-run";
import { getReasonAIPersistenceRequestContext } from "@/lib/reasonai/server/persistence/request-context";
import { persistReasonAITranscript } from "@/lib/reasonai/server/persistence/stream";
import { ReasonAIPersistenceError } from "@/lib/reasonai/server/persistence/types";

export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const acceptedAt = Date.now();
  const pendingStages: Array<{ stage: DSAPerformanceStage; at: number }> = [];
  const record = (stage: DSAPerformanceStage) => pendingStages.push({ stage, at: Date.now() });
  record("request.accepted");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  let persistenceContext;
  try {
    record("auth.started");
    persistenceContext = await getReasonAIPersistenceRequestContext(request);
    if (persistenceContext instanceof Response) return persistenceContext;
    record("auth.completed");
  } catch { return reply({ error: "Session verification is temporarily unavailable. Please try again." }, 503); }
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Expected JSON." }, 415);
  let input;
  try {
    input = parseDSATutorRequest(await readBoundedJSON(request, 512 * 1024));
    record("request.parsed");
  } catch (error) { return reply({ error: error instanceof DSAValidationError ? error.message : "Invalid or oversized request." }, 400); }
  const acceptsNDJSON = request.headers.get("accept")?.toLowerCase().split(",").some((value) => value.trim().startsWith(REASONAI_NDJSON_MEDIA_TYPE));
  if (isReasonAIDSAStreamingEnabled() && acceptsNDJSON) {
    if (!input.idempotencyKey) return reply({ error: "A valid idempotency key is required.", code: "IDEMPOTENCY_KEY_REQUIRED" }, 400);
    let prepared: PreparedDSARun | undefined;
    try {
      prepared = await prepareDSARun(
        persistenceContext.repository,
        persistenceContext.userId,
        input as typeof input & { idempotencyKey: string },
        record,
      );
      const mark = (stage: DSAPerformanceStage, at = Date.now()) =>
        console.info("[DSA_V2_PERF]", { runId: prepared!.run.id, stage, elapsedMs: at - acceptedAt });
      for (const timing of pendingStages) mark(timing.stage, timing.at);
      const headers = {
        "X-ReasonAI-Conversation-Id": prepared.conversation.id,
        "X-ReasonAI-Run-Id": prepared.run.id,
      };
      if (prepared.kind === "acquired") {
        console.info("[DSA_V2_LIFECYCLE]", { runId: prepared.run.id, stage: "run.acquired", elapsedMs: Date.now() - acceptedAt });
        if (prepared.recoveredRunId) {
          console.info("[DSA_V2_LIFECYCLE]", {
            runId: prepared.run.id,
            previousRunId: prepared.recoveredRunId,
            stage: "stale_run_recovered",
            elapsedMs: Date.now() - acceptedAt,
          });
        }
      }
      if (prepared.kind === "replay" && prepared.recoveredRunId) {
        console.info("[DSA_V2_LIFECYCLE]", { runId: prepared.run.id, stage: "run.interrupted", elapsedMs: Date.now() - acceptedAt });
        console.info("[DSA_V2_LIFECYCLE]", {
          runId: prepared.run.id,
          previousRunId: prepared.recoveredRunId,
          stage: "stale_run_recovered",
          elapsedMs: Date.now() - acceptedAt,
        });
      }
      if (prepared.kind === "active") {
        return reply({ error: "A ReasonAI response is already running for this conversation.", code: "RUN_IN_PROGRESS", conversationId: prepared.conversation.id, runId: prepared.run.id }, 409);
      }
      if (prepared.kind === "replay") {
        return Response.json({ conversationId: prepared.conversation.id, runId: prepared.run.id, status: prepared.run.status, replayed: true }, { headers: { ...headers, "Cache-Control": "no-store" } });
      }

      mark("state.load.started");
      const stateRead = (async () => {
        try {
          const persisted = await persistenceContext.repository.getConversationState(
            persistenceContext.userId,
            prepared!.conversation.id,
          );
          return persisted
            ? parseDSADurableConversationState(persisted.state)
            : defaultDSADurableConversationState();
        } catch (error) {
          console.error("[DSA_V2_STATE]", {
            runId: prepared!.run.id,
            stage: "state.read.failed",
            category: error instanceof Error ? error.name : "unknown",
          });
          if (error instanceof ReasonAIPersistenceError) throw error;
          throw new ReasonAIPersistenceError("STATE_INVALID", "Conversation state is invalid.");
        }
      })();
      const memoryEnabled = isReasonAILearnerMemoryEnabled("dsa") && Boolean(persistenceContext.learnerMemoryRepository);
      const memoryRead = (async () => {
        if (!memoryEnabled) return undefined;
        mark("memory.read.started");
        try {
          const items = await persistenceContext.learnerMemoryRepository!.findRelevant(persistenceContext.userId, {
            surface: "dsa",
            contextId: input.context.contentId,
            category: input.context.category,
            limit: 8,
          });
          return items.slice(0, 8).map((item) => item.content.slice(0, 1_000));
        } catch {
          console.error("[DSA_V2_MEMORY]", { runId: prepared!.run.id, stage: "memory.read.failed" });
          return [];
        } finally {
          mark("memory.read.completed");
        }
      })();
      const [durableState, learnerMemory] = await Promise.all([stateRead, memoryRead]);
      mark("state.load.completed");
      let nextConversationState: DSADurableConversationState | undefined;
      let finalResult: Awaited<ReturnType<typeof dsaTutorProvider.complete>> | undefined;
      const events = streamDSAEvents(input, request.signal, {
        durableState,
        runId: prepared.run.id,
        messageId: prepared.assistantMessageId,
        mark,
        ...(learnerMemory ? { learnerMemory } : {}),
        onConversationState: (state) => { nextConversationState = state; },
        onFinalResult: (result) => { finalResult = result; },
      });
      mark("transcript.persist.started");
      const persisted = persistReasonAITranscript(
        persistenceContext.repository,
        persistenceContext.userId,
        prepared.conversation.id,
        prepared.run.id,
        events,
        async (status) => {
          mark("transcript.persist.completed");
          mark("transcript.persisted");
          if (status === "completed") {
            mark("state.persisted");
            mark("run.completed");
            if (memoryEnabled && finalResult && !request.signal.aborted) {
              try {
                mark("memory.extract.started");
                const candidates = await learnerMemoryExtractor.extract({
                  userMessage: input.message,
                  assistantAnswer: finalResult.text,
                  action: input.action,
                  hintLevel: input.hintLevel,
                }, request.signal);
                mark("memory.extract.completed");
                if (candidates.length) {
                  await persistenceContext.learnerMemoryRepository!.upsert(persistenceContext.userId, {
                    surface: "dsa",
                    candidates,
                    sourceConversationId: prepared!.conversation.id,
                    sourceRunId: prepared!.run.id,
                  });
                }
                mark("memory.write.completed");
              } catch (error) {
                console.error("[DSA_V2_MEMORY]", {
                  runId: prepared!.run.id,
                  stage: "memory.extract_or_write.failed",
                  category: error instanceof Error ? error.name : "unknown",
                });
              }
            }
          }
          if (status === "interrupted") {
            console.info("[DSA_V2_LIFECYCLE]", { runId: prepared!.run.id, stage: "run.interrupted", elapsedMs: Date.now() - acceptedAt });
          }
        },
        () => nextConversationState,
      );
      return createReasonAINDJSONResponse(persisted, { headers }, request.signal);
    } catch (error) {
      if (prepared?.kind === "acquired") {
        try {
          await persistenceContext.repository.finalizeRun(
            persistenceContext.userId,
            prepared.conversation.id,
            prepared.run.id,
            { status: "failed", lastSeq: 0, errorCode: error instanceof ReasonAIPersistenceError ? error.code : "STATE_UNAVAILABLE" },
          );
        } catch (finalizeError) {
          console.error("[DSA_V2_LIFECYCLE]", {
            runId: prepared.run.id,
            stage: "run.finalize_failed",
            category: finalizeError instanceof Error ? finalizeError.name : "unknown",
          });
        }
      }
      if (error instanceof ReasonAIPersistenceError && error.code === "NOT_FOUND") {
        return reply({ error: "Conversation not found.", code: "CONVERSATION_NOT_FOUND" }, 404);
      }
      console.error("[DSA_V2_UNAVAILABLE]", { category: error instanceof Error ? error.name : "unknown" });
      return reply({
        error: "Conversation state is temporarily unavailable.",
        code: error instanceof ReasonAIPersistenceError && error.code === "STATE_INVALID" ? "STATE_INVALID" : "STATE_UNAVAILABLE",
      }, 503);
    }
  }
  try { return reply(await dsaTutorProvider.complete(input, request.signal)); }
  catch (error) {
    return error instanceof DSATutorProviderError ? reply({ error: error.message }, error.status)
      : reply({ error: "ReasonAI is temporarily unavailable. Please try again." }, 502);
  }
}
