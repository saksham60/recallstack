"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  Check,
  Clock3,
  Code2,
  Copy,
  History,
  MessageSquare,
  Sparkles,
  X,
} from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";
import {
  createAuthenticatedReasonAIFetch,
  type ReasonAIResourceEndpoint,
} from "@/lib/reasonai/authenticated-request";
import {
  historySchema,
  reportResponseSchema,
  type CodeAnalysis,
} from "@/lib/dsa-reports/contracts";
import { verdictLabel, type ExecutionView } from "./contract";

const transport = () =>
  createAuthenticatedReasonAIFetch(getBrowserClient().auth);
async function get(url: ReasonAIResourceEndpoint, signal: AbortSignal) {
  const response = await transport()(
    url,
    {},
    AbortSignal.any([signal, AbortSignal.timeout(12000)]),
  );
  if (!response.ok)
    throw new Error("Saved submission details are temporarily unavailable.");
  return response.json();
}
function Items({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="studio-insight-card">
      <h4>{title}</h4>
      {items.length ? (
        <ul>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="studio-muted">No additional finding in this review.</p>
      )}
    </section>
  );
}
function Analysis({ analysis }: { analysis: CodeAnalysis }) {
  const [tab, setTab] = useState("overview");
  return (
    <>
      <p className="studio-insight-lead">{analysis.summary}</p>
      <div className="studio-review-metrics">
        <div>
          <span>
            <Clock3 size={13} />
            Time complexity
          </span>
          <strong>{analysis.complexity.time || "Not estimated"}</strong>
          <small>AI estimate</small>
        </div>
        <div>
          <span>
            <Code2 size={13} />
            Space complexity
          </span>
          <strong>{analysis.complexity.space || "Not estimated"}</strong>
          <small>AI estimate · auxiliary space</small>
        </div>
      </div>
      <p className="studio-muted">
        Confidence: {analysis.complexity.confidence}. These are AI estimates.
      </p>
      <div
        className="studio-review-tabs"
        role="tablist"
        aria-label="AI analysis details"
      >
        {[
          ["overview", "Overview"],
          ["correctness", "Correctness"],
          ["optimize", "Optimize"],
        ].map(([id, label]) => (
          <button
            key={id}
            id={`review-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`review-pane-${id}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="review-pane-overview"
        aria-labelledby="review-overview"
        hidden={tab !== "overview"}
      >
        <section className="studio-insight-card">
          <h4>Estimated complexity</h4>
          <p>{analysis.complexity.explanation}</p>
        </section>
        <Items title="Caveats" items={analysis.complexity.caveats} />
        <details>
          <summary>Code quality</summary>
          <dl>
            {Object.entries(analysis.quality).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
        <details>
          <summary>Learning profile</summary>
          <Items title="Strengths" items={analysis.learning.strengths} />
          <Items title="Areas to practice" items={analysis.learning.practice} />
          <Items title="Concepts" items={analysis.learning.concepts} />
          <p>{analysis.learning.earlierAttempts}</p>
        </details>
      </div>
      <div
        role="tabpanel"
        id="review-pane-correctness"
        aria-labelledby="review-correctness"
        hidden={tab !== "correctness"}
      >
        <Items title="Evidence" items={analysis.correctness.evidence} />
        <Items title="Assumptions" items={analysis.correctness.assumptions} />
        <Items
          title="Edge-case categories"
          items={analysis.correctness.edgeCases}
        />
        <Items title="Invariants" items={analysis.correctness.invariants} />
      </div>
      <div
        role="tabpanel"
        id="review-pane-optimize"
        aria-labelledby="review-optimize"
        hidden={tab !== "optimize"}
      >
        <Items title="Approaches" items={analysis.optimization.approaches} />
        <Items title="Trade-offs" items={analysis.optimization.tradeoffs} />
        <Items title="Patterns" items={analysis.optimization.patterns} />
        <Items title="Suggestions" items={analysis.optimization.suggestions} />
      </div>
    </>
  );
}

function Report({
  job,
  userId,
  onDiscuss,
  discussDisabled,
}: {
  job: ExecutionView;
  userId: string;
  onDiscuss: (id: string) => void;
  discussDisabled: boolean;
}) {
  const polls = useRef(0),
    retryBusy = useRef(false),
    retryController = useRef<AbortController | null>(null);
  const [pollingStopped, setPollingStopped] = useState(false),
    [retrying, setRetrying] = useState(false),
    [retryError, setRetryError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => () => retryController.current?.abort(), []);
  const query = useQuery({
    queryKey: ["dsa-code-intelligence", userId, job.submissionId],
    queryFn: async ({ signal }) => {
      polls.current++;
      if (polls.current >= 60) setPollingStopped(true);
      const data = reportResponseSchema.parse(
        await get(`/api/dsa/submissions/${job.submissionId}/report`, signal),
      );
      if (data.submissionId !== job.submissionId)
        throw new Error("Submission report mismatch");
      return data;
    },
    retry: false,
    staleTime: (query) =>
      query.state.data?.report?.status === "completed" ? Infinity : 0,
    refetchOnWindowFocus: (query) =>
      ["queued", "generating"].includes(query.state.data?.report?.status ?? ""),
    refetchInterval: (query) =>
      polls.current < 60 &&
      query.state.data?.enabled &&
      (!query.state.data.report ||
        ["queued", "generating"].includes(query.state.data.report.status))
        ? 2000
        : false,
    refetchIntervalInBackground: false,
  });
  const report = query.data?.report;
  async function retryReview() {
    if (retryBusy.current) return;
    retryBusy.current = true;
    setRetrying(true);
    setRetryError("");
    const controller = new AbortController();
    retryController.current = controller;
    try {
      const response = await transport()(
        `/api/dsa/submissions/${job.submissionId}/report`,
        { method: "POST" },
        AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      );
      if (!response.ok) throw new Error("Retry unavailable");
      if (controller.signal.aborted) return;
      polls.current = 0;
      setPollingStopped(false);
      await query.refetch();
    } catch {
      if (!controller.signal.aborted)
        setRetryError("Could not restart your AI review. Please try again.");
    } finally {
      retryBusy.current = false;
      if (!controller.signal.aborted) setRetrying(false);
    }
  }
  const pending =
    report?.status === "generating"
      ? "Generating Code Intelligence"
      : "Code Intelligence queued";
  return (
    <section
      className="studio-code-intelligence"
      aria-label="Code Intelligence"
    >
      <div className="studio-review-heading">
        <h3>Code Intelligence</h3>
        <span className="studio-eyebrow">
          <Sparkles size={12} />
          Estimated by AI
        </span>
      </div>
      <p className="studio-muted">
        AI feedback is separate from the saved sandbox test result.
      </p>
      {query.isPending ? (
        <p role="status">Loading saved analysis…</p>
      ) : query.error ? (
        <div role="alert" className="studio-review-empty">
          Saved analysis is temporarily unavailable. Your judge result is
          retained.
        </div>
      ) : report?.status === "completed" && report.analysis ? (
        <Analysis analysis={report.analysis} />
      ) : report?.status === "failed" ? (
        <div className="studio-review-empty">
          <h4>AI review could not finish</h4>
          <p>
            Your judge result and submitted code are saved. Retrying AI review
            does not rerun the sandbox.
          </p>
          {query.data?.enabled && (
            <button
              type="button"
              className="studio-primary"
              disabled={retrying}
              onClick={() => void retryReview()}
            >
              {retrying ? "Restarting AI review…" : "Retry AI Review"}
            </button>
          )}
        </div>
      ) : report?.status === "rate_limited" ? (
        <p role="status">
          {report.error ?? "AI review is temporarily unavailable."}
        </p>
      ) : query.data?.enabled ? (
        <div className="studio-review-empty" role="status">
          <Sparkles size={20} />
          <h4>{pollingStopped ? "Review is still pending" : pending}</h4>
          <p>
            {pollingStopped
              ? "Check its saved status again later."
              : "ReasonAI is reviewing your saved source and permitted judge evidence. Your judge result is already saved."}
          </p>
          {!pollingStopped && (
            <div className="studio-review-progress" aria-hidden="true" />
          )}
        </div>
      ) : (
        <p>Code Intelligence generation is not enabled in this environment.</p>
      )}
      {retryError && <p role="alert">{retryError}</p>}
      {(query.error || pollingStopped) && (
        <button
          type="button"
          onClick={() => {
            polls.current = 0;
            setPollingStopped(false);
            void query.refetch();
          }}
        >
          Refresh analysis status
        </button>
      )}
      {query.data && (
        <details className="studio-submitted-source">
          <summary>Submitted source · read only</summary>
          <p className="studio-muted">
            Original source for this submission. Your editor draft stays
            unchanged.
          </p>
          <pre className="studio-json">{query.data.sourceCode}</pre>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(query.data!.sourceCode);
                setNotice("Submitted source copied.");
              } catch {
                setNotice("Select and copy the read-only source above.");
              }
            }}
          >
            <Copy size={13} />
            Copy submitted source
          </button>
        </details>
      )}
      {report?.status === "completed" && report.analysis && (
        <div className="studio-review-actions">
          <button
            className="studio-primary"
            type="button"
            disabled={discussDisabled}
            onClick={() => onDiscuss(job.submissionId)}
          >
            <MessageSquare size={14} />
            Discuss with ReasonAI
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(report.analysis!.summary);
                setNotice("Review summary copied.");
              } catch {
                setNotice("Select and copy the review summary above.");
              }
            }}
          >
            <Copy size={14} />
            Copy summary
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {report && (
        <p className="studio-review-footnote">
          Report {report.id.slice(0, 8)} · {report.model} · {report.rubric}
        </p>
      )}
      <p className="studio-review-footnote">
        AI insights are estimates, not another execution or proof of universal
        correctness.
      </p>
    </section>
  );
}

export function SubmissionResults({
  job,
  userId,
  creating,
  error,
  loading,
  onDiscuss,
  discussDisabled,
  onCancel,
  cancelDisabled,
  cancelRequested,
}: {
  job?: ExecutionView;
  userId: string;
  creating: boolean;
  error?: string;
  loading: boolean;
  onDiscuss: (id: string) => void;
  discussDisabled: boolean;
  onCancel?: () => void;
  cancelDisabled: boolean;
  cancelRequested: boolean;
}) {
  const result = job?.result,
    active =
      creating ||
      loading ||
      job?.status === "queued" ||
      job?.status === "running";
  const passed =
    result && ["accepted", "provisional_pass"].includes(result.verdict);
  return (
    <>
      <div
        className={`studio-verdict-card ${active ? "processing" : !result ? "neutral" : !passed ? "error" : ""}`}
        aria-live="polite"
      >
        <div className="studio-verdict-top">
          <span>
            {active ? (
              <Clock3 size={20} />
            ) : passed ? (
              <Check size={20} />
            ) : result ? (
              <X size={20} />
            ) : (
              <Code2 size={20} />
            )}
          </span>
          <div>
            <h3>
              {creating
                ? "Sending submission…"
                : loading
                  ? "Loading saved submission…"
                  : result
                    ? verdictLabel(result.verdict)
                    : job?.status === "queued"
                      ? "Queued for sandbox"
                      : job?.status === "running"
                        ? "Running sandbox checks"
                        : job
                          ? job.status === "cancelled"
                            ? "Submission cancelled"
                            : job.status === "timed_out"
                              ? "Sandbox timed out"
                              : "Sandbox unavailable"
                          : "No submission yet"}
            </h3>
            <small>
              {result
                ? "Verified by Judge"
                : active
                  ? "Your editor remains available"
                  : "Submit your code when you are ready."}
            </small>
          </div>
        </div>
        {job && (
          <p className="studio-review-footnote">
            Submission {job.submissionId.slice(0, 8)} · {job.language} ·{" "}
            {new Date(job.createdAt).toLocaleString()}
          </p>
        )}
        {result && (
          <>
            <p>
              {passed
                ? "Your submitted solution matched the current test suite. The suite may evolve as problems are reviewed."
                : "This is the saved sandbox verdict. AI review is independent of this result."}
            </p>
            <div className="studio-judge-metrics">
              {result.executionTimeMs !== undefined && (
                <span>Execution: {result.executionTimeMs} ms</span>
              )}
              {result.memoryKiB !== undefined && (
                <span>Memory: {result.memoryKiB} KiB</span>
              )}
              {result.totalTests !== undefined &&
                result.passedTests !== undefined && (
                  <span>
                    {result.passedTests}/{result.totalTests} tests passed
                  </span>
                )}
            </div>
          </>
        )}
        {!result && (job?.error || error) && (
          <p role="alert">
            {job?.error ?? error} Your draft is retained. No trustworthy judge
            result is available for this attempt.
          </p>
        )}
        {active && job?.mode === "submit" && onCancel && (
          <button type="button" disabled={cancelDisabled} onClick={onCancel}>
            {cancelRequested ? "Cancellation requested" : "Cancel execution"}
          </button>
        )}
      </div>
      {job?.mode === "submit" &&
        job.result &&
        ["completed", "timed_out"].includes(job.status) && (
          <Report
            key={job.submissionId}
            job={job}
            userId={userId}
            onDiscuss={onDiscuss}
            discussDisabled={discussDisabled}
          />
        )}
    </>
  );
}

export function useSubmissionHistory({
  userId,
  problemId,
  versionId,
  job,
}: {
  userId: string;
  problemId: string;
  versionId: string;
  job?: ExecutionView;
}) {
  return useInfiniteQuery({
    queryKey: [
      "dsa-submission-history",
      userId,
      problemId,
      versionId,
      job?.status,
      job?.submissionId,
    ],
    initialPageParam: undefined as
      { before: string; beforeId: string } | undefined,
    queryFn: async ({ pageParam, signal }) =>
      historySchema.parse(
        await get(
          `/api/dsa/submissions?${new URLSearchParams({ problemId, problemVersionId: versionId, ...pageParam })}`,
          signal,
        ),
      ),
    getNextPageParam: (last) => last.next ?? undefined,
    retry: false,
    refetchInterval: (query) =>
      !job &&
      ["queued", "running"].includes(
        query.state.data?.pages[0]?.items[0]?.status ?? "",
      )
        ? 2000
        : false,
  });
}
export function SubmissionHistory({
  history,
  versionId,
  slug,
  selectedId,
  onSelect,
}: {
  history: ReturnType<typeof useSubmissionHistory>;
  versionId: string;
  slug: string;
  selectedId?: string;
  onSelect: () => void;
}) {
  const rows = history.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section
      className="studio-submission-history"
      aria-label="Saved submissions"
    >
      <div className="studio-review-heading">
        <h3>Submission history</h3>
        <History size={17} />
      </div>
      <p className="studio-muted">
        Choose an attempt to view its saved result and AI review. Your current
        editor stays unchanged.
      </p>
      {history.isPending ? (
        <p role="status">Loading submission history…</p>
      ) : history.error ? (
        <>
          <p role="alert">Saved history is temporarily unavailable.</p>
          <button type="button" onClick={() => void history.refetch()}>
            Retry history
          </button>
        </>
      ) : !rows.length ? (
        <p>No judged submissions for this version yet.</p>
      ) : (
        <ol className="studio-submission-timeline">
          {rows.map((row) => (
            <li key={row.submissionId}>
              <Link
                className={selectedId === row.submissionId ? "current" : ""}
                href={`/dsa/problem/${encodeURIComponent(slug)}?version=${versionId}&submission=${row.submissionId}`}
                aria-current={
                  selectedId === row.submissionId ? "page" : undefined
                }
                onClick={onSelect}
              >
                <strong>
                  {row.result
                    ? verdictLabel(row.result.verdict)
                    : row.status.replaceAll("_", " ")}
                </strong>
                <small>
                  {new Date(row.createdAt).toLocaleString()} · {row.language}
                </small>
                <small>Submission {row.submissionId.slice(0, 8)}</small>
                <span>View saved report →</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {history.hasNextPage && (
        <button
          type="button"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Load older submissions
        </button>
      )}
    </section>
  );
}
