"use client";

import Link from "next/link";
import { BookmarkButton } from "@/features/bookmarks";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useCategoryContent } from "../use-category-content";
import { DifficultyBadge } from "./DifficultyBadge";

function StatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "mastered": return <Badge variant="success">Mastered</Badge>;
    case "confident": return <Badge>Confident</Badge>;
    case "learning": return <Badge variant="warning">Learning</Badge>;
    case "attempted": return <Badge variant="secondary">Attempted</Badge>;
    default: return <Badge variant="outline">Not Started</Badge>;
  }
}

export function CategoryContentScreen({ categoryId, domainSlug }: { categoryId: string; domainSlug: string }) {
  const { data, isLoading, error } = useCategoryContent({ categoryId });

  if (isLoading) {
    return <div className="space-y-6"><div className="h-8 w-1/4 rounded bg-surface animate-pulse" /><div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 rounded-xl border border-border bg-surface animate-pulse" />)}</div></div>;
  }

  if (error || !data) {
    return <ErrorState title="Failed to load content" description={getApiErrorMessage(error, "Please try again later.")} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4"><Link href={`/${domainSlug}`} className="text-muted hover:text-foreground transition-colors">← Back</Link><h1 className="text-2xl font-bold tracking-tight">Category Content</h1></div>
      <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-elevated text-muted uppercase border-b border-border"><tr><th className="px-6 py-4 font-medium">Problem</th><th className="px-6 py-4 font-medium">Pattern</th><th className="px-6 py-4 font-medium">Difficulty</th><th className="px-6 py-4 font-medium">Status</th><th className="px-6 py-4 font-medium text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-border">
              {data.items.map((item) => (
                <tr key={item.content_item_id} className="hover:bg-surface-elevated/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground"><Link href={`/content/${item.slug}`} className="hover:text-accent">{item.title}</Link></td>
                  <td className="px-6 py-4 text-muted">{item.primary_topic?.name || "—"}</td>
                  <td className="px-6 py-4"><DifficultyBadge difficulty={item.difficulty} /></td>
                  <td className="px-6 py-4"><StatusBadge status={item.user_progress.status} /></td>
                  <td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-2"><BookmarkButton contentId={item.content_item_id} isBookmarked={item.is_bookmarked} /><Link href={`/content/${item.slug}`} className="text-accent hover:text-accent/80 font-medium">Study →</Link></div></td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={5} className="px-6 py-12 text-center text-muted">No content available in this category yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-between items-center text-sm text-muted"><span>Showing {data.items.length} items</span>{data.pagination.total_pages > 1 && <span>Page {data.pagination.page} of {data.pagination.total_pages}</span>}</div>
    </div>
  );
}
