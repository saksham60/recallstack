"use client";

import { useId, useRef, useState } from "react";
import { Workflow } from "lucide-react";
import { inputClass } from "@/features/admin/components/AdminPrimitives";
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
    | "isExpandable"
    | "isCollapsed"
    | "locked"
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
  >
>;

export interface SystemDesignInspectorProps {
  activeTab: SystemDesignInspectorTab;
  onTabChange: (tab: SystemDesignInspectorTab) => void;
  selectedNode?: SystemDesignNode | null;
  selectedEdge?: SystemDesignEdge | null;
  selectedCount: number;
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

const edgeTypes: ReadonlyArray<{
  value: SystemDesignEdgeType;
  label: string;
}> = [
  { value: "request", label: "Request" },
  { value: "response", label: "Response" },
  { value: "async", label: "Async" },
  { value: "event", label: "Event" },
  { value: "data", label: "Data" },
  { value: "replication", label: "Replication" },
  { value: "read", label: "Data read" },
  { value: "write", label: "Data write" },
  { value: "stream", label: "Event stream" },
];

const ports = ["top", "right", "bottom", "left"] as const;

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

function EmptyProperties({ selectedCount }: { selectedCount: number }) {
  return (
    <div className="rounded-md border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted">
      {selectedCount > 1
        ? `${selectedCount} components are selected. Select one component or connection to edit its properties.`
        : "Select a component or connection to edit its properties."}
    </div>
  );
}

function NodeProperties({
  node,
  onUpdate,
}: {
  node: SystemDesignNode;
  onUpdate: (patch: SystemDesignNodePropertyPatch) => void;
}) {
  const statusListId = useId();
  const technologyId = node.technology?.id ?? "";
  const status = node.metadata?.status ?? node.metadata?.state ?? "";

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

      {node.type === "module" && (
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
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-[11px] font-medium text-muted">Size</legend>
        <div className="grid grid-cols-2 gap-2">
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
            onUpdate({ type: event.target.value as SystemDesignEdgeType })
          }
        >
          {edgeTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </FieldLabel>
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
  problem,
  layersProps,
  onUpdateNode,
  onUpdateEdge,
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
              onUpdate={(patch) => onUpdateNode(selectedNode.id, patch)}
            />
          ) : selectedEdge && selectedCount === 1 ? (
            <EdgeProperties
              key={selectedEdge.id}
              edge={selectedEdge}
              onUpdate={(patch) => onUpdateEdge(selectedEdge.id, patch)}
            />
          ) : (
            <EmptyProperties selectedCount={selectedCount} />
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
