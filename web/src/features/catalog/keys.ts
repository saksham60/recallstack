export interface CategoryContentFilters {
  page: number;
  pageSize: number;
  difficulty?: "easy" | "medium" | "hard";
  status?: "new" | "learning" | "attempted" | "confident" | "mastered";
  topic?: string;
  search?: string;
  sort?: "sort_order" | "title" | "difficulty" | "updated_at";
}

export const categoryKeys = {
  all: ["domain-categories"] as const,
  domain: (domainSlug: string) => [...categoryKeys.all, domainSlug] as const,
};

export const categoryContentKeys = {
  all: ["category-content"] as const,
  lists: () => [...categoryContentKeys.all, "list"] as const,
  list: (categoryId: string, filters: CategoryContentFilters) =>
    [...categoryContentKeys.lists(), categoryId, filters] as const,
};
