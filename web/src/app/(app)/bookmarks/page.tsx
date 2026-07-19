"use client";

import React from "react";
import Link from "next/link";
import { useBookmarks } from "@/features/bookmarks/use-bookmarks";
import { BookmarkButton } from "@/features/bookmarks/components/BookmarkButton";

export default function BookmarksPage() {
  const { data, isLoading, error } = useBookmarks(1, 50);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Bookmarks</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-border bg-surface shadow-sm animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-surface-elevated p-6 text-center border border-danger/20">
        <h3 className="text-lg font-medium text-danger">Failed to load bookmarks</h3>
        <p className="text-muted text-sm mt-2">Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bookmarks</h1>
          <p className="text-muted text-sm mt-1">Quick access to saved content.</p>
        </div>
        <span className="text-sm text-muted bg-surface-elevated px-3 py-1 rounded-full border border-border">
          {data.pagination.total_items} items
        </span>
      </div>

      {data.items.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl bg-surface/50">
          <p className="text-muted">You haven't bookmarked any content yet.</p>
          <Link href="/dsa" className="text-accent hover:underline mt-2 inline-block">
            Browse content
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((bookmark) => (
            <div 
              key={bookmark.content_item_id}
              className="group flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-accent hover:shadow-md"
            >
              <div className="flex justify-between items-start gap-4 mb-2">
                <Link href={`/content/${bookmark.slug}`} className="font-semibold tracking-tight group-hover:text-accent transition-colors line-clamp-2 flex-1">
                  {bookmark.title}
                </Link>
                <BookmarkButton contentId={bookmark.content_item_id} isBookmarked={true} className="-mt-2 -mr-2" />
              </div>
              
              <div className="mt-auto pt-4 text-xs text-muted flex justify-between items-center">
                <span>Saved on {new Date(bookmark.created_at).toLocaleDateString()}</span>
                <Link href={`/content/${bookmark.slug}`} className="text-accent hover:underline font-medium">
                  Review →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
