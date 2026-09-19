"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookmarkButton } from "@/features/bookmarks";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  CATEGORY_CONTENT_PAGE_SIZE,
  getVisibleRange,
  hasActiveCategoryContentFilters,
  readCategoryContentListState,
  updateCategoryContentListParams,
} from "../category-content-list-state";
import type { CategoryContentItemResponse } from "../use-category-content";
import { useCategoryContent } from "../use-category-content";
import { DifficultyBadge } from "./DifficultyBadge";

const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40";
const fieldClass = "min-h-10 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent";

function StatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "mastered": return <Badge variant="success">Mastered</Badge>;
    case "confident": return <Badge>Confident</Badge>;
    case "learning": return <Badge variant="warning">Learning</Badge>;
    case "attempted": return <Badge variant="secondary">Attempted</Badge>;
    default: return <Badge variant="outline">Not Started</Badge>;
  }
}

function LoadingRows() {
  return (
    <div role="status" aria-label="Loading problems" className="space-y-3">
      <span className="sr-only">Loading problems…</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-xl border border-border bg-surface" />
      ))}
    </div>
  );
}

function ProblemActions({ item, domainSlug }: { item: CategoryContentItemResponse; domainSlug: string }) {
  const href = domainSlug === "dsa" ? `/dsa/problem/${item.slug}` : `/content/${item.slug}`;
  return (
    <div className="flex items-center justify-end gap-2">
      <BookmarkButton contentId={item.content_item_id} isBookmarked={item.is_bookmarked} />
      <Link href={href} className="whitespace-nowrap font-medium text-accent hover:text-accent/80">
        {domainSlug === "dsa" ? "Practice →" : "Study →"}
      </Link>
    </div>
  );
}

