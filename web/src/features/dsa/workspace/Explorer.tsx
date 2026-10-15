"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, ArrowUpRight, Layers3 } from "lucide-react";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  useCatalog,
  useCatalogProgress,
  useTaxonomy,
  useStatistics,
  type Filters,
  type ProblemItem,
  type useDSAScope,
} from "./api";

type Scope = ReturnType<typeof useDSAScope>;
export function RequestError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div role="alert" className="studio-notice">
      <p>
        {getApiErrorMessage(
          error,
          "Could not reach the DSA service. Please try again.",
        )}
      </p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export function Explorer({
  scope,
  selected,
  onSelect,
  onClose,
}: {
  scope: Scope;
  selected?: string;
  onSelect: (problem: ProblemItem) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const catalog = useCatalog(scope, {
    ...filters,
    search: debounced || undefined,
  });
  const categories = useTaxonomy(scope, "categories"),
    topics = useTaxonomy(scope, "topics");
  const statistics = useStatistics(scope);
  const progress = useCatalogProgress(scope);
  const items = catalog.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <dialog
      ref={dialog}
      className="studio-explorer"
      aria-labelledby="explorer-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="studio-drawer">
        <header className="studio-toolbar">
          <div>
            <span className="studio-eyebrow">YOUR NEXT CHALLENGE</span>
            <h2 id="explorer-title">Problem explorer</h2>
          </div>
          <button
            type="button"
            className="studio-icon"
            aria-label="Close problem explorer"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        {scope.preview && (
          <p className="studio-notice">
            Reviewer preview · Specifications may still be awaiting approval.
          </p>
        )}
        {statistics.data && (
          <div className="studio-stats">
            <div>
              <b>{statistics.data.total_catalog_problems}</b>
              <span>Approved problems</span>
            </div>
            <div>
              <b>{statistics.data.attempted_problem_count}</b>
              <span>Practiced</span>
            </div>
            <div>
              <b>{statistics.data.mastered_problem_count}</b>
              <span>Mastered</span>
            </div>
          </div>
        )}
        <div className="studio-filters">
          <label className="studio-search">
            <Search size={16} />
            <input
              autoFocus
              aria-label="Search problems"
              placeholder="Search problem titles…"
              maxLength={200}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="studio-filter-row">
            <select
              aria-label="Difficulty filter"
              value={filters.difficulty ?? ""}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  difficulty: (event.target.value ||
                    undefined) as Filters["difficulty"],
                })
              }
            >
              <option value="">All difficulties</option>
              {["beginner", "easy", "medium", "hard", "expert"].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <select
              aria-label="Category filter"
              value={filters.category ?? ""}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  category: event.target.value || undefined,
                })
              }
            >
              <option value="">All categories</option>
              {categories.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.problem_count})
                </option>
              ))}
            </select>
            <select
              aria-label="Topic filter"
              value={filters.topic ?? ""}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  topic: event.target.value || undefined,
                })
              }
            >
              <option value="">All topics</option>
              {topics.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.problem_count})
                </option>
              ))}
            </select>
          </div>
          {(categories.error || topics.error) && (
            <RequestError
              error={categories.error ?? topics.error}
              retry={() => {
                void categories.refetch();
                void topics.refetch();
              }}
            />
          )}
        </div>
        <div className="studio-problem-list" aria-busy={catalog.isFetching}>
          {progress.error && (
            <RequestError
              error={progress.error}
              retry={() => void progress.refetch()}
            />
          )}
          {catalog.isPending ? (
            <div role="status" className="studio-empty">
              Loading problems…
            </div>
          ) : catalog.isError && !items.length ? (
            <RequestError
              error={catalog.error}
              retry={() => void catalog.refetch()}
            />
          ) : !items.length ? (
            <div className="studio-empty">
              <Layers3 size={30} />
              <h3>
                {search || Object.values(filters).some(Boolean)
                  ? "No matching problems"
                  : "No approved problems yet"}
              </h3>
              <p>
                {search || Object.values(filters).some(Boolean)
                  ? "Try another title or clear your filters."
                  : "Problem specifications will appear here after review and publication. Your existing study notes are available in the library."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilters({});
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            items.map((problem) => (
              <button
                type="button"
                key={problem.id}
                aria-current={selected === problem.id ? "true" : undefined}
                className="studio-problem-card"
                onClick={() => onSelect(problem)}
              >
                <span>
                  <strong>{problem.title}</strong>
                  <small>
                    {[...problem.categories, ...problem.topics]
                      .map((item) => item.name)
                      .join(" · ") || "Uncategorized"}
                  </small>
                </span>
                <span>
                  <span className={`studio-badge ${problem.difficulty ?? ""}`}>
                    {problem.difficulty ?? "Unrated"}
                  </span>
                  {scope.userId && (
                    <small>
                      {progress.data
                        ? (progress.data[problem.id] ?? "new")
                        : progress.error
                          ? "Progress unavailable"
                          : "Loading progress…"}
                    </small>
                  )}
                  {problem.availability === "review_pending" && (
                    <small>Review pending</small>
                  )}
                </span>
              </button>
            ))
          )}
          {catalog.isFetchNextPageError && (
            <RequestError
              error={catalog.error}
              retry={() => void catalog.fetchNextPage()}
            />
          )}
          {catalog.hasNextPage && (
            <button
              type="button"
              className="studio-load"
              disabled={catalog.isFetchingNextPage}
              onClick={() => void catalog.fetchNextPage()}
            >
              {catalog.isFetchingNextPage ? "Loading…" : "Load more problems"}
            </button>
          )}
        </div>
        <footer className="studio-toolbar">
          <span className="studio-muted">
            Sorted by title · {items.length} loaded
          </span>
          <Link href="/dsa/library">
            Study-note library <ArrowUpRight size={14} />
          </Link>
        </footer>
      </div>
    </dialog>
  );
}
