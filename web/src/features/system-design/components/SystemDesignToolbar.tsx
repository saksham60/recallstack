"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceBetween,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Grid3X3,
  LayoutGrid,
  LocateFixed,
  Magnet,
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

export type SystemDesignArrangeOperation =
  | "align-left"
  | "align-center"
  | "align-right"
  | "align-top"
  | "align-middle"
  | "align-bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

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
  showGrid?: boolean;
  snapToGrid?: boolean;
  selectedNodeCount?: number;
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
  onToggleGrid?: () => void;
  onToggleSnapToGrid?: () => void;
  onArrange?: (operation: SystemDesignArrangeOperation) => void;
  className?: string;
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  emphasized?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  emphasized,
  pressed,
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
      aria-pressed={pressed}
      title={label}
    >
      {children}
    </button>
  );
}

interface ArrangeAction {
  operation: SystemDesignArrangeOperation;
  label: string;
  minimumSelection: number;
  icon: React.ReactNode;
}

const ARRANGE_ACTIONS: ArrangeAction[] = [
  {
    operation: "align-left",
    label: "Align left",
    minimumSelection: 2,
    icon: <AlignHorizontalJustifyStart className="h-4 w-4" aria-hidden="true" />,
  },
  {
    operation: "align-center",
    label: "Align horizontal centers",
    minimumSelection: 2,
    icon: (
      <AlignHorizontalJustifyCenter className="h-4 w-4" aria-hidden="true" />
    ),
  },
  {
    operation: "align-right",
    label: "Align right",
    minimumSelection: 2,
    icon: <AlignHorizontalJustifyEnd className="h-4 w-4" aria-hidden="true" />,
  },
  {
    operation: "align-top",
    label: "Align top",
    minimumSelection: 2,
    icon: <AlignVerticalJustifyStart className="h-4 w-4" aria-hidden="true" />,
  },
  {
    operation: "align-middle",
    label: "Align vertical centers",
    minimumSelection: 2,
    icon: (
      <AlignVerticalJustifyCenter className="h-4 w-4" aria-hidden="true" />
    ),
  },
  {
    operation: "align-bottom",
    label: "Align bottom",
    minimumSelection: 2,
    icon: <AlignVerticalJustifyEnd className="h-4 w-4" aria-hidden="true" />,
  },
  {
    operation: "distribute-horizontal",
    label: "Distribute horizontally",
    minimumSelection: 3,
    icon: <AlignHorizontalSpaceBetween className="h-4 w-4" aria-hidden="true" />,
  },
  {
    operation: "distribute-vertical",
    label: "Distribute vertically",
    minimumSelection: 3,
    icon: <AlignVerticalSpaceBetween className="h-4 w-4" aria-hidden="true" />,
  },
];

function ArrangeMenu({
  selectedNodeCount,
  onArrange,
}: {
  selectedNodeCount: number;
  onArrange?: (operation: SystemDesignArrangeOperation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusLastOnOpenRef = useRef(false);
  const enabled = selectedNodeCount >= 2 && Boolean(onArrange);
  const menuOpen = open && enabled;

  const positionMenu = useCallback(() => {
    const bounds = buttonRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const menuWidth = 224;
    setPosition({
      left: Math.max(
        8,
        Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 8),
      ),
      top: bounds.bottom + 4,
    });
  }, []);

  const openMenu = useCallback(
    (focusLast = false) => {
      if (!enabled) return;
      focusLastOnOpenRef.current = focusLast;
      positionMenu();
      setOpen(true);
    },
    [enabled, positionMenu],
  );

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => buttonRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeMenu(true);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    const focusFrame = window.requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      );
      const item = focusLastOnOpenRef.current
        ? items?.[items.length - 1]
        : items?.[0];
      item?.focus();
    });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [closeMenu, menuOpen, positionMenu]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );
    if (items.length === 0) return;

    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    );
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "Tab") {
      closeMenu();
    }

    if (nextIndex !== null) {
      event.preventDefault();
      items[nextIndex]?.focus();
    }
  };

  const menu =
    menuOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id="system-design-arrange-menu"
            role="menu"
            aria-label="Arrange selected components"
            className="fixed z-[100] w-56 rounded-lg border border-border bg-surface p-1 shadow-2xl"
            style={position}
            onKeyDown={handleMenuKeyDown}
          >
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Align
            </p>
            {ARRANGE_ACTIONS.slice(0, 6).map((action) => (
              <button
                key={action.operation}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                disabled={selectedNodeCount < action.minimumSelection}
                onClick={() => {
                  onArrange?.(action.operation);
                  closeMenu(true);
                }}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
            <div className="my-1 h-px bg-border" role="separator" />
            <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Distribute
            </p>
            {ARRANGE_ACTIONS.slice(6).map((action) => (
              <button
                key={action.operation}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                disabled={selectedNodeCount < action.minimumSelection}
                onClick={() => {
                  onArrange?.(action.operation);
                  closeMenu(true);
                }}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
            {selectedNodeCount < 3 && (
              <p className="px-2 py-1.5 text-[10px] leading-4 text-muted">
                Select at least three components to distribute them.
              </p>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${buttonClass} h-8 min-h-8 gap-1.5 px-2`}
        disabled={!enabled}
        aria-label="Arrange selected components"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? "system-design-arrange-menu" : undefined}
        title={
          selectedNodeCount < 2
            ? "Select at least two components to arrange them"
            : "Arrange selected components"
        }
        onClick={() => {
          if (menuOpen) closeMenu();
          else openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openMenu();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(true);
          }
        }}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
        <span className="hidden 2xl:inline">Arrange</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {menu}
    </>
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
  showGrid = true,
  snapToGrid = false,
  selectedNodeCount = 0,
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
  onToggleGrid,
  onToggleSnapToGrid,
  onArrange,
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
            <ToolbarButton
              label={showGrid ? "Hide grid" : "Show grid"}
              onClick={() => onToggleGrid?.()}
              disabled={!onToggleGrid}
              emphasized={showGrid}
              pressed={showGrid}
            >
              <Grid3X3 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden 2xl:inline">Grid</span>
            </ToolbarButton>
            <ToolbarButton
              label={snapToGrid ? "Disable snap to grid" : "Enable snap to grid"}
              onClick={() => onToggleSnapToGrid?.()}
              disabled={!onToggleSnapToGrid}
              emphasized={snapToGrid}
              pressed={snapToGrid}
            >
              <Magnet className="h-4 w-4" aria-hidden="true" />
              <span className="hidden 2xl:inline">Snap</span>
            </ToolbarButton>
            <ArrangeMenu
              selectedNodeCount={selectedNodeCount}
              onArrange={onArrange}
            />
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
