"use client";

import { useId, useRef, useState } from "react";
import { Workflow } from "lucide-react";
import {
  buttonClass,
  inputClass,
} from "@/features/admin/components/AdminPrimitives";
import {
  SYSTEM_DESIGN_ARROWHEADS,
  SYSTEM_DESIGN_EDGE_ANIMATION_DIRECTIONS,
  SYSTEM_DESIGN_EDGE_ANIMATION_MODES,
  SYSTEM_DESIGN_EDGE_LABEL_ICONS,
  SYSTEM_DESIGN_EDGE_LINE_STYLES,
  SYSTEM_DESIGN_EDGE_ROUTINGS,
  SYSTEM_DESIGN_EDGE_ROLE_COLORS,
  SYSTEM_DESIGN_EDGE_SEMANTICS,
  SYSTEM_DESIGN_LEGACY_EDGE_TYPES,
  SYSTEM_DESIGN_PRIMARY_EDGE_TYPES,
  resolveSystemDesignEdgeStyle,
} from "../constants/system-design-edge-registry";
import { isSystemDesignModuleNodeType } from "../constants/system-design-palette";
import {
  createSystemDesignTechnologyIdentity,
  SYSTEM_DESIGN_TECHNOLOGY_IDS,
  SYSTEM_DESIGN_TECHNOLOGY_REGISTRY,
  type SystemDesignTechnologyId,
} from "../constants/system-design-visual-registry";
import type {
  SystemDesignEdge,
  SystemDesignEdgeType,
  SystemDesignNode,
  SystemDesignProblem,
  TechnologyIdentity,
} from "../types/system-design.types";
import {
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
} from "../utils/system-design-defaults";
import {
  SystemDesignLayersPanel,
  type SystemDesignLayersPanelProps,
} from "./SystemDesignLayersPanel";
import { SystemDesignNodeIcon } from "./SystemDesignIcons";
import { SystemDesignProblemPanel } from "./SystemDesignProblemPanel";
import { SYSTEM_DESIGN_KEYBOARD_SHORTCUTS } from "./SystemDesignShortcutHelp";
import { SystemDesignTechnologyIcon } from "./SystemDesignTechnologyIcon";

export type SystemDesignInspectorTab = "properties" | "problem" | "layers";

export type SystemDesignNodePropertyPatch = Partial<
  Pick<
    SystemDesignNode,
    | "label"
    | "subtitle"
    | "technology"
    | "description"
    | "metadata"
    | "style"
    | "textStyle"
    | "isExpandable"
    | "isCollapsed"
    | "x"
    | "y"
    | "locked"
    | "visible"
    | "width"
    | "height"
  >
>;

export type SystemDesignEdgePropertyPatch = Partial<
  Pick<
    SystemDesignEdge,
    | "type"
    | "label"
    | "protocol"
    | "description"
    | "sourcePort"
    | "targetPort"
    | "routing"
    | "color"
    | "opacity"
    | "strokeWidth"
    | "lineStyle"
    | "dashPattern"
    | "startArrowhead"
    | "endArrowhead"
    | "labelIcon"
    | "labelPosition"
    | "labelBackground"
    | "labelTextColor"
    | "animationMode"
    | "animationSpeed"
    | "animationDirection"
  >
>;

export interface SystemDesignInspectorProps {
  activeTab: SystemDesignInspectorTab;
  onTabChange: (tab: SystemDesignInspectorTab) => void;
  selectedNode?: SystemDesignNode | null;
  selectedEdge?: SystemDesignEdge | null;
  selectedCount: number;
  selectedNodeInternalComponentCount?: number;
  problem: SystemDesignProblem;
  layersProps: SystemDesignLayersPanelProps;
  onUpdateNode: (
    nodeId: string,
    patch: SystemDesignNodePropertyPatch,
  ) => void;
  onUpdateEdge: (
    edgeId: string,
    patch: SystemDesignEdgePropertyPatch,
  ) => void;
  onOpenModule?: (nodeId: string) => void;
  className?: string;
}

const tabs: ReadonlyArray<{
  id: SystemDesignInspectorTab;
  label: string;
}> = [
  { id: "properties", label: "Properties" },
  { id: "problem", label: "Problem" },
  { id: "layers", label: "Layers" },
];

const ports = ["top", "right", "bottom", "left"] as const;

function optionLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

interface BufferedTextFieldProps {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  list?: string;
}

/**
 * Keeps typing local to the inspector. The document, undo history, and
 * persistence pipeline only see one update when the field is committed.
 */
