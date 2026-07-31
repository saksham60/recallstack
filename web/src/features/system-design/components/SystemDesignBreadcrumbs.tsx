"use client";

import { ChevronRight } from "lucide-react";

export interface SystemDesignBreadcrumbSegment {
  diagramId: string;
  label: string;
}

export interface SystemDesignBreadcrumbsProps {
  segments: SystemDesignBreadcrumbSegment[];
  onNavigate: (diagramId: string) => void;
  className?: string;
}

export function SystemDesignBreadcrumbs({
  segments,
  onNavigate,
  className = "",
}: SystemDesignBreadcrumbsProps) {
  if (segments.length === 0) return null;

  return (
    <nav
      aria-label="Diagram breadcrumb"
      className={`min-w-0 ${className}`}
    >
      <ol className="flex min-w-0 items-center gap-1 text-xs">
        {segments.map((segment, index) => {
          const isCurrent = index === segments.length - 1;

          return (
            <li
              key={segment.diagramId}
              className="flex min-w-0 items-center gap-1"
            >
              {index > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-muted"
                  aria-hidden="true"
                />
              )}
              {isCurrent ? (
                <span
                  className="max-w-48 truncate font-medium text-foreground"
                  aria-current="page"
                  title={segment.label}
                >
                  {segment.label}
                </span>
              ) : (
                <button
                  type="button"
                  className="max-w-40 truncate rounded px-1 py-0.5 text-muted transition hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={() => onNavigate(segment.diagramId)}
                  title={`Open ${segment.label}`}
                >
                  {segment.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
