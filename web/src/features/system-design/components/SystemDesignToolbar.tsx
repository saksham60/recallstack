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
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpToLine,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Download,
  Copy,
  Eye,
  EyeOff,
  LayoutGrid,
  Lock,
  LockOpen,
  MoreHorizontal,
  MousePointer2,
  Redo2,
  Radio,
  RotateCcw,
  Save,
  Trash2,
  Ungroup,
  Undo2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/features/admin/components/AdminPrimitives";
import {
  SYSTEM_DESIGN_ARROWHEADS,
  SYSTEM_DESIGN_EDGE_LINE_STYLES,
  SYSTEM_DESIGN_EDGE_ROLE_COLORS,
  resolveSystemDesignEdgeStyle,
} from "../constants/system-design-edge-registry";
import type {
  SystemDesignEdge,
  SystemDesignLayerDirection,
  SystemDesignNode,
  SystemDesignProblem,
} from "../types/system-design.types";
import { SystemDesignShortcutHelp } from "./SystemDesignShortcutHelp";
import {
  EditorIconButton,
  editorGhostButtonClass,
  editorIconButtonClass,
} from "./SystemDesignUiPrimitives";
import type { SystemDesignSaveState } from "./SystemDesignStatusBar";
import type { RealtimeConnectionStatus } from "../realtime/realtime-client";

export type SystemDesignArrangeOperation =
  | "align-left"
  | "align-center"
  | "align-right"
  | "align-top"
  | "align-middle"
  | "align-bottom"
  | "distribute-horizontal"
  | "distribute-vertical"
  | "equal-horizontal-spacing"
  | "equal-vertical-spacing"
  | "match-width"
  | "match-height";

export interface SystemDesignToolbarProps {
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  title: string;
  breadcrumbs?: React.ReactNode;
  difficulty?: SystemDesignProblem["difficulty"];
  showLearningActions?: boolean;
  saveState: SystemDesignSaveState;
  isCompleted: boolean;
  isPreviewMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoDisabledReason?: string;
  canSave: boolean;
  canMarkComplete: boolean;
  canExport?: boolean;
  animationsEnabled?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onMarkComplete: () => void;
  onTogglePreview: () => void;
  onResetCanvas: () => void;
  onImportFile: (file: File) => void;
  onExport: () => void;
  onToggleAnimations?: () => void;
  liveShareStatus?: RealtimeConnectionStatus;
  liveParticipantCount?: number;
  onLiveShare?: () => void;
  className?: string;
}

export const TEXT_FORMATTABLE_NODE_TYPES = new Set<SystemDesignNode["type"]>([
  "text",
  "note",
  "warning_note",
  "assumption_note",
  "rectangle",
  "rounded_rectangle",
  "ellipse",
  "diamond",
  "callout",
  "label",
]);

