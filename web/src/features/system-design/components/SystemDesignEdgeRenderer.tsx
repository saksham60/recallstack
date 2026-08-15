"use client";

import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type Konva from "konva";
import { Arrow, Circle, Group, Line, Rect, Text } from "react-konva";
import {
  getSystemDesignLineDash,
  resolveSystemDesignEdgeStyle,
  type SystemDesignEdgeColorRole,
} from "../constants/system-design-edge-registry";
import type {
  SystemDesignArrowhead,
  SystemDesignEdge,
  SystemDesignNode,
  SystemDesignPoint,
  SystemDesignPort,
} from "../types/system-design.types";
import {
  getSystemDesignConnectionPoints,
  getSystemDesignPathPoint,
  getSystemDesignPathTangent,
} from "../utils/canvas-geometry";
import { recordSystemDesignRender } from "../utils/performance-instrumentation";
import type { SystemDesignCanvasTheme } from "./SystemDesignNodeRenderer";

export interface SystemDesignEdgeRendererProps {
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
  onEditLabel?: (edgeId: string) => void;
}

export interface SystemDesignEdgeRendererHandle {
  getGroup: () => Konva.Group | null;
  isAnimated: () => boolean;
  setAnimationActive: (active: boolean) => void;
  setAnimationFrame: (elapsedMilliseconds: number) => void;
  updateGeometry: (
    source: SystemDesignNode,
    target: SystemDesignNode,
  ) => void;
}

