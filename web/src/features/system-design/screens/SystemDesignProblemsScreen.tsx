"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RotateCcw, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  buttonClass,
  inputClass,
} from "@/features/admin/components/AdminPrimitives";
import { SYSTEM_DESIGN_PROBLEMS } from "../data/system-design-problems";
import { createSystemDesignRepository } from "../repository/createSystemDesignRepository";
import type { SystemDesignRepository } from "../repository/SystemDesignRepository";
import type {
  ProblemStatus,
  SystemDesignDocumentSummary,
} from "../types/system-design.types";
import {
  getSystemDesignProblemStatus,
  SystemDesignProblemCard,
} from "../components/SystemDesignProblemCard";

const difficultyOptions = ["easy", "medium", "hard"] as const;
const statusOptions: ReadonlyArray<{ value: ProblemStatus; label: string }> = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];
const problemIds: ReadonlySet<string> = new Set<string>(
  SYSTEM_DESIGN_PROBLEMS.map((problem) => problem.id),
);

export function SystemDesignProblemsScreen() {
  const repositoryRef = useRef<SystemDesignRepository | null>(null);
  const [documentSummaries, setDocumentSummaries] = useState<
    SystemDesignDocumentSummary[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [status, setStatus] = useState("");

  const loadDocumentSummaries = useCallback(async () => {
    try {
      const repository =
        repositoryRef.current ?? createSystemDesignRepository();
      repositoryRef.current = repository;
      setDocumentSummaries(await repository.listDocumentSummaries());
      setLoadError(undefined);
    } catch (error) {
      setLoadError(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const retryDocumentSummaries = () => {
    setIsLoading(true);
    setLoadError(undefined);
    void loadDocumentSummaries();
  };

  useEffect(() => {
    void loadDocumentSummaries();

    const refreshFromLocalStorage = () => {
      void loadDocumentSummaries();
    };
    window.addEventListener("focus", refreshFromLocalStorage);
    window.addEventListener("storage", refreshFromLocalStorage);

    return () => {
      window.removeEventListener("focus", refreshFromLocalStorage);
      window.removeEventListener("storage", refreshFromLocalStorage);
    };
  }, [loadDocumentSummaries]);

  const summariesByProblemId = useMemo(
    () =>
      new Map<string, SystemDesignDocumentSummary>(
        documentSummaries.map((summary) => [summary.problemId, summary]),
      ),
    [documentSummaries],
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(SYSTEM_DESIGN_PROBLEMS.map((problem) => problem.category)),
      ).sort((left, right) => left.localeCompare(right)),
    [],
  );

  const filteredProblems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();

    return SYSTEM_DESIGN_PROBLEMS.filter((problem) => {
      const summary = summariesByProblemId.get(problem.id);
      const problemStatus = getSystemDesignProblemStatus(summary);
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          problem.title,
          problem.summary,
          problem.category,
          ...problem.tags,
          ...problem.requirements,
        ].some((value) =>
          value.toLocaleLowerCase().includes(normalizedSearch),
        );

      return (
        matchesSearch &&
        (!category || problem.category === category) &&
        (!difficulty || problem.difficulty === difficulty) &&
        (!status || problemStatus === status)
      );
    });
  }, [category, difficulty, search, status, summariesByProblemId]);

  const startedCount = useMemo(
    () =>
      documentSummaries.filter(
        (summary) =>
          problemIds.has(summary.problemId) &&
          getSystemDesignProblemStatus(summary) !== "not_started",
      ).length,
    [documentSummaries],
  );
  const completedCount = useMemo(
    () =>
      documentSummaries.filter(
        (summary) =>
          problemIds.has(summary.problemId) &&
          summary.status === "completed",
      ).length,
    [documentSummaries],
  );
  const hasFilters = Boolean(search || category || difficulty || status);

  const resetFilters = () => {
    setSearch("");
    setCategory("");
    setDifficulty("");
    setStatus("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Design Problems"
        description="Create and validate system-design exercises before releasing them to learners."
      />

      <section
        aria-label="System-design problem metrics"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Total problems"
          value={SYSTEM_DESIGN_PROBLEMS.length}
          hint="Placeholder exercise catalog"
        />
        <MetricCard
          label="Draft problems"
          value={SYSTEM_DESIGN_PROBLEMS.length}
          hint="Admin-only exercises"
        />
        <MetricCard
          label="Diagrams started"
          value={isLoading || loadError ? "—" : startedCount}
          hint="In-progress or completed diagrams"
        />
        <MetricCard
          label="Completed diagrams"
          value={isLoading || loadError ? "—" : completedCount}
          hint="Explicitly marked complete"
        />
      </section>

      <section
        aria-label="Problem filters"
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2 xl:grid-cols-[minmax(16rem,2fr)_1fr_1fr_1fr_auto]"
      >
        <label className="text-xs text-muted">
          Search
          <span className="relative mt-1 block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            />
            <input
              className={`${inputClass} pl-9`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search problems…"
            />
          </span>
        </label>

        <label className="text-xs text-muted">
          Category
          <select
            className={`${inputClass} mt-1`}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted">
          Difficulty
          <select
            className={`${inputClass} mt-1`}
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            <option value="">All difficulties</option>
            {difficultyOptions.map((value) => (
              <option key={value} value={value}>
                {value[0].toUpperCase()}
                {value.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted">
          Status
          <select
            className={`${inputClass} mt-1`}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          className={`${buttonClass} self-end gap-2`}
          disabled={!hasFilters}
          onClick={resetFilters}
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Clear
        </button>
      </section>

      <p className="text-sm text-muted" aria-live="polite">
        Showing {filteredProblems.length} of {SYSTEM_DESIGN_PROBLEMS.length}{" "}
        problems
      </p>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : loadError ? (
        <ErrorState
          title="Could not load saved diagrams"
          description={
            loadError instanceof Error
              ? loadError.message
              : "Saved diagram summaries could not be read from local storage."
          }
          action={
            <button className={buttonClass} onClick={retryDocumentSummaries}>
              Try again
            </button>
          }
        />
      ) : filteredProblems.length === 0 ? (
        <EmptyState
          title="No problems match these filters"
          description="Try clearing or broadening the filters."
          action={
            <button className={buttonClass} onClick={resetFilters}>
              Clear filters
            </button>
          }
        />
      ) : (
        <section
          aria-label="System-design problems"
          className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
        >
          {filteredProblems.map((problem) => (
            <SystemDesignProblemCard
              key={problem.id}
              problem={problem}
              documentSummary={summariesByProblemId.get(problem.id)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