export function QuickTextControls({
  node,
  onUpdate,
}: {
  node: SystemDesignNode;
  onUpdate: (textStyle: NonNullable<SystemDesignNode["textStyle"]>) => void;
}) {
  const updateTextStyle = (
    patch: Partial<NonNullable<SystemDesignNode["textStyle"]>>,
  ) => onUpdate({ ...node.textStyle, ...patch });
  const controlClass =
    "h-7 rounded border border-border bg-background px-1 text-[10px] text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div
      className="flex items-center gap-1 rounded-md border border-accent/25 bg-accent/5 px-1.5 py-1"
      role="toolbar"
      aria-label="Selected text formatting"
    >
      <select
        className={`${controlClass} w-20`}
        aria-label="Text font"
        title="Font"
        value={node.textStyle?.fontFamily ?? ""}
        onChange={(event) =>
          updateTextStyle({ fontFamily: event.target.value || undefined })
        }
      >
        <option value="">Default</option>
        <option value="Arial">Arial</option>
        <option value="Inter">Inter</option>
        <option value="Georgia">Georgia</option>
        <option value="monospace">Mono</option>
        <option value="system-ui">System</option>
      </select>
      <select
        className={`${controlClass} w-14`}
        aria-label="Text size"
        title="Size"
        value={node.textStyle?.fontSize ?? 14}
        onChange={(event) =>
          updateTextStyle({ fontSize: Number(event.target.value) })
        }
      >
        {[10, 12, 14, 16, 18, 20, 24, 32, 48, 64].map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`${buttonClass} h-7 min-h-7 w-7 px-0 text-xs font-bold`}
        aria-label="Bold text"
        aria-pressed={node.textStyle?.fontWeight === "bold"}
        title="Weight"
        onClick={() =>
          updateTextStyle({
            fontWeight:
              node.textStyle?.fontWeight === "bold" ? "normal" : "bold",
          })
        }
      >
        B
      </button>
      <select
        className={`${controlClass} w-[4.5rem]`}
        aria-label="Text alignment"
        title="Alignment"
        value={node.textStyle?.align ?? ""}
        onChange={(event) =>
          updateTextStyle({
            align:
              (event.target.value as NonNullable<
                SystemDesignNode["textStyle"]
              >["align"]) || undefined,
          })
        }
      >
        <option value="">Align</option>
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
      <label
        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-border bg-background"
        title="Color"
      >
        <span className="sr-only">Text color</span>
        <input
          type="color"
          aria-label="Text color"
          className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          value={node.textStyle?.color ?? "#fafafa"}
          onChange={(event) => updateTextStyle({ color: event.target.value })}
        />
      </label>
    </div>
  );
}

