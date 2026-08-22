import { Clock3, Tag } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { SystemDesignProblem } from "../types/system-design.types";

export interface SystemDesignProblemPanelProps {
  problem: SystemDesignProblem;
  className?: string;
}

/**
 * Tags are content, not a closed visual registry. Normalize authoring mistakes
 * without requiring a code change for each new tag that content introduces.
 */
export function normalizeSystemDesignProblemTags(
  tags: readonly string[],
): string[] {
  const seen = new Set<string>();
  return tags.flatMap((tag) => {
    const normalized = tag.trim();
    const identity = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(identity)) return [];
    seen.add(identity);
    return [normalized];
  });
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
  const tags = normalizeSystemDesignProblemTags(problem.tags);
  const statement = problem.problemStatement?.trim() || problem.summary;

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
          {statement}
        </p>
      </section>

      {problem.concepts && problem.concepts.length > 0 && (
        <section aria-labelledby="system-design-concepts-heading">
          <h3
            id="system-design-concepts-heading"
            className="text-xs font-semibold uppercase tracking-wider text-foreground"
          >
            Concepts
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {problem.concepts.map((concept) => (
              <li key={concept}>
                <Badge variant="outline">{concept}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {problem.followUpQuestions && problem.followUpQuestions.length > 0 && (
        <section aria-labelledby="system-design-follow-ups-heading">
          <h3
            id="system-design-follow-ups-heading"
            className="text-xs font-semibold uppercase tracking-wider text-foreground"
          >
            Follow-up questions
          </h3>
          <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-muted">
            {problem.followUpQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </section>
      )}

      {problem.notes?.trim() && (
        <section aria-labelledby="system-design-notes-heading">
          <h3
            id="system-design-notes-heading"
            className="text-xs font-semibold uppercase tracking-wider text-foreground"
          >
            Notes
          </h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted">
            {problem.notes}
          </p>
        </section>
      )}

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
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}
