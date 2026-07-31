"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
} from "lucide-react";
import { inputClass } from "@/features/admin/components/AdminPrimitives";
import type { SystemDesignNode } from "../types/system-design.types";
import { SystemDesignNodeIcon } from "./SystemDesignIcons";

export interface SystemDesignLayersPanelProps {
  nodes: readonly SystemDesignNode[];
  selectedNodeIds: readonly string[];
  onSelectNode: (nodeId: string, additive: boolean) => void;
  onRenameNode: (nodeId: string, label: string) => void;
  onToggleVisibility: (nodeId: string) => void;
  onToggleLocked: (nodeId: string) => void;
  onMoveForward: (nodeId: string) => void;
  onMoveBackward: (nodeId: string) => void;
  onBringToFront: (nodeId: string) => void;
  onSendToBack: (nodeId: string) => void;
  className?: string;
}

interface LayerActionProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

function LayerAction({
  label,
  onClick,
  disabled,
  children,
}: LayerActionProps) {
  return (
    <button
      type="button"
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted transition hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-30"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function BufferedLayerName({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [edit, setEdit] = useState(() => ({
    source: value,
    draft: value,
  }));
  const cancelBlurRef = useRef(false);
  const draft = edit.source === value ? edit.draft : value;

  return (
    <input
      className={`${inputClass} h-7 min-h-7 px-2 text-xs`}
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) =>
        setEdit({ source: value, draft: event.target.value })
      }
      onBlur={() => {
        if (cancelBlurRef.current) {
          cancelBlurRef.current = false;
          return;
        }
        if (draft !== value) {
          onCommit(draft);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelBlurRef.current = true;
          setEdit({ source: value, draft: value });
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function SystemDesignLayersPanel({
  nodes,
  selectedNodeIds,
  onSelectNode,
  onRenameNode,
  onToggleVisibility,
  onToggleLocked,
  onMoveForward,
  onMoveBackward,
  onBringToFront,
  onSendToBack,
  className = "",
}: SystemDesignLayersPanelProps) {
  const orderedNodes = [...nodes].sort((left, right) => right.layer - left.layer);

  if (orderedNodes.length === 0) {
    return (
      <div
        className={`rounded-md border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted ${className}`}
      >
        Add a component to create the first layer.
      </div>
    );
  }

  return (
    <ol className={`space-y-1.5 ${className}`} aria-label="Diagram layers">
      {orderedNodes.map((node, index) => {
        const selected = selectedNodeIds.includes(node.id);
        const visible = node.visible !== false;
        const isFront = index === 0;
        const isBack = index === orderedNodes.length - 1;

        return (
          <li
            key={node.id}
            className={`rounded-md border p-2 transition ${
              selected
                ? "border-accent bg-accent/10"
                : "border-border bg-background/40 hover:border-border/80"
              } ${visible ? "" : "opacity-60"}`}
            aria-current={selected ? "true" : undefined}
          >
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-surface-elevated text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode(node.id, event.shiftKey);
                }}
                aria-label={`Select ${node.label}`}
                title={`Layer ${node.layer}`}
              >
                <SystemDesignNodeIcon type={node.type} className="h-3.5 w-3.5" />
              </button>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Layer name</span>
                <BufferedLayerName
                  value={node.label}
                  onCommit={(label) => onRenameNode(node.id, label)}
                />
              </label>
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="truncate text-[10px] text-muted">
                Layer {node.layer}
                {node.locked ? " · Locked" : ""}
              </span>
              <div className="flex items-center">
                <LayerAction
                  label={visible ? `Hide ${node.label}` : `Show ${node.label}`}
                  onClick={() => onToggleVisibility(node.id)}
                >
                  {visible ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </LayerAction>
                <LayerAction
                  label={node.locked ? `Unlock ${node.label}` : `Lock ${node.label}`}
                  onClick={() => onToggleLocked(node.id)}
                >
                  {node.locked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <LockOpen className="h-3.5 w-3.5" />
                  )}
                </LayerAction>
                <LayerAction
                  label={`Move ${node.label} forward`}
                  onClick={() => onMoveForward(node.id)}
                  disabled={isFront}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </LayerAction>
                <LayerAction
                  label={`Move ${node.label} backward`}
                  onClick={() => onMoveBackward(node.id)}
                  disabled={isBack}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </LayerAction>
                <LayerAction
                  label={`Bring ${node.label} to front`}
                  onClick={() => onBringToFront(node.id)}
                  disabled={isFront}
                >
                  <ChevronsUp className="h-3.5 w-3.5" />
                </LayerAction>
                <LayerAction
                  label={`Send ${node.label} to back`}
                  onClick={() => onSendToBack(node.id)}
                  disabled={isBack}
                >
                  <ChevronsDown className="h-3.5 w-3.5" />
                </LayerAction>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