export function QuickEdgeControls({
  edge,
  onUpdate,
}: {
  edge: SystemDesignEdge;
  onUpdate: (
    patch: Partial<
      Pick<
        SystemDesignEdge,
        | "color"
        | "lineStyle"
        | "strokeWidth"
        | "startArrowhead"
        | "endArrowhead"
        | "animationMode"
      >
    >,
  ) => void;
}) {
  const resolved = resolveSystemDesignEdgeStyle(edge);
  const color =
    edge.color ??
    SYSTEM_DESIGN_EDGE_ROLE_COLORS[
      resolved.semanticDefinition.colorRole
    ];
  return (
    <div
      className="flex items-center gap-1 rounded-md border border-accent/25 bg-accent/5 px-1.5 py-1"
      aria-label="Selected connection controls"
    >
      <span className="hidden text-[10px] font-medium uppercase tracking-wide text-muted 2xl:inline">
        Edge
      </span>
      <label
        className="flex h-7 w-8 cursor-pointer items-center justify-center rounded border border-border bg-background"
        title="Connection color"
      >
        <span className="sr-only">Connection color</span>
        <input
          type="color"
          aria-label="Connection color"
          className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          value={color}
          onChange={(event) => onUpdate({ color: event.target.value })}
        />
      </label>
      <select
        className="h-7 max-w-24 rounded border border-border bg-background px-1 text-[10px] text-foreground"
        aria-label="Quick line style"
        title="Line style"
        value={resolved.lineStyle}
        onChange={(event) =>
          onUpdate({
            lineStyle: event.target.value as SystemDesignEdge["lineStyle"],
          })
        }
      >
        {SYSTEM_DESIGN_EDGE_LINE_STYLES.map((lineStyle) => (
          <option key={lineStyle} value={lineStyle}>
            {lineStyle.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <select
        className="h-7 w-14 rounded border border-border bg-background px-1 text-[10px] text-foreground"
        aria-label="Quick connection thickness"
        title="Thickness"
        value={resolved.strokeWidth}
        onChange={(event) =>
          onUpdate({ strokeWidth: Number(event.target.value) })
        }
      >
        {[1, 2, 3, 4, 6].map((width) => (
          <option key={width} value={width}>
            {width}px
          </option>
        ))}
      </select>
      <select
        className="h-7 max-w-24 rounded border border-border bg-background px-1 text-[10px] text-foreground"
        aria-label="Quick end arrowhead"
        title="End arrowhead"
        value={resolved.endArrowhead}
        onChange={(event) =>
          onUpdate({
            endArrowhead:
              event.target.value as SystemDesignEdge["endArrowhead"],
          })
        }
      >
        {SYSTEM_DESIGN_ARROWHEADS.map((arrowhead) => (
          <option key={arrowhead} value={arrowhead}>
            {arrowhead.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`${buttonClass} h-7 min-h-7 px-1.5 text-[10px]`}
        aria-label={
          resolved.animationMode === "none"
            ? "Animate connection"
            : "Stop connection animation"
        }
        aria-pressed={resolved.animationMode !== "none"}
        title="Animate"
        onClick={() =>
          onUpdate({
            animationMode:
              resolved.animationMode === "none" ? "moving_dash" : "none",
          })
        }
      >
        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
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
  {
    operation: "equal-horizontal-spacing",
    label: "Equal horizontal spacing",
    minimumSelection: 3,
    icon: <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />,
  },
  {
    operation: "equal-vertical-spacing",
    label: "Equal vertical spacing",
    minimumSelection: 3,
    icon: <ArrowUpDown className="h-4 w-4" aria-hidden="true" />,
  },
  {
    operation: "match-width",
    label: "Match width",
    minimumSelection: 2,
    icon: <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />,
  },
  {
    operation: "match-height",
    label: "Match height",
    minimumSelection: 2,
    icon: <ArrowUpDown className="h-4 w-4" aria-hidden="true" />,
  },
];

export function ArrangeMenu({
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
              Distribute and size
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

export function SelectionActionsMenu({
  selectedNodes,
  onDuplicate,
  onSetLocked,
  onSetVisible,
  onReorder,
  onGroup,
  onUngroup,
  onDelete,
}: {
  selectedNodes: SystemDesignNode[];
  onDuplicate?: () => void;
  onSetLocked?: (locked: boolean) => void;
  onSetVisible?: (visible: boolean) => void;
  onReorder?: (direction: SystemDesignLayerDirection) => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const allLocked =
    selectedNodes.length > 0 && selectedNodes.every((node) => node.locked);
  const allHidden =
    selectedNodes.length > 0 &&
    selectedNodes.every((node) => node.visible === false);
  const grouped = selectedNodes.some((node) => Boolean(node.groupId));
  const sharedGroupId = selectedNodes[0]?.groupId;
  const canGroup =
    selectedNodes.length >= 2 &&
    !(
      sharedGroupId &&
      selectedNodes.every((node) => node.groupId === sharedGroupId)
    );

  const positionMenu = useCallback(() => {
    const bounds = buttonRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = 230;
    setPosition({
      left: Math.max(
        8,
        Math.min(bounds.left, window.innerWidth - width - 8),
      ),
      top: bounds.bottom + 4,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, positionMenu]);

  const run = (action?: () => void) => {
    action?.();
    setOpen(false);
  };
  const itemClass =
    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground transition hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Selected component actions"
            className="fixed z-[100] w-[230px] rounded-lg border border-border bg-surface p-1 shadow-2xl"
            style={position}
          >
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              disabled={!onDuplicate}
              onClick={() => run(onDuplicate)}
            >
              <Copy className="h-4 w-4" aria-hidden="true" /> Duplicate
            </button>
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              disabled={!onSetLocked}
              onClick={() => run(() => onSetLocked?.(!allLocked))}
            >
              {allLocked ? (
                <LockOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Lock className="h-4 w-4" aria-hidden="true" />
              )}
              {allLocked ? "Unlock" : "Lock"}
            </button>
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              disabled={!onSetVisible}
              onClick={() => run(() => onSetVisible?.(allHidden))}
            >
              {allHidden ? (
                <Eye className="h-4 w-4" aria-hidden="true" />
              ) : (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              )}
              {allHidden ? "Show" : "Hide"}
            </button>
            <div className="my-1 h-px bg-border" role="separator" />
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(() => onReorder?.("forward"))}>
              <ArrowUp className="h-4 w-4" aria-hidden="true" /> Bring forward
            </button>
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(() => onReorder?.("backward"))}>
              <ArrowDown className="h-4 w-4" aria-hidden="true" /> Send backward
            </button>
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(() => onReorder?.("front"))}>
              <ArrowUpToLine className="h-4 w-4" aria-hidden="true" /> Bring to front
            </button>
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(() => onReorder?.("back"))}>
              <ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> Send to back
            </button>
            <div className="my-1 h-px bg-border" role="separator" />
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              disabled={!canGroup || !onGroup}
              onClick={() => run(onGroup)}
            >
              <Boxes className="h-4 w-4" aria-hidden="true" /> Group
            </button>
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              disabled={!grouped || !onUngroup}
              onClick={() => run(onUngroup)}
            >
              <Ungroup className="h-4 w-4" aria-hidden="true" /> Ungroup
            </button>
            <div className="my-1 h-px bg-border" role="separator" />
            <button
              type="button"
              role="menuitem"
              className={`${itemClass} text-danger`}
              disabled={!onDelete}
              onClick={() => run(onDelete)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
            </button>
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
        aria-label={`Actions for ${selectedNodes.length} selected component${
          selectedNodes.length === 1 ? "" : "s"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) positionMenu();
          setOpen((current) => !current);
        }}
      >
        <MousePointer2 className="h-4 w-4" aria-hidden="true" />
        <span>{selectedNodes.length} selected</span>
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
  backHref = "/system-design",
  onBack,
  backLabel = "Back to system design problems",
  title,
  breadcrumbs,
  difficulty,
  showLearningActions = true,
  saveState,
  isCompleted,
  isPreviewMode,
  canUndo,
  canRedo,
  undoDisabledReason,
  canSave,
  canMarkComplete,
  canExport = true,
  animationsEnabled = true,
  onUndo,
  onRedo,
  onSave,
  onMarkComplete,
  onTogglePreview,
  onResetCanvas,
  onImportFile,
  onExport,
  onToggleAnimations,
  liveShareStatus = "idle",
  liveParticipantCount = 0,
  onLiveShare,
  className = "",
}: SystemDesignToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const saveStatusLabel =
    saveState === "saving"
      ? "Saving locally"
      : saveState === "saved"
        ? "Saved locally"
        : saveState === "error"
          ? "Retry save"
          : "Save";
  const saveActionLabel = saveState === "error" ? "Retry save" : "Save";

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onImportFile(file);
    event.target.value = "";
  };

  const overflowItem = `${editorGhostButtonClass} w-full justify-start px-2.5`;

  return (
    <header
      className={`flex min-h-12 items-center gap-2 border-b border-[var(--editor-border)] bg-surface/95 px-2.5 py-1.5 ${className}`}
      aria-label="System design editor toolbar"
    >
      <div className="flex min-w-0 items-center gap-2">
        {onBack ? (
          <EditorIconButton label={backLabel} onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </EditorIconButton>
        ) : (
          <Link
            href={backHref}
            className={editorIconButtonClass}
            aria-label={backLabel}
            title={backLabel}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="max-w-64 truncate text-sm font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {difficulty && (
              <Badge variant={difficultyVariant(difficulty)}>{difficulty}</Badge>
            )}
          </div>
          {breadcrumbs ? (
            <div className="mt-0.5 max-w-[34rem] truncate text-[10px] text-muted">
              {breadcrumbs}
            </div>
          ) : (
            <p className="text-[10px] text-muted">
              {isPreviewMode ? "Read-only preview" : "System design"}
            </p>
          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        {!isPreviewMode && (
          <>
            <EditorIconButton
              label={!canUndo && undoDisabledReason ? undoDisabledReason : "Undo"}
              disabled={!canUndo}
              onClick={onUndo}
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </EditorIconButton>
            <EditorIconButton
              label={!canRedo && undoDisabledReason ? undoDisabledReason : "Redo"}
              disabled={!canRedo}
              onClick={onRedo}
            >
              <Redo2 className="h-4 w-4" aria-hidden="true" />
            </EditorIconButton>
          </>
        )}

        {showLearningActions && !isPreviewMode && (
          <button
            type="button"
            className={`${editorGhostButtonClass} mx-1 ${saveState === "error" ? "text-danger" : "text-foreground"}`}
            title={saveActionLabel}
            disabled={!canSave || saveState === "saving"}
            onClick={onSave}
          >
            <Save
              className={`h-4 w-4 ${saveState === "saving" ? "animate-pulse text-accent" : saveState === "saved" ? "text-success" : ""}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">{saveStatusLabel}</span>
          </button>
        )}

        {onLiveShare && (
          <button
            type="button"
            className={`${editorGhostButtonClass} mx-1 ${liveShareStatus === "live" ? "text-accent" : ""}`}
            aria-pressed={liveShareStatus === "live"}
            aria-label={
              liveShareStatus === "live"
                ? "Open live session sharing"
                : "Live Share"
            }
            title={liveShareStatus === "live" ? "Open live session sharing" : "Live Share"}
            onClick={onLiveShare}
          >
            <Radio
              className={`h-4 w-4 ${["starting", "connecting", "reconnecting"].includes(liveShareStatus) ? "animate-pulse" : ""}`}
              aria-hidden="true"
            />
            <span className="hidden lg:inline">
              {liveShareStatus === "live" ? "Live" : "Live Share"}
            </span>
            {liveShareStatus === "live" && liveParticipantCount > 0 && (
              <span className="rounded-full bg-background/60 px-1.5 text-[10px] font-semibold">
                {liveParticipantCount}
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          className={`${editorGhostButtonClass} mx-1 text-foreground`}
          aria-label={isPreviewMode ? "Exit preview" : "Preview diagram"}
          onClick={onTogglePreview}
        >
          {isPreviewMode ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="hidden md:inline">
            {isPreviewMode ? "Exit preview" : "Preview"}
          </span>
        </button>

        {!isPreviewMode && (
          <details className="group relative">
            <summary
              className={`${editorIconButtonClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
              aria-label="More editor actions"
              title="More editor actions"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-floating)] p-1.5 shadow-xl">
              {showLearningActions && (
                <button
                  type="button"
                  className={overflowItem}
                  disabled={!canMarkComplete || isCompleted}
                  onClick={onMarkComplete}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {isCompleted ? "Diagram complete" : "Mark complete"}
                </button>
              )}
              <button
                type="button"
                className={overflowItem}
                aria-pressed={animationsEnabled}
                onClick={() => onToggleAnimations?.()}
                disabled={!onToggleAnimations}
              >
                <Activity className={`h-4 w-4 ${animationsEnabled ? "text-accent" : ""}`} aria-hidden="true" />
                {animationsEnabled ? "Pause motion" : "Play motion"}
              </button>
              <div className="my-1 h-px bg-[var(--editor-border)]" role="separator" />
              <button
                type="button"
                className={overflowItem}
                onClick={() => importInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Import JSON
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                tabIndex={-1}
                onChange={handleImport}
                aria-hidden="true"
              />
              <button
                type="button"
                className={overflowItem}
                aria-label="Download Interactive HTML"
                onClick={onExport}
                disabled={!canExport}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download interactive HTML
              </button>
              <button
                type="button"
                className={`${overflowItem} text-danger`}
                onClick={onResetCanvas}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset canvas
              </button>
            </div>
          </details>
        )}
        <SystemDesignShortcutHelp />
      </div>
    </header>
  );
}
