import type {
  SystemDesignProblem,
  SystemDesignDifficulty,
} from "../types/system-design.types";

export interface SystemDesignProblemFilters {
  search?: string;
  category?: string;
  difficulty?: "" | SystemDesignDifficulty;
  tag?: string;
}

export function getSystemDesignProblemTags(
  problems: readonly SystemDesignProblem[],
): string[] {
  return Array.from(
    new Set(
      problems.flatMap((problem) =>
        problem.tags.map((tag) => tag.trim()).filter(Boolean),
      ),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function matchesSystemDesignProblemFilters(
  problem: SystemDesignProblem,
  filters: SystemDesignProblemFilters,
): boolean {
  const normalizeSearchText = (value: string) =>
    value.trim().toLocaleLowerCase().replace(/[-_]+/g, " ");
  const search = normalizeSearchText(filters.search ?? "");
  const searchableValues = [
    problem.title,
    problem.summary,
    problem.problemStatement,
    problem.category,
    problem.notes,
    ...problem.tags,
    ...problem.requirements,
    ...problem.scaleAssumptions,
    ...(problem.concepts ?? []),
    ...(problem.followUpQuestions ?? []),
  ].filter((value): value is string => Boolean(value));

  return (
    (!search ||
      searchableValues.some((value) =>
        normalizeSearchText(value).includes(search),
      )) &&
    (!filters.category || problem.category === filters.category) &&
    (!filters.difficulty || problem.difficulty === filters.difficulty) &&
    (!filters.tag || problem.tags.includes(filters.tag))
  );
}

export function formatSystemDesignProblemTag(tag: string): string {
  return tag
    .split("-")
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}