function BufferedTextField({
  value,
  onCommit,
  className = inputClass,
  placeholder,
  disabled,
  multiline = false,
  list,
}: BufferedTextFieldProps) {
  const [edit, setEdit] = useState(() => ({
    source: value,
    draft: value,
  }));
  const cancelBlurRef = useRef(false);
  const draft = edit.source === value ? edit.draft : value;

  const commit = () => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      return;
    }
    if (draft !== value) {
      onCommit(draft);
    }
  };

  const handleKeyDown = (
    event:
      | React.KeyboardEvent<HTMLInputElement>
      | React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelBlurRef.current = true;
      setEdit({ source: value, draft: value });
      event.currentTarget.blur();
      return;
    }

    const shouldCommit =
      event.key === "Enter" &&
      (!multiline || event.metaKey || event.ctrlKey);
    if (shouldCommit) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  if (multiline) {
    return (
      <textarea
        className={className}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) =>
          setEdit({ source: value, draft: event.target.value })
        }
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <input
      className={className}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      list={list}
      onChange={(event) =>
        setEdit({ source: value, draft: event.target.value })
      }
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}

function EmptyProperties({
  selectedCount,
  problem,
}: {
  selectedCount: number;
  problem: SystemDesignProblem;
}) {
  const sectionId = useId();

  if (selectedCount > 1) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-accent/30 bg-accent/10 p-3">
          <p className="text-xs font-semibold text-foreground">
            {selectedCount} items selected
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Use Arrange selected components in the toolbar to align,
            distribute, resize, group, lock, hide, or reorder the selection.
          </p>
        </div>
        <div className="rounded-md border border-border bg-background/40 p-3 text-[11px] leading-relaxed text-muted">
          <p className="font-medium text-foreground">Selection shortcuts</p>
          <p className="mt-1">Shift-click adds or removes one item.</p>
          <p>Ctrl/Cmd+C copies; Ctrl/Cmd+D duplicates.</p>
          <p>Delete removes the selected items.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="system-design-empty-inspector">
      <section
        className="rounded-md border border-border bg-background/40 p-3"
        aria-labelledby={`${sectionId}-problem-heading`}
      >
        <h2
          id={`${sectionId}-problem-heading`}
          className="text-xs font-semibold text-foreground"
        >
          {problem.title}
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {problem.summary}
        </p>
      </section>

      <section
        className="rounded-md border border-border bg-background/40 p-3"
        aria-labelledby={`${sectionId}-requirements-heading`}
      >
        <h3
          id={`${sectionId}-requirements-heading`}
          className="text-[11px] font-medium text-foreground"
        >
          Functional requirements
        </h3>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted">
          {problem.requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-md border border-border bg-background/40 p-3"
        aria-labelledby={`${sectionId}-scale-heading`}
      >
        <h3
          id={`${sectionId}-scale-heading`}
          className="text-[11px] font-medium text-foreground"
        >
          Scale assumptions
        </h3>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted">
          {problem.scaleAssumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-md border border-dashed border-border p-3 text-[11px] leading-relaxed text-muted"
        aria-labelledby={`${sectionId}-help-heading`}
      >
        <h3 id={`${sectionId}-help-heading`} className="font-medium text-foreground">
          Quick help
        </h3>
        <p className="mt-1">
          Select a component or connection to edit it. Drag from a component
          port to connect services, and double-click labels to edit them.
        </p>
        <p className="mt-1">
          Double-click an expandable module to drill down. Use the breadcrumb
          or Alt+Left to return to its parent diagram.
        </p>
        <p className="mt-1">
          The keyboard button in the top toolbar opens this shortcut guide at
          any time.
        </p>
      </section>

      <section
        className="rounded-md border border-border bg-background/40 p-3"
        aria-labelledby={`${sectionId}-shortcuts-heading`}
      >
        <h3
          id={`${sectionId}-shortcuts-heading`}
          className="text-[11px] font-medium text-foreground"
        >
          Keyboard shortcuts
        </h3>
        <dl className="mt-1.5 divide-y divide-border/70">
          {SYSTEM_DESIGN_KEYBOARD_SHORTCUTS.map(([label, keys]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-3 py-1.5 text-[10px] leading-relaxed"
            >
              <dt className="text-muted">{label}</dt>
              <dd className="shrink-0 text-right font-mono text-foreground">
                {keys}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          Editor shortcuts pause while focus is inside a form field.
        </p>
      </section>
    </div>
  );
}

function NodeProperties({
  node,
  onUpdate,
  internalComponentCount = 0,
  onOpenModule,
}: {
  node: SystemDesignNode;
  onUpdate: (patch: SystemDesignNodePropertyPatch) => void;
  internalComponentCount?: number;
  onOpenModule?: (nodeId: string) => void;
}) {
  const statusListId = useId();
  const technologyId = node.technology?.id ?? "";
  const status = node.metadata?.status ?? node.metadata?.state ?? "";

  const updateStyle = (
    patch: NonNullable<SystemDesignNode["style"]>,
  ) => {
    onUpdate({ style: { ...node.style, ...patch } });
  };

  const updateTextStyle = (
    patch: NonNullable<SystemDesignNode["textStyle"]>,
  ) => {
    onUpdate({ textStyle: { ...node.textStyle, ...patch } });
  };

  const updateTechnology = (value: string) => {
    if (!value) {
      onUpdate({ technology: undefined });
      return;
    }

    if (value === "custom") {
      const customTechnology: TechnologyIdentity = {
        id: "custom",
        name:
          node.technology?.id === "custom"
            ? node.technology.name
            : "Custom technology",
        category: "custom",
      };
      onUpdate({ technology: customTechnology });
      return;
    }

    onUpdate({
      technology: createSystemDesignTechnologyIdentity(
        value as SystemDesignTechnologyId,
      ),
    });
  };

  const updateStatus = (value: string) => {
    const metadata = { ...node.metadata };
    delete metadata.state;
    if (value.trim()) {
      metadata.status = value.trim();
    } else {
      delete metadata.status;
    }
    onUpdate({ metadata });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-border bg-background/50 p-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
          <SystemDesignNodeIcon type={node.type} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">
            {node.label}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted">
              {node.type.replaceAll("_", " ")}
            </p>
            {node.technology && (
              <SystemDesignTechnologyIcon technology={node.technology} />
            )}
          </div>
        </div>
      </div>

      <FieldLabel label="Label">
        <BufferedTextField
          value={node.label}
          onCommit={(label) => onUpdate({ label })}
        />
      </FieldLabel>
      <FieldLabel label="Subtitle">
        <BufferedTextField
          value={node.subtitle ?? ""}
          placeholder="Optional context"
          onCommit={(subtitle) => onUpdate({ subtitle })}
        />
      </FieldLabel>
      <FieldLabel label="Technology">
        <div className="flex items-center gap-2">
          {node.technology && (
            <SystemDesignTechnologyIcon
              technology={node.technology}
              className="shrink-0"
            />
          )}
          <select
            className={inputClass}
            value={technologyId}
            onChange={(event) => updateTechnology(event.target.value)}
          >
            <option value="">None</option>
            {SYSTEM_DESIGN_TECHNOLOGY_IDS.map((id) => {
              const technology = SYSTEM_DESIGN_TECHNOLOGY_REGISTRY[id];
              return (
                <option key={id} value={id}>
                  {technology.name}
                </option>
              );
            })}
            <option value="custom">Custom label (no logo)</option>
          </select>
        </div>
      </FieldLabel>
      {node.technology?.id === "custom" && (
        <FieldLabel label="Custom technology label">
          <BufferedTextField
            value={node.technology.name}
            placeholder="Technology name"
            onCommit={(name) =>
              onUpdate({
                technology: {
                  id: "custom",
                  name: name.trim() || "Custom technology",
                  category: "custom",
                },
              })
            }
          />
        </FieldLabel>
      )}
      <FieldLabel label="Description">
        <BufferedTextField
          className={`${inputClass} min-h-20 resize-y py-2`}
          value={node.description ?? ""}
          placeholder="What role does this component play?"
          multiline
          onCommit={(description) => onUpdate({ description })}
        />
      </FieldLabel>
      <FieldLabel label="Status">
        <BufferedTextField
          value={status}
          placeholder="e.g. Healthy, Degraded, Planned"
          list={statusListId}
          onCommit={updateStatus}
        />
        <datalist id={statusListId}>
          <option value="Healthy" />
          <option value="Active" />
          <option value="Degraded" />
          <option value="Planned" />
          <option value="Offline" />
        </datalist>
      </FieldLabel>

      <fieldset className="space-y-3 rounded-md border border-border bg-background/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted">
            Appearance
          </span>
          <button
            type="button"
            className="text-[10px] font-medium text-accent hover:underline"
            onClick={() => onUpdate({ style: undefined })}
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldLabel label="Fill">
            <input
              aria-label="Node fill color"
              type="color"
              className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface p-1"
              value={node.style?.fill ?? "#18181b"}
              onChange={(event) => updateStyle({ fill: event.target.value })}
            />
          </FieldLabel>
          <FieldLabel label="Stroke">
            <input
              aria-label="Node stroke color"
              type="color"
              className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface p-1"
              value={node.style?.stroke ?? "#a78bfa"}
              onChange={(event) => updateStyle({ stroke: event.target.value })}
            />
          </FieldLabel>
          <FieldLabel label="Stroke width">
            <BufferedTextField
              value={String(node.style?.strokeWidth ?? 1)}
              onCommit={(value) => {
                const strokeWidth = Number(value);
                if (Number.isFinite(strokeWidth)) {
                  updateStyle({
                    strokeWidth: Math.min(12, Math.max(0, strokeWidth)),
                  });
                }
              }}
            />
          </FieldLabel>
          <FieldLabel label="Corner radius">
            <BufferedTextField
              value={String(node.style?.borderRadius ?? 10)}
              onCommit={(value) => {
                const borderRadius = Number(value);
                if (Number.isFinite(borderRadius)) {
                  updateStyle({
                    borderRadius: Math.min(100, Math.max(0, borderRadius)),
                  });
                }
              }}
            />
          </FieldLabel>
          <FieldLabel label="Border style">
            <select
              className={inputClass}
              value={node.style?.borderStyle ?? "solid"}
              onChange={(event) =>
                updateStyle({
                  borderStyle: event.target.value as NonNullable<
                    SystemDesignNode["style"]
                  >["borderStyle"],
                })
              }
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </FieldLabel>
          <FieldLabel label="Opacity %">
            <BufferedTextField
              value={String(Math.round((node.style?.opacity ?? 1) * 100))}
              onCommit={(value) => {
                const opacity = Number(value);
                if (Number.isFinite(opacity)) {
                  updateStyle({
                    opacity: Math.min(100, Math.max(0, opacity)) / 100,
                  });
                }
              }}
            />
          </FieldLabel>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-border bg-background/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted">
            Text style
          </span>
          <button
            type="button"
            className="text-[10px] font-medium text-accent hover:underline"
            onClick={() => onUpdate({ textStyle: undefined })}
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldLabel label="Text color">
            <input
              aria-label="Node text color"
              type="color"
              className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface p-1"
              value={node.textStyle?.color ?? "#fafafa"}
              onChange={(event) =>
                updateTextStyle({ color: event.target.value })
              }
            />
          </FieldLabel>
          <FieldLabel label="Font size">
            <BufferedTextField
              value={String(node.textStyle?.fontSize ?? 14)}
              onCommit={(value) => {
                const fontSize = Number(value);
                if (Number.isFinite(fontSize)) {
                  updateTextStyle({
                    fontSize: Math.min(72, Math.max(8, fontSize)),
                  });
                }
              }}
            />
          </FieldLabel>
          <FieldLabel label="Line height">
            <BufferedTextField
              value={String(node.textStyle?.lineHeight ?? 1.3)}
              onCommit={(value) => {
                const lineHeight = Number(value);
                if (Number.isFinite(lineHeight)) {
                  updateTextStyle({
                    lineHeight: Math.min(3, Math.max(0.8, lineHeight)),
                  });
                }
              }}
            />
          </FieldLabel>
          <FieldLabel label="Padding">
            <BufferedTextField
              value={String(node.textStyle?.padding ?? 8)}
              onCommit={(value) => {
                const padding = Number(value);
                if (Number.isFinite(padding)) {
                  updateTextStyle({
                    padding: Math.min(64, Math.max(0, padding)),
                  });
                }
              }}
            />
          </FieldLabel>
          <FieldLabel label="Font family">
            <select
              className={inputClass}
              value={node.textStyle?.fontFamily ?? ""}
              onChange={(event) =>
                updateTextStyle({
                  fontFamily: event.target.value || undefined,
                })
              }
            >
              <option value="">Semantic default</option>
              <option value="Arial">Arial</option>
              <option value="Inter">Inter</option>
              <option value="Georgia">Georgia</option>
              <option value="monospace">Monospace</option>
              <option value="system-ui">System UI</option>
            </select>
          </FieldLabel>
          <FieldLabel label="Weight">
            <select
              className={inputClass}
              value={node.textStyle?.fontWeight ?? ""}
              onChange={(event) =>
                updateTextStyle({
                  fontWeight:
                    (event.target.value as NonNullable<
                      SystemDesignNode["textStyle"]
                    >["fontWeight"]) || undefined,
                })
              }
            >
              <option value="">Semantic default</option>
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
            </select>
          </FieldLabel>
          <FieldLabel label="Style">
            <select
              className={inputClass}
              value={node.textStyle?.fontStyle ?? "normal"}
              onChange={(event) =>
                updateTextStyle({
                  fontStyle: event.target.value as NonNullable<
                    SystemDesignNode["textStyle"]
                  >["fontStyle"],
                })
              }
            >
              <option value="normal">Normal</option>
              <option value="italic">Italic</option>
            </select>
          </FieldLabel>
          <FieldLabel label="Decoration">
            <select
              className={inputClass}
              value={node.textStyle?.textDecoration ?? "none"}
              onChange={(event) =>
                updateTextStyle({
                  textDecoration: event.target.value as NonNullable<
                    SystemDesignNode["textStyle"]
                  >["textDecoration"],
                })
              }
            >
              <option value="none">None</option>
              <option value="underline">Underline</option>
              <option value="line-through">Strikethrough</option>
            </select>
          </FieldLabel>
          <FieldLabel label="Align">
            <select
              className={inputClass}
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
              <option value="">Semantic default</option>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </FieldLabel>
          <FieldLabel label="Vertical align">
            <select
              className={inputClass}
              value={node.textStyle?.verticalAlign ?? "middle"}
              onChange={(event) =>
                updateTextStyle({
                  verticalAlign: event.target.value as NonNullable<
                    SystemDesignNode["textStyle"]
                  >["verticalAlign"],
                })
              }
            >
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </select>
          </FieldLabel>
        </div>
      </fieldset>

      {isSystemDesignModuleNodeType(node.type) && (
        <fieldset className="space-y-2 rounded-md border border-border bg-background/40 p-3">
          <legend className="px-1 text-[11px] font-medium text-muted">
            Module behavior
          </legend>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-xs font-medium text-foreground">
                Expandable
              </span>
              <span className="block text-[10px] leading-relaxed text-muted">
                Double-click to open its internal diagram.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
              checked={node.isExpandable !== false}
              disabled={Boolean(node.childDiagramId)}
              title={
                node.childDiagramId
                  ? "A module with a child diagram must remain expandable."
                  : undefined
              }
              onChange={(event) =>
                onUpdate({ isExpandable: event.target.checked })
              }
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-2">
            <span>
              <span className="block text-xs font-medium text-foreground">
                Collapsed
              </span>
              <span className="block text-[10px] leading-relaxed text-muted">
                Replace expanded details with a compact subsystem summary.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
              checked={node.isCollapsed === true}
              onChange={(event) =>
                onUpdate({ isCollapsed: event.target.checked })
              }
            />
          </label>
          <p className="border-t border-border pt-2 text-[10px] text-muted">
            {node.childDiagramId
              ? "Child diagram linked"
              : "The child diagram is created on first drill-down."}
          </p>
          <dl className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-[10px]">
            <div>
              <dt className="text-muted">Internal components</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {internalComponentCount}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Technology summary</dt>
              <dd className="mt-0.5 truncate font-medium text-foreground">
                {node.technology?.name ?? "None"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">Child diagram ID</dt>
              <dd className="mt-0.5 break-all font-mono text-foreground">
                {node.childDiagramId ?? "Created on first open"}
              </dd>
            </div>
          </dl>
          {onOpenModule && node.isExpandable !== false && (
            <button
              type="button"
              className={`${buttonClass} w-full justify-center`}
              onClick={() => onOpenModule(node.id)}
            >
              Open Internal Diagram
            </button>
          )}
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-[11px] font-medium text-muted">Geometry</legend>
        <div className="grid grid-cols-2 gap-2">
          <FieldLabel label="X">
            <input
              className={inputClass}
              type="number"
              step={10}
              disabled={node.locked}
              value={Math.round(node.x)}
              onChange={(event) => {
                const x = Number(event.target.value);
                if (Number.isFinite(x)) onUpdate({ x });
              }}
            />
          </FieldLabel>
          <FieldLabel label="Y">
            <input
              className={inputClass}
              type="number"
              step={10}
              disabled={node.locked}
              value={Math.round(node.y)}
              onChange={(event) => {
                const y = Number(event.target.value);
                if (Number.isFinite(y)) onUpdate({ y });
              }}
            />
          </FieldLabel>
          <FieldLabel label="Width">
            <input
              className={inputClass}
              type="number"
              min={MIN_NODE_WIDTH}
              step={10}
              disabled={node.locked}
              value={Math.round(node.width)}
              onChange={(event) => {
                const width = Number(event.target.value);
                if (Number.isFinite(width)) {
                  onUpdate({ width: Math.max(MIN_NODE_WIDTH, width) });
                }
              }}
            />
          </FieldLabel>
          <FieldLabel label="Height">
            <input
              className={inputClass}
              type="number"
              min={MIN_NODE_HEIGHT}
              step={10}
              disabled={node.locked}
              value={Math.round(node.height)}
              onChange={(event) => {
                const height = Number(event.target.value);
                if (Number.isFinite(height)) {
                  onUpdate({
                    height: Math.max(MIN_NODE_HEIGHT, height),
                  });
                }
              }}
            />
          </FieldLabel>
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-background/50 px-3 py-2">
        <span>
          <span className="block text-xs font-medium text-foreground">
            Visible on canvas
          </span>
          <span className="block text-[10px] text-muted">
            Hidden components remain available from the Layers tab.
          </span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--accent)]"
          checked={node.visible !== false}
          onChange={(event) => onUpdate({ visible: event.target.checked })}
        />
      </label>

      <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-background/50 px-3 py-2">
        <span>
          <span className="block text-xs font-medium text-foreground">
            Lock component
          </span>
          <span className="block text-[10px] text-muted">
            Prevent moving and resizing.
          </span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--accent)]"
          checked={node.locked}
          onChange={(event) => onUpdate({ locked: event.target.checked })}
        />
      </label>
    </div>
  );
}

function EdgeProperties({
  edge,
  onUpdate,
}: {
  edge: SystemDesignEdge;
  onUpdate: (patch: SystemDesignEdgePropertyPatch) => void;
}) {
  const resolved = resolveSystemDesignEdgeStyle(edge);
  const semanticColor =
    SYSTEM_DESIGN_EDGE_ROLE_COLORS[
      resolved.semanticDefinition.colorRole
    ];
  const updateSemanticType = (type: SystemDesignEdgeType) => {
    onUpdate({
      type,
      color: undefined,
      lineStyle: undefined,
      strokeWidth: undefined,
      routing: undefined,
      startArrowhead: undefined,
      endArrowhead: undefined,
      labelIcon: undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-border bg-background/50 p-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent">
          <Workflow className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold text-foreground">
            {edge.label || "Connection"}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-muted">
            Edge
          </p>
        </div>
      </div>

      <FieldLabel label="Connection type">
        <select
          className={inputClass}
          value={edge.type}
          onChange={(event) =>
            updateSemanticType(event.target.value as SystemDesignEdgeType)
          }
        >
          <optgroup label="Architecture semantics">
            {SYSTEM_DESIGN_PRIMARY_EDGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SYSTEM_DESIGN_EDGE_SEMANTICS[type].label}
              </option>
            ))}
          </optgroup>
          {SYSTEM_DESIGN_LEGACY_EDGE_TYPES.includes(
            edge.type as (typeof SYSTEM_DESIGN_LEGACY_EDGE_TYPES)[number],
          ) && (
            <optgroup label="Legacy document values">
              {SYSTEM_DESIGN_LEGACY_EDGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SYSTEM_DESIGN_EDGE_SEMANTICS[type].label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </FieldLabel>

      <fieldset className="space-y-3 rounded-md border border-border bg-background/40 p-3">
        <legend className="px-1 text-[11px] font-medium text-muted">
          Line and routing
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <FieldLabel label="Line style">
            <select
              className={inputClass}
              value={resolved.lineStyle}
              onChange={(event) =>
                onUpdate({
                  lineStyle: event.target.value as SystemDesignEdge["lineStyle"],
                })
              }
            >
              {SYSTEM_DESIGN_EDGE_LINE_STYLES.map((style) => (
                <option key={style} value={style}>
                  {optionLabel(style)}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="Routing style">
            <select
              className={inputClass}
              value={resolved.routing}
              onChange={(event) =>
                onUpdate({
                  routing: event.target.value as SystemDesignEdge["routing"],
                })
              }
            >
              {SYSTEM_DESIGN_EDGE_ROUTINGS.map((routing) => (
                <option key={routing} value={routing}>
                  {optionLabel(routing)}
                </option>
              ))}
            </select>
          </FieldLabel>
        </div>
        <div className="grid grid-cols-[auto_1fr] items-end gap-2">
          <FieldLabel label="Color">
            <input
              className="h-9 w-12 cursor-pointer rounded-md border border-border bg-background p-1"
              type="color"
              value={edge.color ?? semanticColor}
              onChange={(event) => onUpdate({ color: event.target.value })}
            />
          </FieldLabel>
          <button
            type="button"
            className={`${buttonClass} justify-center`}
            disabled={!edge.color}
            onClick={() => onUpdate({ color: undefined })}
          >
            Use semantic color
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FieldLabel label="Thickness">
            <input
              className={inputClass}
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={resolved.strokeWidth}
              onChange={(event) => {
                const strokeWidth = Number(event.target.value);
                if (Number.isFinite(strokeWidth)) onUpdate({ strokeWidth });
              }}
            />
          </FieldLabel>
          <FieldLabel label={`Opacity ${Math.round(resolved.opacity * 100)}%`}>
            <input
              className="h-9 w-full accent-[var(--accent)]"
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={resolved.opacity}
              onChange={(event) =>
                onUpdate({ opacity: Number(event.target.value) })
              }
            />
          </FieldLabel>
        </div>
        <FieldLabel label="Custom dash pattern">
          <BufferedTextField
            value={edge.dashPattern?.join(", ") ?? ""}
            placeholder="Optional, e.g. 10, 6, 2, 6"
            onCommit={(value) => {
              const dashPattern = value
                .split(",")
                .map((part) => Number(part.trim()))
                .filter((part) => Number.isFinite(part) && part > 0);
              onUpdate({
                dashPattern: dashPattern.length >= 2 ? dashPattern : undefined,
              });
            }}
          />
        </FieldLabel>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-border bg-background/40 p-3">
        <legend className="px-1 text-[11px] font-medium text-muted">
          Arrowheads
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <FieldLabel label="Start arrowhead">
            <select
              className={inputClass}
              value={resolved.startArrowhead}
              onChange={(event) =>
                onUpdate({
                  startArrowhead:
                    event.target.value as SystemDesignEdge["startArrowhead"],
                })
              }
            >
              {SYSTEM_DESIGN_ARROWHEADS.map((arrowhead) => (
                <option key={arrowhead} value={arrowhead}>
                  {optionLabel(arrowhead)}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="End arrowhead">
            <select
              className={inputClass}
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
                  {optionLabel(arrowhead)}
                </option>
              ))}
            </select>
          </FieldLabel>
        </div>
        <button
          type="button"
          className={`${buttonClass} w-full justify-center`}
          onClick={() =>
            onUpdate({
              startArrowhead: "standard",
              endArrowhead: "standard",
            })
          }
        >
          Arrowheads at both ends
        </button>
      </fieldset>
      <FieldLabel label="Label">
        <BufferedTextField
          value={edge.label ?? ""}
          placeholder="e.g. Read / Write"
          onCommit={(label) => onUpdate({ label })}
        />
      </FieldLabel>
      <FieldLabel label="Protocol">
        <BufferedTextField
          value={edge.protocol ?? ""}
          placeholder="e.g. HTTPS, gRPC"
          onCommit={(protocol) => onUpdate({ protocol })}
        />
      </FieldLabel>
      <FieldLabel label="Description">
        <BufferedTextField
          className={`${inputClass} min-h-20 resize-y py-2`}
          value={edge.description ?? ""}
          placeholder="Describe the data flow."
          multiline
          onCommit={(description) => onUpdate({ description })}
        />
      </FieldLabel>

      <fieldset className="space-y-3 rounded-md border border-border bg-background/40 p-3">
        <legend className="px-1 text-[11px] font-medium text-muted">
          Label appearance
        </legend>
        <FieldLabel label="Label icon">
          <select
            className={inputClass}
            value={resolved.labelIcon}
            onChange={(event) =>
              onUpdate({
                labelIcon: event.target.value as SystemDesignEdge["labelIcon"],
              })
            }
          >
            {SYSTEM_DESIGN_EDGE_LABEL_ICONS.map((icon) => (
              <option key={icon} value={icon}>
                {optionLabel(icon)}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label={`Position ${Math.round(resolved.labelPosition * 100)}%`}>
          <input
            className="h-9 w-full accent-[var(--accent)]"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={resolved.labelPosition}
            onChange={(event) =>
              onUpdate({ labelPosition: Number(event.target.value) })
            }
          />
        </FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          <FieldLabel label="Background">
            <input
              className="h-9 w-full cursor-pointer rounded-md border border-border bg-background p-1"
              type="color"
              value={edge.labelBackground ?? "#09090b"}
              onChange={(event) =>
                onUpdate({ labelBackground: event.target.value })
              }
            />
          </FieldLabel>
          <FieldLabel label="Text color">
            <input
              className="h-9 w-full cursor-pointer rounded-md border border-border bg-background p-1"
              type="color"
              value={edge.labelTextColor ?? "#fafafa"}
              onChange={(event) =>
                onUpdate({ labelTextColor: event.target.value })
              }
            />
          </FieldLabel>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-border bg-background/40 p-3">
        <legend className="px-1 text-[11px] font-medium text-muted">
          Animation
        </legend>
        <FieldLabel label="Animation mode">
          <select
            className={inputClass}
            value={resolved.animationMode}
            onChange={(event) =>
              onUpdate({
                animationMode:
                  event.target.value as SystemDesignEdge["animationMode"],
              })
            }
          >
            {SYSTEM_DESIGN_EDGE_ANIMATION_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {optionLabel(mode)}
              </option>
            ))}
          </select>
        </FieldLabel>
        {resolved.animationMode !== "none" && (
          <div className="grid grid-cols-2 gap-2">
            <FieldLabel label="Speed">
              <input
                className={inputClass}
                type="number"
                min={0.1}
                max={5}
                step={0.1}
                value={resolved.animationSpeed}
                onChange={(event) =>
                  onUpdate({ animationSpeed: Number(event.target.value) })
                }
              />
            </FieldLabel>
            <FieldLabel label="Direction">
              <select
                className={inputClass}
                value={resolved.animationDirection}
                onChange={(event) =>
                  onUpdate({
                    animationDirection:
                      event.target.value as SystemDesignEdge["animationDirection"],
                  })
                }
              >
                {SYSTEM_DESIGN_EDGE_ANIMATION_DIRECTIONS.map((direction) => (
                  <option key={direction} value={direction}>
                    {optionLabel(direction)}
                  </option>
                ))}
              </select>
            </FieldLabel>
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <FieldLabel label="Source port">
          <select
            className={inputClass}
            value={edge.sourcePort}
            onChange={(event) =>
              onUpdate({
                sourcePort: event.target.value as SystemDesignEdge["sourcePort"],
              })
            }
          >
            {ports.map((port) => (
              <option key={port} value={port}>
                {port}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Target port">
          <select
            className={inputClass}
            value={edge.targetPort}
            onChange={(event) =>
              onUpdate({
                targetPort: event.target.value as SystemDesignEdge["targetPort"],
              })
            }
          >
            {ports.map((port) => (
              <option key={port} value={port}>
                {port}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>
    </div>
  );
}

export function SystemDesignInspector({
  activeTab,
  onTabChange,
  selectedNode,
  selectedEdge,
  selectedCount,
  selectedNodeInternalComponentCount,
  problem,
  layersProps,
  onUpdateNode,
  onUpdateEdge,
  onOpenModule,
  className = "",
}: SystemDesignInspectorProps) {
  const baseId = useId();

  return (
    <aside
      className={`flex min-h-0 w-80 shrink-0 flex-col border-l border-border bg-surface ${className}`}
      aria-label="Diagram inspector"
    >
      <div className="grid grid-cols-3 border-b border-border" role="tablist">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${baseId}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${baseId}-${tab.id}-panel`}
              className={`border-b-2 px-2 py-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-${activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-${activeTab}-tab`}
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        {activeTab === "properties" &&
          (selectedNode && selectedCount === 1 ? (
            <NodeProperties
              key={selectedNode.id}
              node={selectedNode}
              internalComponentCount={selectedNodeInternalComponentCount}
              onOpenModule={onOpenModule}
              onUpdate={(patch) => onUpdateNode(selectedNode.id, patch)}
            />
          ) : selectedEdge && selectedCount === 1 ? (
            <EdgeProperties
              key={selectedEdge.id}
              edge={selectedEdge}
              onUpdate={(patch) => onUpdateEdge(selectedEdge.id, patch)}
            />
          ) : (
            <EmptyProperties selectedCount={selectedCount} problem={problem} />
          ))}
        {activeTab === "problem" && (
          <SystemDesignProblemPanel problem={problem} />
        )}
        {activeTab === "layers" && (
          <SystemDesignLayersPanel {...layersProps} />
        )}
      </div>
    </aside>
  );
}
