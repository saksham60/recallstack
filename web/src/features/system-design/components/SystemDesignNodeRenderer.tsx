"use client";

import { memo, useEffect, useRef, useState } from "react";
import type Konva from "konva";
import {
  Circle,
  Ellipse,
  Group,
  Line,
  Rect,
  Text,
} from "react-konva";
import {
  getSystemDesignNodeVisual,
  getSystemDesignTechnologyName,
  resolveSystemDesignTechnology,
  type SystemDesignNodeChrome,
} from "../constants/system-design-visual-registry";
import type {
  SystemDesignNode,
  SystemDesignPort,
} from "../types/system-design.types";
import {
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
} from "../utils/system-design-defaults";
import { recordSystemDesignRender } from "../utils/performance-instrumentation";
import { SystemDesignSemanticGlyph } from "./SystemDesignSemanticGlyph";
import { SystemDesignTechnologyMark } from "./SystemDesignTechnologyIcon";

export interface SystemDesignCanvasTheme {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  foreground: string;
  muted: string;
  accent: string;
  accentForeground: string;
  success: string;
  warning: string;
  danger: string;
}

interface SystemDesignNodeRendererProps {
  node: SystemDesignNode;
  selected: boolean;
  connecting: boolean;
  preview: boolean;
  theme: SystemDesignCanvasTheme;
  registerRef: (nodeId: string, group: Konva.Group | null) => void;
  onSelect: (
    nodeId: string,
    additive: boolean,
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void;
  onDragStart: (nodeId: string, group: Konva.Group) => void;
  onDragMove: (nodeId: string, group: Konva.Group) => void;
  onDragEnd: (nodeId: string, group: Konva.Group) => void;
  onResizeEnd: (
    nodeId: string,
    frame: { x: number; y: number; width: number; height: number },
  ) => void;
  onPortStart: (
    nodeId: string,
    port: SystemDesignPort,
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void;
  onPortEnd: (
    nodeId: string,
    port: SystemDesignPort,
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void;
  onOpenModule?: (nodeId: string) => void;
  onEditLabel?: (nodeId: string) => void;
  internalComponentCount?: number;
}

interface HierarchicalNodeFields {
  childDiagramId?: string;
  isExpandable?: boolean;
  isCollapsed?: boolean;
  internalComponentCount?: number;
}

function portPoint(
  node: SystemDesignNode,
  port: SystemDesignPort,
): { x: number; y: number } {
  switch (port) {
    case "top":
      return { x: node.width / 2, y: 0 };
    case "right":
      return { x: node.width, y: node.height / 2 };
    case "bottom":
      return { x: node.width / 2, y: node.height };
    case "left":
      return { x: 0, y: node.height / 2 };
  }
}

function parseInternalComponentCount(node: SystemDesignNode): number {
  const hierarchical = node as SystemDesignNode & HierarchicalNodeFields;
  if (
    typeof hierarchical.internalComponentCount === "number" &&
    Number.isFinite(hierarchical.internalComponentCount)
  ) {
    return Math.max(0, Math.floor(hierarchical.internalComponentCount));
  }

  const fromMetadata = node.metadata?.internalComponentCount;
  if (typeof fromMetadata === "string") {
    const parsed = Number.parseInt(fromMetadata, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

function SemanticSurface({
  chrome,
  node,
  theme,
  accent,
  softAccent,
}: {
  chrome: SystemDesignNodeChrome;
  node: SystemDesignNode;
  theme: SystemDesignCanvasTheme;
  accent: string;
  softAccent: string;
}) {
  const width = node.width;
  const height = node.height;
  const common = {
    fill: theme.surface,
    stroke: theme.border,
    strokeWidth: 1,
    perfectDrawEnabled: false,
  };

  switch (chrome) {
    case "identity":
      return (
        <>
          <Rect
            x={8}
            y={4}
            width={width - 16}
            height={height - 8}
            cornerRadius={Math.min(24, (height - 8) / 2)}
            {...common}
          />
          <Circle
            x={30}
            y={height / 2}
            radius={21}
            fill={softAccent}
            stroke={accent}
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "client":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={14}
            {...common}
          />
          <Rect
            x={7}
            y={7}
            width={width - 14}
            height={height - 14}
            cornerRadius={10}
            stroke={accent}
            strokeWidth={1}
            opacity={0.42}
            perfectDrawEnabled={false}
          />
          <Circle x={14} y={14} radius={2} fill={accent} />
          <Circle x={21} y={14} radius={2} fill={accent} opacity={0.62} />
        </>
      );
    case "network":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={Math.min(18, height / 3)}
            {...common}
          />
          <Line
            points={[8, height / 2, width - 8, height / 2]}
            stroke={accent}
            strokeWidth={1}
            opacity={0.24}
            dash={[3, 5]}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "gateway":
      return (
        <Line
          points={[
            12,
            0,
            width - 12,
            0,
            width,
            height / 2,
            width - 12,
            height,
            12,
            height,
            0,
            height / 2,
          ]}
          closed
          fill={theme.surface}
          stroke={accent}
          strokeWidth={1.25}
          perfectDrawEnabled={false}
        />
      );
    case "datastore":
      return (
        <>
          <Rect
            x={0}
            y={10}
            width={width}
            height={Math.max(1, height - 20)}
            fill={theme.surface}
            perfectDrawEnabled={false}
          />
          <Ellipse
            x={width / 2}
            y={10}
            radiusX={width / 2}
            radiusY={10}
            {...common}
          />
          <Ellipse
            x={width / 2}
            y={height - 10}
            radiusX={width / 2}
            radiusY={10}
            {...common}
          />
          <Line
            points={[0, 10, 0, height - 10]}
            stroke={theme.border}
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
          <Line
            points={[width, 10, width, height - 10]}
            stroke={theme.border}
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
          <Ellipse
            x={width / 2}
            y={10}
            radiusX={width / 2}
            radiusY={10}
            fill={softAccent}
            stroke={accent}
            strokeWidth={1}
            opacity={0.86}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "cache":
      return (
        <>
          <Rect
            x={4}
            y={4}
            width={width - 8}
            height={height - 8}
            cornerRadius={10}
            {...common}
          />
          {[12, 24, 36].map((y) => (
            <Line
              key={y}
              points={[0, y, 4, y, width - 4, y, width, y]}
              stroke={accent}
              strokeWidth={1}
              opacity={0.55}
              perfectDrawEnabled={false}
            />
          ))}
          <Rect
            x={9}
            y={9}
            width={width - 18}
            height={height - 18}
            cornerRadius={6}
            fill={softAccent}
            opacity={0.35}
            listening={false}
          />
        </>
      );
    case "object-storage":
      return (
        <>
          <Line
            points={[8, 7, width - 8, 7, width - 14, height - 5, 14, height - 5]}
            closed
            fill={theme.surface}
            stroke={theme.border}
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
          <Ellipse
            x={width / 2}
            y={8}
            radiusX={width / 2 - 8}
            radiusY={8}
            fill={softAccent}
            stroke={accent}
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "messaging":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={height / 2}
            {...common}
          />
          {[width - 38, width - 28, width - 18].map((x) => (
            <Circle
              key={x}
              x={x}
              y={height / 2}
              radius={2}
              fill={accent}
              opacity={0.72}
            />
          ))}
        </>
      );
    case "external":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={10}
            fill={theme.surface}
            stroke={accent}
            strokeWidth={1}
            dash={[6, 4]}
            perfectDrawEnabled={false}
          />
          <Rect
            x={5}
            y={5}
            width={width - 10}
            height={height - 10}
            cornerRadius={7}
            stroke={accent}
            strokeWidth={1}
            opacity={0.2}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "module":
      return (
        <>
          <Rect
            x={0}
            y={8}
            width={width}
            height={height - 8}
            cornerRadius={10}
            fill={theme.surface}
            stroke={accent}
            strokeWidth={1.25}
            perfectDrawEnabled={false}
          />
          <Line
            points={[12, 8, 22, 0, Math.min(74, width * 0.42), 0, Math.min(86, width * 0.49), 8]}
            closed
            fill={softAccent}
            stroke={accent}
            strokeWidth={1.25}
            perfectDrawEnabled={false}
          />
          <Rect
            x={7}
            y={15}
            width={width - 14}
            height={height - 22}
            cornerRadius={7}
            fill={softAccent}
            opacity={0.2}
            listening={false}
          />
        </>
      );
    case "boundary":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={8}
            fill={`${theme.surface}38`}
            stroke={accent}
            strokeWidth={1.25}
            dash={[8, 5]}
            perfectDrawEnabled={false}
          />
          <Rect
            x={5}
            y={5}
            width={width - 10}
            height={height - 10}
            cornerRadius={5}
            stroke={accent}
            strokeWidth={1}
            opacity={0.35}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "container":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={8}
            fill={`${theme.surface}70`}
            stroke={accent}
            strokeWidth={1.25}
            perfectDrawEnabled={false}
          />
          <Rect
            x={5}
            y={5}
            width={width - 10}
            height={24}
            cornerRadius={5}
            fill={softAccent}
            stroke={accent}
            strokeWidth={1}
            opacity={0.78}
            perfectDrawEnabled={false}
          />
          <Line
            points={[11, height - 9, width - 11, height - 9]}
            stroke={accent}
            strokeWidth={1}
            dash={[4, 4]}
            opacity={0.4}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "text":
      return (
        <Rect
          width={width}
          height={height}
          fill="transparent"
          stroke={theme.border}
          strokeWidth={1}
          dash={[3, 5]}
          opacity={0.3}
          perfectDrawEnabled={false}
        />
      );
    case "note":
      return (
        <>
          <Line
            points={[0, 0, width - 18, 0, width, 18, width, height, 0, height]}
            closed
            fill="#3d3610"
            stroke={accent}
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
          <Line
            points={[width - 18, 0, width - 18, 18, width, 18]}
            closed
            fill="#6b5d12"
            stroke={accent}
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "compute":
    default:
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={10}
            {...common}
          />
          <Line
            points={[5, 13, 5, height - 13]}
            stroke={accent}
            strokeWidth={4}
            lineCap="round"
            perfectDrawEnabled={false}
          />
        </>
      );
  }
}

function SystemDesignNodeRendererComponent({
  node,
  selected,
  connecting,
  preview,
  theme,
  registerRef,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onResizeEnd,
  onPortStart,
  onPortEnd,
  onOpenModule,
  onEditLabel,
  internalComponentCount: internalComponentCountOverride,
}: SystemDesignNodeRendererProps) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const staticVisualRef = useRef<Konva.Group | null>(null);
  const visual = getSystemDesignNodeVisual(node.type);
  const technology = resolveSystemDesignTechnology(node.technology);
  const technologyName = getSystemDesignTechnologyName(node.technology);
  const hierarchy = node as SystemDesignNode & HierarchicalNodeFields;
  const isExpandable =
    node.type === ("module" as SystemDesignNode["type"]) &&
    hierarchy.isExpandable !== false;
  const isCollapsed =
    node.type === ("module" as SystemDesignNode["type"]) &&
    hierarchy.isCollapsed === true;
  const internalCount =
    typeof internalComponentCountOverride === "number"
      ? Math.max(0, Math.floor(internalComponentCountOverride))
      : parseInternalComponentCount(node);
  const status = node.metadata?.status ?? node.metadata?.state;
  const ports: SystemDesignPort[] = ["top", "right", "bottom", "left"];
  const isAnnotation = visual.category === "annotations";
  const isConnectable =
    !isAnnotation &&
    node.type !== "system_boundary" &&
    node.type !== "container";
  const contentX = isAnnotation ? 12 : 54;
  const contentWidth = Math.max(
    36,
    node.width - contentX - (technology ? 34 : 12),
  );

  useEffect(() => {
    recordSystemDesignRender("node");
  });

  useEffect(() => {
    const visualGroup = staticVisualRef.current;
    if (!visualGroup) return;
    visualGroup.clearCache();
    visualGroup.cache({ pixelRatio: 1 });
    return () => {
      visualGroup.clearCache();
    };
  }, [
    node.description,
    node.height,
    node.isCollapsed,
    node.isExpandable,
    node.label,
    node.metadata,
    node.subtitle,
    node.technology,
    node.type,
    node.width,
    internalCount,
    isCollapsed,
    isExpandable,
    theme.border,
    theme.foreground,
    theme.muted,
    theme.surface,
    visual.accent,
    visual.chrome,
    visual.softAccent,
  ]);

  return (
    <Group
      id={`system-design-node-${node.id}`}
      name="system-design-node"
      ref={(group) => registerRef(node.id, group)}
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      draggable={!preview && !node.locked && !connecting}
      onClick={(event) =>
        !preview &&
        onSelect(
          node.id,
          event.evt.shiftKey,
          event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
        )
      }
      onTap={(event) =>
        !preview &&
        onSelect(
          node.id,
          false,
          event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
        )
      }
      onDblClick={(event) => {
        if (isExpandable && onOpenModule) {
          event.cancelBubble = true;
          onOpenModule(node.id);
        } else if (!preview && onEditLabel) {
          event.cancelBubble = true;
          onEditLabel(node.id);
        }
      }}
      onDblTap={(event) => {
        if (isExpandable && onOpenModule) {
          event.cancelBubble = true;
          onOpenModule(node.id);
        } else if (!preview && onEditLabel) {
          event.cancelBubble = true;
          onEditLabel(node.id);
        }
      }}
      onMouseEnter={(event) => {
        setHovered(true);
        event.target
          .getStage()
          ?.container()
          .style.setProperty(
            "cursor",
            isExpandable ? "pointer" : node.locked || preview ? "default" : "move",
          );
      }}
      onMouseLeave={(event) => {
        setHovered(false);
        event.target
          .getStage()
          ?.container()
          .style.setProperty("cursor", "default");
      }}
      onDragStart={(event) => {
        setDragging(true);
        onDragStart(node.id, event.target as Konva.Group);
      }}
      onDragMove={(event) => onDragMove(node.id, event.target as Konva.Group)}
      onDragEnd={(event) => {
        setDragging(false);
        onDragEnd(node.id, event.target as Konva.Group);
      }}
      onTransformEnd={(event) => {
        const group = event.target as Konva.Group;
        const width = Math.max(MIN_NODE_WIDTH, node.width * group.scaleX());
        const height = Math.max(
          MIN_NODE_HEIGHT,
          node.height * group.scaleY(),
        );
        group.scaleX(1);
        group.scaleY(1);
        onResizeEnd(node.id, {
          x: group.x(),
          y: group.y(),
          width,
          height,
        });
      }}
    >
      {!isAnnotation && (
        <Rect
          x={3}
          y={3}
          width={node.width - 6}
          height={node.height - 6}
          cornerRadius={12}
          fill={theme.surface}
          opacity={0.01}
          shadowColor="#000000"
          shadowBlur={dragging ? 0 : selected ? 16 : 7}
          shadowOpacity={dragging ? 0 : selected ? 0.36 : 0.2}
          shadowOffsetY={dragging ? 0 : 4}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}

      <Group ref={staticVisualRef}>
        <SemanticSurface
          chrome={visual.chrome}
          node={node}
          theme={theme}
          accent={visual.accent}
          softAccent={visual.softAccent}
        />

        {!isAnnotation && (
          <SystemDesignSemanticGlyph
            type={node.type}
            x={14}
            y={Math.max(12, node.height / 2 - 16)}
            size={32}
            color={visual.accent}
          />
        )}

        {node.type === ("text" as SystemDesignNode["type"]) ? (
          <Text
            x={8}
            y={8}
            width={node.width - 16}
            height={node.height - 16}
            text={node.label}
            fill={theme.foreground}
            fontFamily="Arial"
            fontSize={15}
            lineHeight={1.35}
            wrap="word"
            verticalAlign="middle"
            listening={false}
          />
        ) : node.type === ("note" as SystemDesignNode["type"]) ? (
          <>
            <Text
              x={12}
              y={12}
              width={node.width - 34}
              text={node.label}
              fill="#fef3c7"
              fontFamily="Arial"
              fontSize={14}
              fontStyle="bold"
              ellipsis
              wrap="none"
              listening={false}
            />
            <Text
              x={12}
              y={36}
              width={node.width - 24}
              height={Math.max(18, node.height - 46)}
              text={node.description ?? node.subtitle ?? ""}
              fill="#fde68a"
              fontFamily="Arial"
              fontSize={11}
              lineHeight={1.3}
              wrap="word"
              ellipsis
              listening={false}
            />
          </>
        ) : (
          <>
            <Text
              x={contentX}
              y={node.height > 78 ? 15 : 12}
              width={contentWidth}
              text={node.label}
              fill={theme.foreground}
              fontFamily="Arial"
              fontSize={14}
              fontStyle="bold"
              ellipsis
              wrap="none"
              listening={false}
            />
            {technologyName && (
              <Text
                x={contentX}
                y={node.subtitle ? 37 : node.height > 78 ? 41 : 35}
                width={contentWidth}
                text={technologyName}
                fill={technology?.color ?? visual.accent}
                fontFamily="Arial"
                fontSize={10}
                fontStyle={technology ? "bold" : "normal"}
                ellipsis
                wrap="none"
                listening={false}
              />
            )}
            {node.subtitle && (
              <Text
                x={contentX}
                y={technologyName ? 54 : node.height > 78 ? 41 : 35}
                width={contentWidth}
                text={node.subtitle}
                fill={theme.muted}
                fontFamily="Arial"
                fontSize={technologyName ? 9 : 11}
                ellipsis
                wrap="none"
                listening={false}
              />
            )}
            {technology && (
              <SystemDesignTechnologyMark
                technology={node.technology}
                x={node.width - 29}
                y={12}
                size={20}
              />
            )}
          </>
        )}

        {node.type === ("module" as SystemDesignNode["type"]) && (
          <>
            {!isCollapsed && node.description && (
              <Text
                x={contentX}
                y={node.height - 27}
                width={Math.max(40, node.width - contentX - 42)}
                text={node.description}
                fill={theme.muted}
                fontFamily="Arial"
                fontSize={9}
                ellipsis
                wrap="none"
                listening={false}
              />
            )}
            {isCollapsed ? (
              <>
                <Rect
                  x={contentX}
                  y={node.height - 34}
                  width={Math.max(72, node.width - contentX - 12)}
                  height={22}
                  cornerRadius={6}
                  fill={visual.softAccent}
                  stroke={visual.accent}
                  strokeWidth={1}
                  dash={[4, 3]}
                  listening={false}
                />
                <Text
                  x={contentX + 7}
                  y={node.height - 28}
                  width={Math.max(58, node.width - contentX - 26)}
                  text={`Collapsed subsystem · ${internalCount} component${
                    internalCount === 1 ? "" : "s"
                  }`}
                  fill={visual.accent}
                  fontFamily="Arial"
                  fontSize={9}
                  fontStyle="bold"
                  ellipsis
                  wrap="none"
                  listening={false}
                />
              </>
            ) : (
              <>
                <Rect
                  x={node.width - 40}
                  y={node.height - 29}
                  width={28}
                  height={18}
                  cornerRadius={9}
                  fill={visual.softAccent}
                  stroke={visual.accent}
                  strokeWidth={1}
                  listening={false}
                />
                <Text
                  x={node.width - 40}
                  y={node.height - 24}
                  width={28}
                  text={`${internalCount}`}
                  align="center"
                  fill={visual.accent}
                  fontFamily="Arial"
                  fontSize={9}
                  fontStyle="bold"
                  listening={false}
                />
              </>
            )}
            {isExpandable && (
              <>
                <Circle
                  x={node.width - 12}
                  y={12}
                  radius={9}
                  fill={visual.accent}
                  listening={false}
                />
                <Text
                  x={node.width - 21}
                  y={5}
                  width={18}
                  text="›"
                  rotation={-45}
                  align="center"
                  fill="#ffffff"
                  fontFamily="Arial"
                  fontSize={15}
                  fontStyle="bold"
                  listening={false}
                />
              </>
            )}
          </>
        )}

        {status && !isAnnotation && (
          <>
            <Circle
              x={contentX + 3}
              y={node.height - 12}
              radius={3}
              fill={
                /healthy|active|ready|online/i.test(status)
                  ? theme.success
                  : /warning|degraded/i.test(status)
                    ? theme.warning
                    : theme.muted
              }
              listening={false}
            />
            <Text
              x={contentX + 10}
              y={node.height - 16}
              width={Math.max(30, node.width - contentX - 18)}
              text={status}
              fill={theme.muted}
              fontFamily="Arial"
              fontSize={8}
              ellipsis
              wrap="none"
              listening={false}
            />
          </>
        )}
      </Group>

      {(selected || hovered) && (
        <Rect
          x={-3}
          y={-3}
          width={node.width + 6}
          height={node.height + 6}
          cornerRadius={13}
          stroke={selected ? theme.accent : visual.accent}
          strokeWidth={selected ? 2 : 1}
          opacity={selected ? 1 : 0.55}
          dash={visual.chrome === "boundary" ? [7, 4] : undefined}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}

      {node.locked && !preview && (
        <Text
          x={node.width - 23}
          y={node.height - 18}
          width={14}
          text="L"
          fill={theme.warning}
          fontFamily="Arial"
          fontSize={9}
          fontStyle="bold"
          align="center"
          listening={false}
        />
      )}

      {!preview &&
        isConnectable &&
        ports.map((port) => {
          const point = portPoint(node, port);
          return (
            <Circle
              key={port}
              name={`system-design-port-${port}`}
              x={point.x}
              y={point.y}
              radius={selected || hovered ? 6 : 4}
              fill={theme.background}
              stroke={selected || hovered ? theme.accent : theme.muted}
              strokeWidth={2}
              hitStrokeWidth={12}
              onMouseDown={(event) => {
                event.cancelBubble = true;
                onPortStart(
                  node.id,
                  port,
                  event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
                );
              }}
              onTouchStart={(event) => {
                event.cancelBubble = true;
                onPortStart(
                  node.id,
                  port,
                  event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
                );
              }}
              onMouseUp={(event) => {
                event.cancelBubble = true;
                onPortEnd(
                  node.id,
                  port,
                  event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
                );
              }}
              onTouchEnd={(event) => {
                event.cancelBubble = true;
                onPortEnd(
                  node.id,
                  port,
                  event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
                );
              }}
              onMouseEnter={(event) =>
                event.target
                  .getStage()
                  ?.container()
                  .style.setProperty("cursor", "crosshair")
              }
              onMouseLeave={(event) =>
                event.target
                  .getStage()
                  ?.container()
                  .style.setProperty("cursor", "default")
              }
            />
          );
        })}
    </Group>
  );
}

export const SystemDesignNodeRenderer = memo(
  SystemDesignNodeRendererComponent,
);
