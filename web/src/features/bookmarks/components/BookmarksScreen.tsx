"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { getApiErrorMessage } from "@/lib/api/errors";
import { BookmarkButton } from "./BookmarkButton";
import { useBookmarks } from "../use-bookmarks";

export function BookmarksScreen() {
  const { data, isLoading, error } = useBookmarks(1, 50);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Bookmarks</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-24 rounded-xl border border-border bg-surface shadow-sm animate-pulse" />)}</div>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState title="Failed to load bookmarks" description={getApiErrorMessage(error, "Please try again later.")} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">Bookmarks</h1><p className="text-muted text-sm mt-1">Quick access to saved content.</p></div>
        <span className="text-sm text-muted bg-surface-elevated px-3 py-1 rounded-full border border-border">{data.pagination.total_items} items</span>
      </div>

      {data.items.length === 0 ? (
        <EmptyState title="You haven't bookmarked any content yet." action={<Link href="/dsa" className="text-accent hover:underline">Browse content</Link>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((bookmark) => (
            <div key={bookmark.content_item_id} className="group flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-accent hover:shadow-md">
              <div className="flex justify-between items-start gap-4 mb-2">
                <Link href={`/content/${bookmark.slug}`} className="font-semibold tracking-tight group-hover:text-accent transition-colors line-clamp-2 flex-1">{bookmark.title}</Link>
                <BookmarkButton contentId={bookmark.content_item_id} isBookmarked className="-mt-2 -mr-2" />
              </div>
              <div className="mt-auto pt-4 text-xs text-muted flex justify-between items-center">
                <span>Saved on {new Date(bookmark.created_at).toLocaleDateString()}</span>
                <Link href={`/content/${bookmark.slug}`} className="text-accent hover:underline font-medium">Review →</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