export function getNodePortPosition(
  node: SystemDesignNode,
  port: SystemDesignPort,
): SystemDesignPoint {
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

function resolveRoleColor(
  role: SystemDesignEdgeColorRole,
  theme: SystemDesignCanvasTheme,
): string {
  switch (role) {
    case "accent":
      return theme.accent;
    case "success":
      return theme.success;
    case "warning":
      return theme.warning;
    case "danger":
      return theme.danger;
    case "muted":
      return theme.muted;
    case "blue":
      return "#60a5fa";
    case "cyan":
      return "#22d3ee";
    case "orange":
      return "#fb923c";
  }
}

function getArrowRotation(
  points: readonly number[],
  endpoint: "start" | "end",
): number {
  const tangent = getSystemDesignPathTangent(points, endpoint);
  const angle = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI;
  return endpoint === "start" ? angle + 180 : angle;
}

function EdgeArrowhead({
  endpoint,
  points,
  style,
  color,
  opacity,
  strokeWidth,
  registerRef,
}: {
  endpoint: "start" | "end";
  points: readonly number[];
  style: SystemDesignArrowhead;
  color: string;
  opacity: number;
  strokeWidth: number;
  registerRef?: (group: Konva.Group | null) => void;
}) {
  if (style === "none" || points.length < 4) return null;
  const point =
    endpoint === "start"
      ? { x: points[0], y: points[1] }
      : { x: points.at(-2) ?? 0, y: points.at(-1) ?? 0 };
  const rotation = getArrowRotation(points, endpoint);
  const common = {
    stroke: color,
    strokeWidth,
    lineJoin: "round" as const,
    lineCap: "round" as const,
    listening: false,
    perfectDrawEnabled: false,
  };

  return (
    <Group
      ref={registerRef}
      x={point.x}
      y={point.y}
      rotation={rotation}
      opacity={opacity}
      listening={false}
    >
      {style === "open" && <Line points={[-9, -5, 0, 0, -9, 5]} {...common} />}
      {style === "standard" && (
        <Line
          points={[-8, -5, 0, 0, -8, 5, -5.5, 0]}
          closed
          fill={color}
          {...common}
        />
      )}
      {style === "filled_triangle" && (
        <Line points={[-11, -6.5, 0, 0, -11, 6.5]} closed fill={color} {...common} />
      )}
      {style === "circle" && (
        <Circle x={-4.5} radius={4.5} fill={color} {...common} />
      )}
      {style === "diamond" && (
        <Line
          points={[0, 0, -6, -5, -12, 0, -6, 5]}
          closed
          fill={color}
          {...common}
        />
      )}
    </Group>
  );
}

const LABEL_ICONS: Readonly<Record<NonNullable<SystemDesignEdge["labelIcon"]>, string>> = {
  none: "",
  http: "HTTP",
  grpc: "RPC",
  websocket: "WS",
  database: "DB",
  message: "MSG",
  event: "EVT",
  stream: "STR",
  replication: "REP",
  batch: "BAT",
  failure: "!",
};

function animationProgress(
  elapsedMilliseconds: number,
  speed: number,
  direction: NonNullable<SystemDesignEdge["animationDirection"]>,
): number {
  const raw = (elapsedMilliseconds * speed) / 1800;
  if (direction === "reverse") return 1 - (raw % 1);
  if (direction === "alternate") {
    const cycle = raw % 2;
    return cycle <= 1 ? cycle : 2 - cycle;
  }
  return raw % 1;
}

const SystemDesignEdgeRendererComponent = forwardRef<
  SystemDesignEdgeRendererHandle,
  SystemDesignEdgeRendererProps
>(function SystemDesignEdgeRendererComponent(
  { edge, source, target, selected, preview, theme, onSelect, onEditLabel },
  ref,
) {
  const arrowRef = useRef<Konva.Arrow>(null);
  const animatedLineRef = useRef<Konva.Line>(null);
  const animatedPulseRef = useRef<Konva.Circle>(null);
  const startArrowheadRef = useRef<Konva.Group>(null);
  const endArrowheadRef = useRef<Konva.Group>(null);
  const groupRef = useRef<Konva.Group>(null);
  const sourceHandleRef = useRef<Konva.Circle>(null);
  const targetHandleRef = useRef<Konva.Circle>(null);
  const labelGroupRef = useRef<Konva.Group>(null);
  const resolved = resolveSystemDesignEdgeStyle(edge);
  const routing = resolved.routing;
  const start = getNodePortPosition(source, edge.sourcePort);
  const end = getNodePortPosition(target, edge.targetPort);
  const points = getSystemDesignConnectionPoints(start, end, routing);
  const pointsRef = useRef(points);
  const color = selected
    ? theme.accent
    : edge.color ??
      resolveRoleColor(resolved.semanticDefinition.colorRole, theme);
  const strokeWidth = Math.min(12, Math.max(1, resolved.strokeWidth));
  const opacity = Math.min(1, Math.max(0.1, resolved.opacity));
  const dash = getSystemDesignLineDash(
    resolved.lineStyle,
    strokeWidth,
    edge.dashPattern,
  );
  const label = edge.label || edge.protocol;
  const labelPoint = getSystemDesignPathPoint(points, resolved.labelPosition);
  const labelIcon = LABEL_ICONS[resolved.labelIcon];
  const labelText = [labelIcon, label].filter(Boolean).join("  ");
  const labelWidth = Math.min(210, Math.max(54, labelText.length * 6.1 + 18));
  const isAnimated = resolved.animationMode !== "none";
  const animatedDash = useMemo(() => {
    if (resolved.animationMode === "moving_dots") return [1, 11];
    if (resolved.animationMode === "moving_dash") {
      return dash ?? [strokeWidth * 5, strokeWidth * 3];
    }
    return undefined;
  }, [dash, resolved.animationMode, strokeWidth]);

  useLayoutEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    recordSystemDesignRender("edge");
  });

  useImperativeHandle(
    ref,
    () => ({
      getGroup: () => groupRef.current,
      isAnimated: () => isAnimated,
      setAnimationActive: (active) => {
        animatedLineRef.current?.visible(active);
        animatedPulseRef.current?.visible(active);
        if (!active) animatedLineRef.current?.dashOffset(0);
      },
      setAnimationFrame: (elapsedMilliseconds) => {
        if (!isAnimated) return;
        const directionMultiplier =
          resolved.animationDirection === "reverse" ? -1 : 1;
        const offset =
          ((elapsedMilliseconds * resolved.animationSpeed) / 35) *
          directionMultiplier;
        if (
          resolved.animationMode === "moving_dash" ||
          resolved.animationMode === "moving_dots"
        ) {
          animatedLineRef.current?.dashOffset(-offset);
        } else if (resolved.animationMode === "flow_pulse") {
          const pulse = (Math.sin(elapsedMilliseconds * resolved.animationSpeed * 0.006) + 1) / 2;
          animatedLineRef.current?.opacity(0.15 + pulse * 0.6);
          animatedLineRef.current?.strokeWidth(strokeWidth + pulse * 2);
        } else if (resolved.animationMode === "direction_pulse") {
          const point = getSystemDesignPathPoint(
            pointsRef.current,
            animationProgress(
              elapsedMilliseconds,
              resolved.animationSpeed,
              resolved.animationDirection,
            ),
          );
          animatedPulseRef.current?.position(point);
        }
      },
      updateGeometry: (nextSource, nextTarget) => {
        const nextStart = getNodePortPosition(nextSource, edge.sourcePort);
        const nextEnd = getNodePortPosition(nextTarget, edge.targetPort);
        const nextPoints = getSystemDesignConnectionPoints(
          nextStart,
          nextEnd,
          routing,
        );
        pointsRef.current = nextPoints;
        arrowRef.current?.points(nextPoints);
        animatedLineRef.current?.points(nextPoints);
        startArrowheadRef.current?.position(nextStart);
        startArrowheadRef.current?.rotation(
          getArrowRotation(nextPoints, "start"),
        );
        endArrowheadRef.current?.position(nextEnd);
        endArrowheadRef.current?.rotation(
          getArrowRotation(nextPoints, "end"),
        );
        sourceHandleRef.current?.position(nextStart);
        targetHandleRef.current?.position(nextEnd);
        const nextLabel = getSystemDesignPathPoint(
          nextPoints,
          resolved.labelPosition,
        );
        labelGroupRef.current?.position(nextLabel);
        groupRef.current?.getLayer()?.batchDraw();
      },
    }),
    [
      edge.sourcePort,
      edge.targetPort,
      isAnimated,
      resolved.animationDirection,
      resolved.animationMode,
      resolved.animationSpeed,
      resolved.labelPosition,
      routing,
      strokeWidth,
    ],
  );

  const handleSelect = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
    additive: boolean,
  ) => onSelect(edge.id, additive, event);

  const handleEditLabel = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    if (preview || !onEditLabel) return;
    event.cancelBubble = true;
    onSelect(edge.id, false, event);
    onEditLabel(edge.id);
  };

  return (
    <Group ref={groupRef} name="system-design-edge-group">
      <Arrow
        ref={arrowRef}
        name="system-design-edge"
        points={points}
        stroke={color}
        fill={color}
        strokeWidth={selected ? strokeWidth + 1 : strokeWidth}
        pointerAtBeginning={false}
        pointerAtEnding={false}
        lineJoin="round"
        lineCap="round"
        tension={routing === "curved" ? 0.35 : 0}
        opacity={selected ? 1 : opacity}
        dash={dash}
        hitStrokeWidth={Math.max(18, strokeWidth + 14)}
        listening={!preview}
        onClick={(event) => handleSelect(event, event.evt.shiftKey)}
        onTap={(event) => handleSelect(event, false)}
        onDblClick={handleEditLabel}
        onDblTap={handleEditLabel}
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
      <EdgeArrowhead
        endpoint="start"
        points={points}
        style={resolved.startArrowhead}
        color={color}
        opacity={opacity}
        strokeWidth={strokeWidth}
        registerRef={(group) => {
          startArrowheadRef.current = group;
        }}
      />
      <EdgeArrowhead
        endpoint="end"
        points={points}
        style={resolved.endArrowhead}
        color={color}
        opacity={opacity}
        strokeWidth={strokeWidth}
        registerRef={(group) => {
          endArrowheadRef.current = group;
        }}
      />
      {isAnimated &&
        (resolved.animationMode === "moving_dash" ||
          resolved.animationMode === "moving_dots" ||
          resolved.animationMode === "flow_pulse") && (
        <Line
          ref={animatedLineRef}
          points={points}
          stroke={color}
          strokeWidth={strokeWidth + 1}
          lineJoin="round"
          lineCap="round"
          tension={routing === "curved" ? 0.35 : 0}
          opacity={resolved.animationMode === "flow_pulse" ? 0.3 : 0.85}
          dash={animatedDash}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {isAnimated && resolved.animationMode === "direction_pulse" && (
        <Circle
          ref={animatedPulseRef}
          x={start.x}
          y={start.y}
          radius={Math.max(3, strokeWidth + 1)}
          fill={color}
          shadowColor={color}
          shadowBlur={5}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {selected && (
        <>
          <Circle
            ref={sourceHandleRef}
            x={start.x}
            y={start.y}
            radius={4}
            fill={theme.background}
            stroke={theme.accent}
            strokeWidth={2}
            listening={false}
          />
          <Circle
            ref={targetHandleRef}
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
      {labelText && (
        <Group
          ref={labelGroupRef}
          x={labelPoint.x}
          y={labelPoint.y}
          listening={!preview}
          onClick={(event) => handleSelect(event, event.evt.shiftKey)}
          onTap={(event) => handleSelect(event, false)}
          onDblClick={handleEditLabel}
          onDblTap={handleEditLabel}
          onMouseEnter={(event) =>
            event.target
              .getStage()
              ?.container()
              .style.setProperty("cursor", "text")
          }
          onMouseLeave={(event) =>
            event.target
              .getStage()
              ?.container()
              .style.setProperty("cursor", "default")
          }
        >
          <Rect
            x={-labelWidth / 2}
            y={-12}
            width={labelWidth}
            height={22}
            cornerRadius={6}
            fill={edge.labelBackground ?? theme.background}
            stroke={selected ? theme.accent : theme.border}
            strokeWidth={1}
            opacity={0.94}
          />
          <Text
            x={-labelWidth / 2 + 7}
            y={-6}
            width={labelWidth - 14}
            align="center"
            text={labelText}
            fill={edge.labelTextColor ?? (selected ? theme.accent : theme.foreground)}
            fontFamily="Inter, Arial, sans-serif"
            fontSize={10}
            ellipsis
            wrap="none"
            listening={false}
          />
        </Group>
      )}
    </Group>
  );
});

export const SystemDesignEdgeRenderer = memo(SystemDesignEdgeRendererComponent);
