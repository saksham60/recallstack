"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCategoryContent } from "@/features/catalog/use-category-content";
import { Badge } from "@/components/ui/Badge";
import { BookmarkButton } from "@/features/bookmarks/components/BookmarkButton";

export default function CategoryContentPage() {
  const params = useParams();
  const categoryId = params.categoryId as string;
  const { data, isLoading, error } = useCategoryContent({ categoryId });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-1/4 rounded bg-surface animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-border bg-surface animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md bg-surface-elevated p-6 text-center border border-danger/20">
        <h3 className="text-lg font-medium text-danger">Failed to load content</h3>
        <p className="text-muted text-sm mt-2">Please try again later.</p>
      </div>
    );
  }

  const getDifficultyBadge = (diff: string | null) => {
    switch (diff?.toLowerCase()) {
      case "easy": return <Badge variant="success">Easy</Badge>;
      case "medium": return <Badge variant="warning">Medium</Badge>;
      case "hard": return <Badge variant="danger">Hard</Badge>;
      default: return null;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "mastered": return <Badge variant="success">Mastered</Badge>;
      case "confident": return <Badge variant="default">Confident</Badge>;
      case "learning": return <Badge variant="warning">Learning</Badge>;
      case "attempted": return <Badge variant="secondary">Attempted</Badge>;
      default: return <Badge variant="outline">Not Started</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dsa" className="text-muted hover:text-foreground transition-colors">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Category Content</h1>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-elevated text-muted uppercase border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Problem</th>
                <th className="px-6 py-4 font-medium">Pattern</th>
                <th className="px-6 py-4 font-medium">Difficulty</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((item) => (
                <tr key={item.content_item_id} className="hover:bg-surface-elevated/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">
                    <Link href={`/content/${item.slug}`} className="hover:text-accent">
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-muted">
                    {item.primary_topic?.name || "—"}
                  </td>
                  <td className="px-6 py-4">
                    {getDifficultyBadge(item.difficulty)}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(item.user_progress?.status)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <BookmarkButton contentId={item.content_item_id} isBookmarked={item.is_bookmarked} />
                      <Link 
                        href={`/content/${item.slug}`}
                        className="text-accent hover:text-accent/80 font-medium"
                      >
                        Study →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted">
                    No content available in this category yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Pagination would go here */}
      <div className="flex justify-between items-center text-sm text-muted">
        <span>Showing {data.items.length} items</span>
        {data.pagination.total_pages > 1 && (
          <span>Page {data.pagination.page} of {data.pagination.total_pages}</span>
        )}
      </div>
    </div>
  );
}
