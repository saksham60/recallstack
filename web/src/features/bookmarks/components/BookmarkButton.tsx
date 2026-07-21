"use client";

import React from "react";
import { useToggleBookmark } from "../use-bookmarks";
import { getApiErrorMessage } from "@/lib/api/errors";

interface BookmarkButtonProps {
  contentId: string;
  isBookmarked: boolean;
  className?: string;
}

export function BookmarkButton({ contentId, isBookmarked, className = "" }: BookmarkButtonProps) {
  const { mutate, isPending, error } = useToggleBookmark();

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigating if wrapped in a link
    e.stopPropagation();
    mutate({ contentId, isBookmarked });
  };

  return (
    <span className="inline-flex flex-col items-center">
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`p-2 rounded-md hover:bg-surface-elevated transition-colors disabled:cursor-wait disabled:opacity-50 ${className}`}
        aria-label={isBookmarked ? "Remove Bookmark" : "Add Bookmark"}
        title={isBookmarked ? "Remove Bookmark" : "Add Bookmark"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={isBookmarked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-5 h-5 ${isBookmarked ? "text-accent" : "text-muted hover:text-foreground"}`}
        >
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </svg>
      </button>
      {error && <span className="sr-only" role="alert">{getApiErrorMessage(error, "Failed to update bookmark.")}</span>}
    </span>
  );
}
