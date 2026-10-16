"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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
import type { ExecutionView } from "./contract";

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
    <section>
      <h4>{title}</h4>
      {items.length ? (
        <ul>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="studio-muted">Not yet available.</p>
      )}
    </section>
  );
}
function Analysis({
  analysis,
  onFollowup,
}: {
  analysis: CodeAnalysis;
  onFollowup?: (summary: string) => void;
}) {
  return (
    <>
      <p>{analysis.summary}</p>
      <section>
        <h4>Estimated complexity</h4>
        <p>
          Time: <code>{analysis.complexity.time}</code> · Space:{" "}
          <code>{analysis.complexity.space}</code>
        </p>
        <p>{analysis.complexity.explanation}</p>
        <p className="studio-muted">
          Confidence: {analysis.complexity.confidence}. These are AI estimates.
        </p>
        <Items title="Caveats" items={analysis.complexity.caveats} />
      </section>
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
        <summary>Correctness insights</summary>
        <Items title="Evidence" items={analysis.correctness.evidence} />
        <Items title="Assumptions" items={analysis.correctness.assumptions} />
        <Items
          title="Edge-case categories"
          items={analysis.correctness.edgeCases}
        />
        <Items title="Invariants" items={analysis.correctness.invariants} />
      </details>
      <details>
        <summary>Optimization opportunities</summary>
        <Items title="Approaches" items={analysis.optimization.approaches} />
        <Items title="Trade-offs" items={analysis.optimization.tradeoffs} />
        <Items title="Patterns" items={analysis.optimization.patterns} />
        <Items title="Suggestions" items={analysis.optimization.suggestions} />
      </details>
      <details>
        <summary>Learning profile</summary>
        <Items title="Strengths" items={analysis.learning.strengths} />
        <Items title="Areas to practice" items={analysis.learning.practice} />
        <Items title="Concepts" items={analysis.learning.concepts} />
        <p>{analysis.learning.earlierAttempts}</p>
      </details>
      {onFollowup && (
        <button type="button" onClick={() => onFollowup(analysis.summary)}>
          Ask AI Tutor about this analysis
        </button>
      )}
    </>
  );
}
function Report({
  job,
  userId,
  onFollowup,
}: {
  job: ExecutionView;
  userId: string;
  onFollowup?: (summary: string) => void;
}) {
  const polls = useRef(0);
  const [pollingStopped, setPollingStopped] = useState(false);
  const query = useQuery({
    queryKey: ["dsa-code-intelligence", userId, job.submissionId],
    queryFn: async ({ signal }) => {
      polls.current++;
      if (polls.current >= 60) setPollingStopped(true);
      return reportResponseSchema.parse(
        await get(`/api/dsa/submissions/${job.submissionId}/report`, signal),
      );
    },
    retry: false,
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
  return (
    <section
      className="studio-code-intelligence"
      aria-label="Code Intelligence"
    >
      <h3>Code Intelligence</h3>
      <span className="studio-eyebrow">Estimated by AI</span>
      <p className="studio-muted">
        Analysis cannot change the official judge result or mark a problem
        mastered.
      </p>
      {query.data && (
        <details>
          <summary>Submitted source · read only</summary>
          <p className="studio-muted">
            This is the exact source for this saved submission. Your editor
            draft is separate.
          </p>
          <pre className="studio-json">{query.data.sourceCode}</pre>
        </details>
      )}
      {query.isPending ? (
        <p role="status">Loading saved analysis…</p>
      ) : query.error ? (
        <p role="alert">
          Saved analysis is temporarily unavailable. Your judge result is
          retained.
        </p>
      ) : report?.status === "completed" && report.analysis ? (
        <Analysis analysis={report.analysis} onFollowup={onFollowup} />
      ) : report?.status === "failed" || report?.status === "rate_limited" ? (
        <p role="status">
          {report.error ??
            "Analysis is not yet available. The judge result is saved."}
        </p>
      ) : query.data?.enabled ? (
        <p role="status">
          {pollingStopped
            ? "Analysis has not arrived yet. Check its saved status again later."
            : "Code Intelligence is queued or generating. Your judge result is already saved."}
        </p>
      ) : (
        <p>
          Not Yet Available · Code Intelligence generation is not enabled in
          this environment.
        </p>
      )}
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
      {report && (
        <p className="studio-muted">
          Report {report.id.slice(0, 8)} · {report.model} · {report.rubric}
        </p>
      )}
    </section>
  );
}
export function SubmissionIntelligence({
  userId,
  problemId,
  versionId,
  slug,
  job,
  onFollowup,
}: {
  userId: string;
  problemId: string;
  versionId: string;
  slug: string;
  job?: ExecutionView;
  onFollowup?: (summary: string) => void;
}) {
  const history = useInfiniteQuery({
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
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        problemId,
        problemVersionId: versionId,
        ...pageParam,
      });
      return historySchema.parse(
        await get(`/api/dsa/submissions?${params}`, signal),
      );
    },
    getNextPageParam: (last) => last.next ?? undefined,
    retry: false,
  });
  const eligible =
    job?.mode === "submit" &&
    !!job.result &&
    ["completed", "timed_out"].includes(job.status);
  const rows = history.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      {eligible && (
        <Report
          key={job.submissionId}
          userId={userId}
          job={job}
          onFollowup={onFollowup}
        />
      )}
      <section
        className="studio-code-intelligence"
        aria-label="Saved submissions"
      >
        <h3>Previous submissions</h3>
        {history.isPending ? (
          <p role="status">Loading submission history…</p>
        ) : history.error ? (
          <>
            <p>
              Saved history is temporarily unavailable. Current execution
              details remain above.
            </p>
            <button type="button" onClick={() => void history.refetch()}>
              Retry history
            </button>
          </>
        ) : !rows.length ? (
          <p className="studio-muted">
            No judged submissions for this version yet.
          </p>
        ) : (
          <ol>
            {rows.map((row) => (
              <li key={row.submissionId}>
                <Link
                  href={`/dsa/problem/${encodeURIComponent(slug)}?version=${versionId}&submission=${row.submissionId}`}
                  aria-current={
                    job?.submissionId === row.submissionId ? "page" : undefined
                  }
                >
                  {row.result?.verdict.replaceAll("_", " ") ??
                    row.status.replaceAll("_", " ")}{" "}
                  · {new Date(row.createdAt).toLocaleString()}
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
    </>
  );
}
