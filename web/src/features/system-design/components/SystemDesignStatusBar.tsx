"use client";

import { AlertCircle, CheckCircle2, Cloud, CloudUpload } from "lucide-react";
import type { SystemDesignSaveStatus } from "../types/system-design.types";

export type SystemDesignSaveState = SystemDesignSaveStatus;

export interface SystemDesignStatusBarProps {
  nodeCount: number;
  edgeCount: number;
  selectedCount: number;
  zoom: number;
  saveState: SystemDesignSaveState;
  lastSavedAt?: string | null;
  saveError?: string | null;
  className?: string;
}

const saveStatePresentation = {
  idle: {
    label: "Not saved yet",
    className: "text-muted",
    Icon: Cloud,
  },
  saved: {
    label: "Saved locally",
    className: "text-success",
    Icon: CheckCircle2,
  },
  saving: {
    label: "Saving locally",
    className: "text-accent",
    Icon: CloudUpload,
  },
  unsaved: {
    label: "Unsaved changes",
    className: "text-warning",
    Icon: Cloud,
  },
  error: {
    label: "Local save failed",
    className: "text-danger",
    Icon: AlertCircle,
  },
} as const;

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function SystemDesignStatusBar({
  nodeCount,
  edgeCount,
  selectedCount,
  zoom,
  saveState,
  lastSavedAt,
  saveError,
  className = "",
}: SystemDesignStatusBarProps) {
  const presentation = saveStatePresentation[saveState];
  const SaveIcon = presentation.Icon;

  return (
    <footer
      className={`flex min-h-8 items-center justify-between gap-4 border-t border-border bg-surface px-3 text-[11px] text-muted ${className}`}
      aria-label="Diagram status"
    >
      <div className="flex items-center gap-3 tabular-nums">
        <span>
          Nodes <strong className="font-medium text-foreground">{nodeCount}</strong>
        </span>
        <span aria-hidden="true">•</span>
        <span>
          Connections{" "}
          <strong className="font-medium text-foreground">{edgeCount}</strong>
        </span>
        <span aria-hidden="true">•</span>
        <span>
          Selected{" "}
          <strong className="font-medium text-foreground">{selectedCount}</strong>
        </span>
      </div>

      <div className="flex items-center gap-3 tabular-nums">
        <span>
          Zoom{" "}
          <strong className="font-medium text-foreground">
            {Math.round(zoom * 100)}%
          </strong>
        </span>
        <span
          className={`inline-flex items-center gap-1.5 ${presentation.className}`}
          role="status"
          aria-live="polite"
          title={saveError || undefined}
        >
          <SaveIcon className={saveState === "saving" ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"} />
          <span className="font-medium">{presentation.label}</span>
          {lastSavedAt && (
            <span className="text-muted">
              Last saved {formatSavedAt(lastSavedAt)}
            </span>
          )}
        </span>
      </div>
    </footer>
  );
}
