import { Clock3, Tag } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { SystemDesignProblem } from "../types/system-design.types";

export interface SystemDesignProblemPanelProps {
  problem: SystemDesignProblem;
  className?: string;
}

function difficultyVariant(
  difficulty: SystemDesignProblem["difficulty"],
): "success" | "warning" | "danger" {
  if (difficulty === "easy") return "success";
  if (difficulty === "medium") return "warning";
  return "danger";
}

export function SystemDesignProblemPanel({
  problem,
  className = "",
}: SystemDesignProblemPanelProps) {
  return (
    <div className={`space-y-5 ${className}`}>
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={difficultyVariant(problem.difficulty)}>
            {problem.difficulty}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            {problem.estimatedMinutes} minutes
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {problem.summary}
        </p>
      </section>

      <section aria-labelledby="system-design-requirements-heading">
        <h3
          id="system-design-requirements-heading"
          className="text-xs font-semibold uppercase tracking-wider text-foreground"
        >
          Functional requirements
        </h3>
        <ul className="mt-2 space-y-2">
          {problem.requirements.map((requirement) => (
            <li
              key={requirement}
              className="flex gap-2 text-xs leading-relaxed text-muted"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{requirement}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="system-design-scale-heading">
        <h3
          id="system-design-scale-heading"
          className="text-xs font-semibold uppercase tracking-wider text-foreground"
        >
          Scale assumptions
        </h3>
        <ul className="mt-2 space-y-2">
          {problem.scaleAssumptions.map((assumption) => (
            <li
              key={assumption}
              className="rounded-md border border-border bg-background/50 px-2.5 py-2 text-xs leading-relaxed text-muted"
            >
              {assumption}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="system-design-tags-heading">
        <h3
          id="system-design-tags-heading"
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground"
        >
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          Tags
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {problem.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}
