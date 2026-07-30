"use client";

import { useRef, type ChangeEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  LocateFixed,
  Maximize2,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/features/admin/components/AdminPrimitives";
import type { SystemDesignProblem } from "../types/system-design.types";
import { SystemDesignShortcutHelp } from "./SystemDesignShortcutHelp";
import type { SystemDesignSaveState } from "./SystemDesignStatusBar";

export interface SystemDesignToolbarProps {
  backHref?: string;
  problem: Pick<SystemDesignProblem, "title" | "difficulty">;
  saveState: SystemDesignSaveState;
  isCompleted: boolean;
  isPreviewMode: boolean;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  canMarkComplete: boolean;
  canExport?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onMarkComplete: () => void;
  onTogglePreview: () => void;
  onResetCanvas: () => void;
  onImportFile: (file: File) => void;
  onExport: () => void;
  onFitToScreen: () => void;
  onResetViewport: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  className?: string;
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  emphasized?: boolean;
  children: React.ReactNode;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  emphasized,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`${buttonClass} h-8 min-h-8 gap-1.5 px-2 ${
        emphasized ? "border-accent bg-accent text-accent-foreground" : ""
      }`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function difficultyVariant(
  difficulty: SystemDesignProblem["difficulty"],
): "success" | "warning" | "danger" {
  if (difficulty === "easy") return "success";
  if (difficulty === "medium") return "warning";
  return "danger";
}

export function SystemDesignToolbar({
  backHref = "/admin/system-design",
  problem,
  saveState,
  isCompleted,
  isPreviewMode,
  zoom,
  canUndo,
  canRedo,
  canSave,
  canMarkComplete,
  canExport = true,
  onUndo,
  onRedo,
  onSave,
  onMarkComplete,
  onTogglePreview,
  onResetCanvas,
  onImportFile,
  onExport,
  onFitToScreen,
  onResetViewport,
  onZoomOut,
  onZoomIn,
  className = "",
}: SystemDesignToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Retry save"
          : "Save";

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onImportFile(file);
    event.target.value = "";
  };

  return (
    <header
      className={`flex min-h-12 items-center gap-2 border-b border-border bg-surface px-2 py-1.5 ${className}`}
      aria-label="System design editor toolbar"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href={backHref}
          className={`${buttonClass} h-8 min-h-8 w-8 px-0`}
          aria-label="Back to system design problems"
          title="Back to system design problems"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0 max-w-52">
          <p className="truncate text-xs font-semibold text-foreground">
            {problem.title}
          </p>
          <p className="text-[10px] text-muted">
            {isPreviewMode ? "Read-only preview" : "Diagram editor"}
          </p>
        </div>
        <Badge variant={difficultyVariant(problem.difficulty)}>
          {problem.difficulty}
        </Badge>
      </div>

      <div className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden="true" />

      {!isPreviewMode && (
        <>
          <div className="flex items-center gap-1">
            <ToolbarButton label="Undo" onClick={onUndo} disabled={!canUndo}>
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden 2xl:inline">Undo</span>
            </ToolbarButton>
            <ToolbarButton label="Redo" onClick={onRedo} disabled={!canRedo}>
              <Redo2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden 2xl:inline">Redo</span>
            </ToolbarButton>
          </div>

          <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />

          <div className="flex items-center gap-1">
            <ToolbarButton
              label={saveLabel}
              onClick={onSave}
              disabled={!canSave || saveState === "saving"}
              emphasized={saveState === "unsaved" || saveState === "error"}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">{saveLabel}</span>
            </ToolbarButton>
            <ToolbarButton
              label={isCompleted ? "Diagram complete" : "Mark complete"}
              onClick={onMarkComplete}
              disabled={!canMarkComplete || isCompleted}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden 2xl:inline">
                {isCompleted ? "Complete" : "Mark complete"}
              </span>
            </ToolbarButton>
            <ToolbarButton label="Preview diagram" onClick={onTogglePreview}>
              <Eye className="h-4 w-4" aria-hidden="true" />
              <span className="hidden xl:inline">Preview</span>
            </ToolbarButton>
          </div>

          <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />

          <div className="flex items-center gap-1">
            <ToolbarButton label="Reset canvas" onClick={onResetCanvas}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              label="Import JSON"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              onChange={handleImport}
              aria-hidden="true"
            />
            <ToolbarButton
              label="Export JSON"
              onClick={onExport}
              disabled={!canExport}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        {isPreviewMode && (
          <ToolbarButton label="Exit preview" onClick={onTogglePreview} emphasized>
            <EyeOff className="h-4 w-4" aria-hidden="true" />
            <span>Exit preview</span>
          </ToolbarButton>
        )}
        <ToolbarButton label="Fit diagram to screen" onClick={onFitToScreen}>
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Reset viewport" onClick={onResetViewport}>
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Zoom out" onClick={onZoomOut} disabled={zoom <= 0.25}>
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </ToolbarButton>
        <output
          className="w-12 text-center text-[11px] font-medium tabular-nums text-foreground"
          aria-label={`Current zoom ${Math.round(zoom * 100)} percent`}
        >
          {Math.round(zoom * 100)}%
        </output>
        <ToolbarButton label="Zoom in" onClick={onZoomIn} disabled={zoom >= 2}>
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </ToolbarButton>
        <SystemDesignShortcutHelp />
      </div>
    </header>
  );
}
