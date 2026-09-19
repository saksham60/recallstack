export const CATEGORY_CONTENT_PAGE_SIZE = 25;

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const LEARNING_STATUSES = ["new", "learning", "attempted", "confident", "mastered"] as const;
export const CATEGORY_CONTENT_SORTS = ["sort_order", "title", "difficulty", "updated_at"] as const;

export type DifficultyFilter = (typeof DIFFICULTIES)[number];
export type LearningStatusFilter = (typeof LEARNING_STATUSES)[number];
export type CategoryContentSort = (typeof CATEGORY_CONTENT_SORTS)[number];

export interface CategoryContentListState {
  page: number;
  search?: string;
  difficulty?: DifficultyFilter;
  status?: LearningStatusFilter;
  topic?: string;
  sort: CategoryContentSort;
}

type SearchParamsReader = Pick<URLSearchParams, "get">;
type QueryValue = string | number | undefined;

function isOneOf<T extends string>(value: string | null, choices: readonly T[]): value is T {
  return value !== null && choices.some((choice) => choice === value);
}

export function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function optionalText(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readCategoryContentListState(searchParams: SearchParamsReader): CategoryContentListState {
  const difficulty = searchParams.get("difficulty");
  const status = searchParams.get("status");
  const sort = searchParams.get("sort");

  return {
    page: parsePage(searchParams.get("page")),
    search: optionalText(searchParams.get("search")),
    difficulty: isOneOf(difficulty, DIFFICULTIES) ? difficulty : undefined,
    status: isOneOf(status, LEARNING_STATUSES) ? status : undefined,
    topic: optionalText(searchParams.get("topic")),
    sort: isOneOf(sort, CATEGORY_CONTENT_SORTS) ? sort : "sort_order",
  };
}

export function updateCategoryContentListParams(
  current: URLSearchParams,
  updates: Record<string, QueryValue>,
  { resetPage = false }: { resetPage?: boolean } = {},
): URLSearchParams {
  const next = new URLSearchParams(current);

  for (const [key, value] of Object.entries(updates)) {
    const normalized = typeof value === "string" ? value.trim() : value;
    if (normalized === undefined || normalized === "" || (key === "page" && normalized === 1)) {
      next.delete(key);
    } else {
      next.set(key, String(normalized));
    }
  }

  if (resetPage) next.delete("page");
  return next;
}

export function getVisibleRange(
  page: number,
  pageSize: number,
  totalItems: number,
): { start: number; end: number } {
  if (totalItems === 0) return { start: 0, end: 0 };
  return {
    start: (page - 1) * pageSize + 1,
    end: Math.min(page * pageSize, totalItems),
  };
}

export function hasActiveCategoryContentFilters(searchParams: URLSearchParams): boolean {
  return Array.from(searchParams.keys()).some((key) => key !== "page");
}
