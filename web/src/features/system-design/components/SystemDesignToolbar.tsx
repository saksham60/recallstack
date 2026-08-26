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
  BoxSelect,
  CheckCircle2,
  ChevronDown,
  Download,
  Copy,
  Eye,
  EyeOff,
  Grid3X3,
  Hand,
  LayoutGrid,
  Lock,
  LockOpen,
  LocateFixed,
  Magnet,
  Maximize2,
  MousePointer2,
  Network,
  Pencil,
  Redo2,
  RotateCcw,
  Save,
  StickyNote,
  Trash2,
  Type,
  Ungroup,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
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
  SystemDesignEditorTool,
  SystemDesignLayerDirection,
  SystemDesignNode,
  SystemDesignProblem,
} from "../types/system-design.types";
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
  difficulty?: SystemDesignProblem["difficulty"];
  showLearningActions?: boolean;
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
  snapToObjects?: boolean;
  activeTool?: SystemDesignEditorTool;
  selectedNodeCount?: number;
  selectedNodes?: SystemDesignNode[];
  selectedEdge?: SystemDesignEdge | null;
  animationsEnabled?: boolean;
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
  onToggleSnapToObjects?: () => void;
  onToolChange?: (tool: SystemDesignEditorTool) => void;
  onArrange?: (operation: SystemDesignArrangeOperation) => void;
  onDuplicateSelection?: () => void;
  onSetSelectionLocked?: (locked: boolean) => void;
  onSetSelectionVisible?: (visible: boolean) => void;
  onReorderSelection?: (direction: SystemDesignLayerDirection) => void;
  onGroupSelection?: () => void;
  onUngroupSelection?: () => void;
  onDeleteSelection?: () => void;
  onUpdateSelectedNodeText?: (
    textStyle: NonNullable<SystemDesignNode["textStyle"]>,
  ) => void;
  onUpdateSelectedEdge?: (
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
  onToggleAnimations?: () => void;
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

const TEXT_FORMATTABLE_NODE_TYPES = new Set<SystemDesignNode["type"]>([
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

function QuickTextControls({
  node,
  onUpdate,
}: {
  node: SystemDesignNode;
  onUpdate: NonNullable<
    SystemDesignToolbarProps["onUpdateSelectedNodeText"]
  >;
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

function QuickEdgeControls({
  edge,
  onUpdate,
}: {
  edge: SystemDesignEdge;
  onUpdate: NonNullable<SystemDesignToolbarProps["onUpdateSelectedEdge"]>;
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

const TOOL_ACTIONS: ReadonlyArray<{
  tool: SystemDesignEditorTool;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    tool: "select",
    label: "Select tool",
    icon: <MousePointer2 className="h-4 w-4" aria-hidden="true" />,
  },
  {
    tool: "pan",
    label: "Pan tool",
    icon: <Hand className="h-4 w-4" aria-hidden="true" />,
  },
  {
    tool: "connect",
    label: "Connect tool",
    icon: <Network className="h-4 w-4" aria-hidden="true" />,
  },
  {
    tool: "draw",
    label: "Draw tool",
    icon: <Pencil className="h-4 w-4" aria-hidden="true" />,
  },
  {
    tool: "text",
    label: "Add text",
    icon: <Type className="h-4 w-4" aria-hidden="true" />,
  },
  {
    tool: "note",
    label: "Add note",
    icon: <StickyNote className="h-4 w-4" aria-hidden="true" />,
  },
  {
    tool: "boundary",
    label: "Add system boundary",
    icon: <BoxSelect className="h-4 w-4" aria-hidden="true" />,
  },
  {
    tool: "module",
    label: "Add module",
    icon: <Boxes className="h-4 w-4" aria-hidden="true" />,
  },
];

function ToolControls({
  activeTool,
  onToolChange,
}: {
  activeTool: SystemDesignEditorTool;
  onToolChange?: (tool: SystemDesignEditorTool) => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 p-0.5"
      role="toolbar"
      aria-label="Canvas tools"
    >
      {TOOL_ACTIONS.map((action) => {
        const isDrawTool = action.tool === "draw";
        return (
          <button
            key={action.tool}
            type="button"
            className={`${buttonClass} h-7 min-h-7 ${
              isDrawTool ? "w-auto gap-1.5 px-2" : "w-7 px-0"
            } ${
              activeTool === action.tool
                ? "border-accent bg-accent text-accent-foreground"
                : ""
            }`}
            aria-label={action.label}
            title={action.label}
            aria-pressed={activeTool === action.tool}
            disabled={!onToolChange}
            onClick={() => onToolChange?.(action.tool)}
          >
            {action.icon}
            {isDrawTool && <span>Draw</span>}
          </button>
        );
      })}
    </div>
  );
}

function SelectionActionsMenu({
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
  difficulty,
  showLearningActions = true,
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
  snapToObjects = true,
  activeTool = "select",
  selectedNodeCount = 0,
  selectedNodes = [],
  selectedEdge = null,
  animationsEnabled = true,
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
  onToggleSnapToObjects,
  onToolChange,
  onArrange,
  onDuplicateSelection,
  onSetSelectionLocked,
  onSetSelectionVisible,
  onReorderSelection,
  onGroupSelection,
  onUngroupSelection,
  onDeleteSelection,
  onUpdateSelectedNodeText,
  onUpdateSelectedEdge,
  onToggleAnimations,
  className = "",
}: SystemDesignToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const selectedTextNode =
    selectedNodes.length === 1 &&
    TEXT_FORMATTABLE_NODE_TYPES.has(selectedNodes[0].type)
      ? selectedNodes[0]
      : null;
  const saveStatusLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Retry save"
          : "Save";
  const saveActionLabel = saveState === "error" ? "Retry save" : "Save";

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
        {onBack ? (
          <button
            type="button"
            className={`${buttonClass} h-8 min-h-8 w-8 px-0`}
            aria-label={backLabel}
            title={backLabel}
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <Link
            href={backHref}
            className={`${buttonClass} h-8 min-h-8 w-8 px-0`}
            aria-label={backLabel}
            title={backLabel}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        <div className="min-w-0 max-w-52">
          <p className="truncate text-xs font-semibold text-foreground">
            {title}
          </p>
          <p className="text-[10px] text-muted">
            {isPreviewMode ? "Read-only preview" : "Diagram editor"}
          </p>
        </div>
        {difficulty && (
          <Badge variant={difficultyVariant(difficulty)}>
            {difficulty}
          </Badge>
        )}
      </div>

      <div className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden="true" />

      {!isPreviewMode && (
        <ToolControls
          activeTool={activeTool}
          onToolChange={onToolChange}
        />
      )}

      {!isPreviewMode && selectedNodes.length > 0 && (
        <SelectionActionsMenu
          selectedNodes={selectedNodes}
          onDuplicate={onDuplicateSelection}
          onSetLocked={onSetSelectionLocked}
          onSetVisible={onSetSelectionVisible}
          onReorder={onReorderSelection}
          onGroup={onGroupSelection}
          onUngroup={onUngroupSelection}
          onDelete={onDeleteSelection}
        />
      )}

      {!isPreviewMode && selectedTextNode && onUpdateSelectedNodeText && (
        <QuickTextControls
          node={selectedTextNode}
          onUpdate={onUpdateSelectedNodeText}
        />
      )}

      {!isPreviewMode && selectedEdge && onUpdateSelectedEdge && (
        <QuickEdgeControls
          edge={selectedEdge}
          onUpdate={onUpdateSelectedEdge}
        />
      )}

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
            {showLearningActions && (
              <>
                <ToolbarButton
                  label={saveActionLabel}
                  onClick={onSave}
                  disabled={!canSave || saveState === "saving"}
                  emphasized={saveState === "unsaved" || saveState === "error"}
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden xl:inline" aria-hidden="true">
                    {saveStatusLabel}
                  </span>
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
              </>
            )}
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
            <ToolbarButton
              label={
                snapToObjects
                  ? "Disable snap to objects"
                  : "Enable snap to objects"
              }
              onClick={() => onToggleSnapToObjects?.()}
              disabled={!onToggleSnapToObjects}
              emphasized={snapToObjects}
              pressed={snapToObjects}
            >
              <LocateFixed className="h-4 w-4" aria-hidden="true" />
              <span className="hidden 2xl:inline">Objects</span>
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
              label="Download Interactive HTML"
              onClick={onExport}
              disabled={!canExport}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden 2xl:inline">Download HTML</span>
            </ToolbarButton>
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <ToolbarButton
          label={
            animationsEnabled
              ? "Pause all diagram animations"
              : "Play configured diagram animations"
          }
          onClick={() => onToggleAnimations?.()}
          disabled={!onToggleAnimations}
          pressed={animationsEnabled}
          emphasized={animationsEnabled}
        >
          <Activity className="h-4 w-4" aria-hidden="true" />
          <span className="hidden 2xl:inline">Motion</span>
        </ToolbarButton>
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
