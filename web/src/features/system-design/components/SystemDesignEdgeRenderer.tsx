"use client";

import { memo } from "react";
import type Konva from "konva";
import { Arrow, Circle, Text } from "react-konva";
import type {
  SystemDesignEdge,
  SystemDesignNode,
  SystemDesignPort,
} from "../types/system-design.types";
import { getSystemDesignConnectionPoints } from "../utils/canvas-geometry";
import type { SystemDesignCanvasTheme } from "./SystemDesignNodeRenderer";

interface SystemDesignEdgeRendererProps {
  edge: SystemDesignEdge;
  source: SystemDesignNode;
  target: SystemDesignNode;
  selected: boolean;
  preview: boolean;
  theme: SystemDesignCanvasTheme;
  onSelect: (
    edgeId: string,
    additive: boolean,
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void;
}

export function getNodePortPosition(
  node: SystemDesignNode,
  port: SystemDesignPort,
): { x: number; y: number } {
  switch (port) {
    case "top":
      return { x: node.x + node.width / 2, y: node.y };
    case "right":
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case "bottom":
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case "left":
      return { x: node.x, y: node.y + node.height / 2 };
  }
}

function edgeColor(
  edge: SystemDesignEdge,
  selected: boolean,
  theme: SystemDesignCanvasTheme,
): string {
  if (selected) return theme.accent;
  switch (edge.type) {
    case "async":
    case "event":
      return theme.warning;
    case "data":
    case "replication":
      return theme.success;
    case "response":
      return "#38bdf8";
    case "request":
      return theme.muted;
  }
}

function SystemDesignEdgeRendererComponent({
  edge,
  source,
  target,
  selected,
  preview,
  theme,
  onSelect,
}: SystemDesignEdgeRendererProps) {
  const start = getNodePortPosition(source, edge.sourcePort);
  const end = getNodePortPosition(target, edge.targetPort);
  const points = getSystemDesignConnectionPoints(
    start,
    end,
    edge.routing,
  );
  const color = edgeColor(edge, selected, theme);
  const label = edge.label || edge.protocol;
  const midpoint = {
    x: start.x + (end.x - start.x) / 2,
    y: start.y + (end.y - start.y) / 2,
  };

  return (
    <>
      <Arrow
        name="system-design-edge"
        points={points}
        stroke={color}
        fill={color}
        strokeWidth={selected ? 3 : 2}
        pointerLength={8}
        pointerWidth={8}
        lineJoin="round"
        lineCap="round"
        tension={edge.routing === "curved" ? 0.35 : 0}
        opacity={selected ? 1 : 0.9}
        dash={
          edge.type === "async" || edge.type === "event" ? [8, 6] : undefined
        }
        hitStrokeWidth={18}
        listening={!preview}
        onClick={(event) =>
          onSelect(
            edge.id,
            event.evt.shiftKey,
            event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
          )
        }
        onTap={(event) =>
          onSelect(
            edge.id,
            false,
            event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
          )
        }
        onMouseEnter={(event) =>
          event.target
            .getStage()
            ?.container()
            .style.setProperty("cursor", "pointer")
        }
        onMouseLeave={(event) =>
          event.target
            .getStage()
            ?.container()
            .style.setProperty("cursor", "default")
        }
      />
      {selected && (
        <>
          <Circle
            x={start.x}
            y={start.y}
            radius={4}
            fill={theme.background}
            stroke={theme.accent}
            strokeWidth={2}
            listening={false}
          />
          <Circle
            x={end.x}
            y={end.y}
            radius={4}
            fill={theme.background}
            stroke={theme.accent}
            strokeWidth={2}
            listening={false}
          />
        </>
      )}
      {label && (
        <Text
          x={midpoint.x - 55}
          y={midpoint.y - 18}
          width={110}
          align="center"
          text={label}
          fill={selected ? theme.accent : theme.muted}
          fontFamily="Arial"
          fontSize={10}
          listening={false}
        />
      )}
    </>
  );
}

export const SystemDesignEdgeRenderer = memo(
  SystemDesignEdgeRendererComponent,
);
