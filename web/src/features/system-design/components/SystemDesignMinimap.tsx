"use client";

import { memo, useMemo, type MouseEvent } from "react";
import type {
  SystemDesignEdge,
  SystemDesignNode,
  SystemDesignSize,
  SystemDesignViewport,
} from "../types/system-design.types";
import { getSystemDesignNodeDefinition } from "../constants/system-design-palette";

interface SystemDesignMinimapProps {
  nodes: readonly SystemDesignNode[];
  edges: readonly SystemDesignEdge[];
  viewport: SystemDesignViewport;
  canvasSize: SystemDesignSize;
  onNavigate: (point: { x: number; y: number }) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  clients: "#38bdf8",
  networking: "#a78bfa",
  compute: "#60a5fa",
  data: "#22c55e",
  messaging: "#f59e0b",
  external: "#f97316",
  module: "#c084fc",
  system_boundary: "#94a3b8",
  container: "#60a5fa",
  modules: "#c084fc",
  boundaries: "#94a3b8",
  annotations: "#fde047",
};

interface MinimapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getBounds(
  nodes: readonly SystemDesignNode[],
  viewport: SystemDesignViewport,
  canvasSize: SystemDesignSize,
): MinimapBounds {
  const viewportBounds = {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: canvasSize.width / viewport.zoom,
    height: canvasSize.height / viewport.zoom,
  };
  const visible = nodes.filter((node) => node.visible);
  const left = Math.min(
    viewportBounds.x,
    ...visible.map((node) => node.x),
  );
  const top = Math.min(
    viewportBounds.y,
    ...visible.map((node) => node.y),
  );
  const right = Math.max(
    viewportBounds.x + viewportBounds.width,
    ...visible.map((node) => node.x + node.width),
  );
  const bottom = Math.max(
    viewportBounds.y + viewportBounds.height,
    ...visible.map((node) => node.y + node.height),
  );
  const padding = Math.max(48, Math.max(right - left, bottom - top) * 0.08);
  return {
    x: left - padding,
    y: top - padding,
    width: Math.max(1, right - left + padding * 2),
    height: Math.max(1, bottom - top + padding * 2),
  };
}

function SystemDesignMinimapComponent({
  nodes,
  edges,
  viewport,
  canvasSize,
  onNavigate,
}: SystemDesignMinimapProps) {
  const bounds = useMemo(
    () => getBounds(nodes, viewport, canvasSize),
    [canvasSize, nodes, viewport],
  );
  const nodeMap = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const viewportRect = {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: canvasSize.width / viewport.zoom,
    height: canvasSize.height / viewport.zoom,
  };

  const navigate = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    onNavigate({
      x:
        bounds.x +
        ((event.clientX - rect.left) / rect.width) * bounds.width,
      y:
        bounds.y +
        ((event.clientY - rect.top) / rect.height) * bounds.height,
    });
  };

  return (
    <div className="absolute bottom-3 right-3 z-10 w-44 overflow-hidden rounded-lg border border-border bg-surface/90 p-1 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between px-1 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted">
        <span>Minimap</span>
        <span>{nodes.length} components</span>
      </div>
      <svg
        role="img"
        aria-label="Diagram minimap. Click to reposition the canvas."
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        className="h-24 w-full cursor-crosshair rounded bg-background"
        onClick={navigate}
      >
        {edges.map((edge) => {
          const source = nodeMap.get(edge.sourceNodeId);
          const target = nodeMap.get(edge.targetNodeId);
          if (!source || !target || !source.visible || !target.visible) {
            return null;
          }
          return (
            <line
              key={edge.id}
              x1={source.x + source.width / 2}
              y1={source.y + source.height / 2}
              x2={target.x + target.width / 2}
              y2={target.y + target.height / 2}
              stroke="var(--muted)"
              strokeWidth={Math.max(2, bounds.width / 500)}
              opacity="0.55"
            />
          );
        })}
        {nodes
          .filter((node) => node.visible)
          .map((node) => {
            const category = getSystemDesignNodeDefinition(node.type).category;
            return (
              <rect
                key={node.id}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rx={Math.min(node.width, node.height) * 0.12}
                fill={CATEGORY_COLORS[category] ?? "#a78bfa"}
                opacity="0.82"
              />
            );
          })}
        <rect
          x={viewportRect.x}
          y={viewportRect.y}
          width={viewportRect.width}
          height={viewportRect.height}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={Math.max(3, bounds.width / 350)}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

export const SystemDesignMinimap = memo(SystemDesignMinimapComponent);
