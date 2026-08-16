import Link from "next/link";
import { ArrowRight, Clock3, Network } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type {
  ProblemStatus,
  SystemDesignDocumentSummary,
  SystemDesignProblem,
} from "../types/system-design.types";

const statusPresentation: Record<
  ProblemStatus,
  { label: string; variant: "outline" | "warning" | "success" }
> = {
  not_started: { label: "Not started", variant: "outline" },
  in_progress: { label: "In progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
};

const difficultyVariant = {
  easy: "success",
  medium: "warning",
  hard: "danger",
} as const;

function formatLastEdited(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function getSystemDesignProblemStatus(
  documentSummary?: SystemDesignDocumentSummary,
): ProblemStatus {
  if (documentSummary?.status === "completed") return "completed";
  if (documentSummary && documentSummary.nodeCount > 0) return "in_progress";
  return "not_started";
}

export function SystemDesignProblemCard({
  problem,
  documentSummary,
}: {
  problem: SystemDesignProblem;
  documentSummary?: SystemDesignDocumentSummary;
}) {
  const status = getSystemDesignProblemStatus(documentSummary);
  const statusMeta = statusPresentation[status];

  return (
    <article className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition hover:border-accent/60 hover:bg-surface-elevated/50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-lg border border-accent/30 bg-accent/10 p-2 text-accent">
            <Network aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">{problem.title}</h2>
            <p className="mt-1 text-xs text-muted">{problem.category}</p>
          </div>
        </div>
        <Badge variant={difficultyVariant[problem.difficulty]}>
          {problem.difficulty[0].toUpperCase()}
          {problem.difficulty.slice(1)}
        </Badge>
      </div>

      <p className="mt-4 line-clamp-3 flex-1 text-sm leading-6 text-muted">
        {problem.summary}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
          {problem.estimatedMinutes} minutes
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
        <div>
          <dt className="text-muted">Saved nodes</dt>
          <dd className="mt-1 font-medium tabular-nums text-foreground">
            {documentSummary?.nodeCount ?? 0}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-muted">Last edited</dt>
          <dd className="mt-1 truncate font-medium text-foreground">
            {documentSummary
              ? formatLastEdited(documentSummary.updatedAt)
              : "Not yet"}
          </dd>
        </div>
      </dl>

      <Link
        href={`/system-design/${problem.id}`}
        className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-4 text-sm font-medium text-accent transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Open Editor
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </article>
  );
}