function DesktopTable({ items, domainSlug }: { items: CategoryContentItemResponse[]; domainSlug: string }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-surface-elevated text-muted uppercase">
          <tr>
            <th className="px-6 py-4 font-medium">Problem</th>
            <th className="px-6 py-4 font-medium">Pattern</th>
            <th className="px-6 py-4 font-medium">Difficulty</th>
            <th className="px-6 py-4 font-medium">Status</th>
            <th className="px-6 py-4 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.content_item_id} className="transition-colors hover:bg-surface-elevated/50">
              <td className="px-6 py-4 font-medium text-foreground">
                <Link href={domainSlug === "dsa" ? `/dsa/problem/${item.slug}` : `/content/${item.slug}`} className="hover:text-accent">{item.title}</Link>
              </td>
              <td className="px-6 py-4 text-muted">{item.primary_topic?.name || "—"}</td>
              <td className="px-6 py-4"><DifficultyBadge difficulty={item.difficulty} /></td>
              <td className="px-6 py-4"><StatusBadge status={item.user_progress.status} /></td>
              <td className="px-6 py-4 text-right"><ProblemActions item={item} domainSlug={domainSlug} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileList({ items, domainSlug }: { items: CategoryContentItemResponse[]; domainSlug: string }) {
  return (
    <ul className="divide-y divide-border md:hidden" aria-label="Problems">
      {items.map((item) => (
        <li key={item.content_item_id} className="space-y-3 p-4">
          <div className="min-w-0">
            <Link href={domainSlug === "dsa" ? `/dsa/problem/${item.slug}` : `/content/${item.slug}`} className="font-medium text-foreground hover:text-accent">{item.title}</Link>
            <p className="mt-1 truncate text-xs text-muted">{item.primary_topic?.name || "No pattern"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DifficultyBadge difficulty={item.difficulty} />
            <StatusBadge status={item.user_progress.status} />
            <div className="ml-auto"><ProblemActions item={item} domainSlug={domainSlug} /></div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CategoryContentScreen({ categoryId, domainSlug }: { categoryId: string; domainSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = readCategoryContentListState(searchParams);
  const queryString = searchParams.toString();
  const currentParams = new URLSearchParams(queryString);
  const hasFilters = hasActiveCategoryContentFilters(currentParams);
  const { data, isLoading, isFetching, error, refetch } = useCategoryContent({
    categoryId,
    page: state.page,
    pageSize: CATEGORY_CONTENT_PAGE_SIZE,
    difficulty: state.difficulty,
    status: state.status,
    topic: state.topic,
    search: state.search,
    sort: state.sort,
  });

  const totalPages = data?.pagination.total_pages ?? 0;
  const lastUsablePage = Math.max(1, totalPages);
  const pageIsOutOfRange = !!data && state.page > lastUsablePage;

  const navigate = (updates: Record<string, string | number | undefined>, resetPage = false, replace = false) => {
    const next = updateCategoryContentListParams(new URLSearchParams(queryString), updates, { resetPage });
    const href = next.size ? `${pathname}?${next.toString()}` : pathname;
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  };

  useEffect(() => {
    if (!data) return;
    const rawPage = searchParams.get("page");
    const canonicalPage = state.page > lastUsablePage ? lastUsablePage : state.page;
    const rawPageIsCanonical = rawPage === null ? canonicalPage === 1 : rawPage === String(canonicalPage);
    if (!rawPageIsCanonical) {
      const next = updateCategoryContentListParams(new URLSearchParams(queryString), { page: canonicalPage });
      router.replace(next.size ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
    }
  }, [data, lastUsablePage, pathname, queryString, router, searchParams, state.page]);

  const handleTextFilters = (formData: FormData) => {
    navigate({
      search: String(formData.get("search") ?? ""),
      topic: String(formData.get("topic") ?? ""),
    }, true);
  };

  const range = data ? getVisibleRange(data.pagination.page, data.pagination.page_size, data.pagination.total_items) : { start: 0, end: 0 };

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href={`/${domainSlug}`} className="text-muted transition-colors hover:text-foreground">← Back</Link>
        <h1 className="text-2xl font-bold tracking-tight">Category Content</h1>
      </div>

      <form action={handleTextFilters} className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,2fr)_minmax(9rem,1fr)_repeat(3,minmax(8rem,1fr))_auto]">
        <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">
          Search
          <input key={`search-${state.search ?? ""}`} name="search" type="search" defaultValue={state.search} placeholder="Search problems" className={fieldClass} />
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">
          Topic
          <input key={`topic-${state.topic ?? ""}`} name="topic" defaultValue={state.topic} placeholder="Topic slug" className={fieldClass} />
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">
          Difficulty
          <select aria-label="Difficulty" value={state.difficulty ?? ""} onChange={(event) => navigate({ difficulty: event.target.value }, true)} className={fieldClass}>
            <option value="">All difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">
          Status
          <select aria-label="Status" value={state.status ?? ""} onChange={(event) => navigate({ status: event.target.value }, true)} className={fieldClass}>
            <option value="">All statuses</option>
            <option value="new">Not started</option>
            <option value="learning">Learning</option>
            <option value="attempted">Attempted</option>
            <option value="confident">Confident</option>
            <option value="mastered">Mastered</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-muted">
          Sort
          <select aria-label="Sort" value={state.sort} onChange={(event) => navigate({ sort: event.target.value === "sort_order" ? undefined : event.target.value }, true)} className={fieldClass}>
            <option value="sort_order">Sheet order</option>
            <option value="title">Title</option>
            <option value="difficulty">Difficulty</option>
            <option value="updated_at">Recently updated</option>
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <button type="submit" className={`${buttonClass} flex-1`}>Apply</button>
          {hasFilters && <button type="button" onClick={() => router.push(pathname, { scroll: false })} className={buttonClass}>Clear</button>}
        </div>
      </form>

      {error ? (
        <ErrorState
          title="Failed to load content"
          description={getApiErrorMessage(error, "Please try again later.")}
          action={<button type="button" onClick={() => void refetch()} className={buttonClass}>Try again</button>}
        />
      ) : isLoading || pageIsOutOfRange ? (
        <LoadingRows />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No problems match these filters" : "No problems in this category yet"}
          description={hasFilters ? "Try clearing or changing a filter." : "Published problems will appear here."}
          action={hasFilters ? <button type="button" onClick={() => router.push(pathname, { scroll: false })} className={buttonClass}>Clear filters</button> : undefined}
        />
      ) : data ? (
        <div className={`overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-opacity ${isFetching ? "opacity-70" : "opacity-100"}`} aria-busy={isFetching}>
          <DesktopTable items={data.items} domainSlug={domainSlug} />
          <MobileList items={data.items} domainSlug={domainSlug} />
        </div>
      ) : null}

      {data && !pageIsOutOfRange && !error && (
        <nav aria-label="Pagination" className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span aria-live="polite">Showing {range.start}–{range.end} of {data.pagination.total_items}</span>
          <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
            <button type="button" disabled={state.page <= 1 || isFetching} onClick={() => navigate({ page: state.page - 1 })} className={`${buttonClass} min-w-0 flex-1 sm:flex-none`}>Previous</button>
            <span className="shrink-0 whitespace-nowrap px-1 text-foreground">Page {state.page} of {lastUsablePage}</span>
            <button type="button" disabled={state.page >= lastUsablePage || isFetching} onClick={() => navigate({ page: state.page + 1 })} className={`${buttonClass} min-w-0 flex-1 sm:flex-none`}>Next</button>
          </div>
        </nav>
      )}
    </div>
  );
}
