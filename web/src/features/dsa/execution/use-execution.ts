"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBrowserClient } from "@/lib/supabase/client";
import { createAuthenticatedReasonAIFetch } from "@/lib/reasonai/authenticated-request";
import {
  executionRequestSchema,
  terminal,
  type ExecutionAvailability,
  type ExecutionRequest,
  type ExecutionView,
} from "./contract";

let sharedTransport:
  ReturnType<typeof createAuthenticatedReasonAIFetch> | undefined;
const transport = () =>
  (sharedTransport ??= createAuthenticatedReasonAIFetch(
    getBrowserClient().auth,
  ));
type LocalExecution = { schema: 1; pending?: ExecutionRequest; id?: string };
function read(key: string): LocalExecution {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? "null");
    if (data?.schema === 1)
      return {
        schema: 1,
        ...(executionRequestSchema.safeParse(data.pending).success
          ? { pending: data.pending }
          : {}),
        ...(typeof data.id === "string" && /^[0-9a-f-]{36}$/i.test(data.id)
          ? { id: data.id }
          : {}),
      };
  } catch {
    /* Restricted or corrupted browser storage. */
  }
  return { schema: 1 };
}
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function parse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok)
    throw new RequestError(
      typeof body.error === "string"
        ? body.error
        : "Execution is temporarily unavailable.",
      response.status,
    );
  return body as T;
}
export function useExecution(
  userId: string,
  problemId: string,
  problemVersionId: string,
) {
  const storageKey = `reasonai:dsa:execution:1:${userId}:${problemId}:${problemVersionId}`;
  const [local, setLocal] = useState(() => read(storageKey));
  const [created, setCreated] = useState<ExecutionView>();
  const [creating, setCreating] = useState(false),
    [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string>(),
    [cancelRequested, setCancelRequested] = useState(false),
    [pollingStopped, setPollingStopped] = useState(false);
  const busy = useRef(false),
    polls = useRef(0),
    failures = useRef(0);
  function save(next: LocalExecution) {
    setLocal(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Existing draft warning covers storage restrictions; job remains durable. */
    }
  }
  const availability = useQuery({
    queryKey: [
      "dsa-execution-capabilities",
      userId,
      problemId,
      problemVersionId,
    ],
    queryFn: async ({ signal }) =>
      parse<ExecutionAvailability>(
        await transport()(
          `/api/dsa/execution-capabilities?problemId=${problemId}&problemVersionId=${problemVersionId}`,
          {},
          signal,
        ),
      ),
    retry: false,
  });
  const execution = useQuery({
    queryKey: ["dsa-execution", userId, problemId, problemVersionId, local.id],
    enabled: !!local.id,
    queryFn: async ({ signal }) => {
      polls.current++;
      if (polls.current >= 120) setPollingStopped(true);
      try {
        const result = await parse<ExecutionView>(
          await transport()(
            `/api/dsa/executions/${local.id}`,
            {},
            AbortSignal.any([signal, AbortSignal.timeout(12000)]),
          ),
        );
        failures.current = 0;
        return result;
      } catch (failure) {
        if (!signal.aborted && ++failures.current >= 5) setPollingStopped(true);
        throw failure;
      }
    },
    retry: false,
    refetchInterval: (query) => {
      if (query.state.data && terminal(query.state.data.status)) return false;
      if (polls.current >= 120 || failures.current >= 5) return false;
      return Math.min(10000, 1000 * 1.5 ** Math.min(polls.current, 6));
    },
    refetchIntervalInBackground: false,
  });
  const job = execution.data ?? created;
  const active = !!local.id && (!job || !terminal(job.status));
  async function create(request: ExecutionRequest) {
    if (busy.current) return;
    busy.current = true;
    setCreating(true);
    setError(undefined);
    setCancelRequested(false);
    save({ schema: 1, pending: request });
    try {
      const result = await parse<ExecutionView>(
        await transport()(
          "/api/dsa/executions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          },
          AbortSignal.timeout(25000),
        ),
      );
      polls.current = 0;
      failures.current = 0;
      setPollingStopped(false);
      setCreated(result);
      save({ schema: 1, id: result.submissionId });
    } catch (failure) {
      // A lost response may follow a committed create. Retry the original request
      // and key, including after refresh; never blindly create another submission.
      if (failure instanceof RequestError && failure.status < 500)
        save({ schema: 1 });
      setError(
        failure instanceof Error
          ? failure.message
          : "The execution request could not be confirmed.",
      );
    } finally {
      busy.current = false;
      setCreating(false);
    }
  }
  return {
    availability,
    job,
    creating,
    cancelling,
    cancelRequested,
    active,
    error: error ?? execution.error?.message,
    needsRetry: !!local.pending,
    pollingStopped: active && pollingStopped,
    missing:
      execution.error instanceof RequestError && execution.error.status === 404,
    clearMissing: () => {
      setCreated(undefined);
      save({ schema: 1 });
    },
    async start(code: string, mode: "run" | "submit") {
      if (active || busy.current || local.pending) return;
      const parsed = executionRequestSchema.safeParse({
        problemId,
        problemVersionId,
        language: "python",
        code,
        mode,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!parsed.success) {
        setError("Write some code before running it.");
        return;
      }
      await create(parsed.data);
    },
    retryCreate: () => (local.pending ? create(local.pending) : undefined),
    resume: () => {
      polls.current = 0;
      failures.current = 0;
      setPollingStopped(false);
      void execution.refetch();
    },
    async cancel() {
      if (!local.id || cancelling) return;
      setCancelling(true);
      setError(undefined);
      try {
        await parse<ExecutionView>(
          await transport()(
            `/api/dsa/executions/${local.id}`,
            { method: "DELETE" },
            AbortSignal.timeout(12000),
          ),
        );
        setCancelRequested(true);
        void execution.refetch();
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Cancellation could not be confirmed.",
        );
      } finally {
        setCancelling(false);
      }
    },
  };
}
export type ExecutionState = ReturnType<typeof useExecution>;
