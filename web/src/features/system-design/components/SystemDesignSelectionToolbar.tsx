"use client";

import { Copy, Trash2 } from "lucide-react";
import type {
  SystemDesignEdge,
  SystemDesignLayerDirection,
  SystemDesignNode,
} from "../types/system-design.types";
import {
  ArrangeMenu,
  QuickEdgeControls,
  QuickTextControls,
  SelectionActionsMenu,
  TEXT_FORMATTABLE_NODE_TYPES,
  type SystemDesignArrangeOperation,
} from "./SystemDesignToolbar";
import { EditorIconButton } from "./SystemDesignUiPrimitives";

export function SystemDesignSelectionToolbar({
  selectedNodes,
  selectedEdge,
  onArrange,
  onDuplicate,
  onSetLocked,
  onSetVisible,
  onReorder,
  onGroup,
  onUngroup,
  onDelete,
  onUpdateText,
  onUpdateEdge,
}: {
  selectedNodes: SystemDesignNode[];
  selectedEdge: SystemDesignEdge | null;
  onArrange?: (operation: SystemDesignArrangeOperation) => void;
  onDuplicate?: () => void;
  onSetLocked?: (locked: boolean) => void;
  onSetVisible?: (visible: boolean) => void;
  onReorder?: (direction: SystemDesignLayerDirection) => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onDelete?: () => void;
  onUpdateText?: (
    textStyle: NonNullable<SystemDesignNode["textStyle"]>,
  ) => void;
  onUpdateEdge?: (
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
  if (selectedNodes.length === 0 && !selectedEdge) return null;

  const textNode =
    selectedNodes.length === 1 &&
    TEXT_FORMATTABLE_NODE_TYPES.has(selectedNodes[0].type)
      ? selectedNodes[0]
      : null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 max-w-[calc(100%-8rem)] -translate-x-1/2">
      <div
        className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-[var(--editor-border)] bg-[var(--editor-floating)] p-1 shadow-lg backdrop-blur"
        role="toolbar"
        aria-label="Selection controls"
      >
        {selectedNodes.length > 0 && (
          <>
            <SelectionActionsMenu
              selectedNodes={selectedNodes}
              onDuplicate={onDuplicate}
              onSetLocked={onSetLocked}
              onSetVisible={onSetVisible}
              onReorder={onReorder}
              onGroup={onGroup}
              onUngroup={onUngroup}
              onDelete={onDelete}
            />
            <EditorIconButton
              label="Duplicate selection"
              disabled={!onDuplicate}
              onClick={() => onDuplicate?.()}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </EditorIconButton>
            <ArrangeMenu
              selectedNodeCount={selectedNodes.length}
              onArrange={onArrange}
            />
          </>
        )}
        {textNode && onUpdateText && (
          <QuickTextControls node={textNode} onUpdate={onUpdateText} />
        )}
        {selectedEdge && onUpdateEdge && (
          <QuickEdgeControls edge={selectedEdge} onUpdate={onUpdateEdge} />
        )}
        <EditorIconButton
          label="Delete selection"
          disabled={!onDelete}
          onClick={() => onDelete?.()}
          className="hover:text-danger"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </EditorIconButton>
      </div>
    </div>
  );
}
