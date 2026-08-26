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
import {
  isSystemDesignBoundaryNodeType,
  isSystemDesignModuleNodeType,
} from "../constants/system-design-palette";
import { getSystemDesignLineDash } from "../constants/system-design-edge-registry";
import type {
  SystemDesignNode,
  SystemDesignPort,
} from "../types/system-design.types";
import {
  MAX_ZOOM,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
} from "../utils/system-design-defaults";
import { recordSystemDesignRender } from "../utils/performance-instrumentation";
import { SystemDesignSemanticGlyph } from "./SystemDesignSemanticGlyph";
import { SystemDesignTechnologyMark } from "./SystemDesignTechnologyIcon";
import { SystemDesignAssetImage } from "./SystemDesignAssetImage";

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
  transformerOwnsSelection?: boolean;
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

function getBorderDash(
  style: SystemDesignNode["style"],
): number[] | undefined {
  switch (style?.borderStyle) {
    case "dashed":
      return [8, 5];
    case "dotted":
      return [2, 4];
    default:
      return undefined;
  }
}

function getKonvaFontStyle(node: SystemDesignNode): string {
  const styles = [
    node.textStyle?.fontWeight === "bold" ? "bold" : "",
    node.textStyle?.fontStyle === "italic" ? "italic" : "",
  ].filter(Boolean);
  return styles.join(" ") || "normal";
}

function clampFinite(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

const NOTE_NODE_TYPES = new Set<SystemDesignNode["type"]>([
  "note",
  "warning_note",
  "assumption_note",
]);

const FREEFORM_TEXT_NODE_TYPES = new Set<SystemDesignNode["type"]>([
  "text",
  "rectangle",
  "rounded_rectangle",
  "ellipse",
  "diamond",
  "callout",
  "divider",
  "label",
]);

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
  const fill = node.style?.fill ?? theme.surface;
  const borderStroke = node.style?.stroke ?? theme.border;
  const semanticStroke = node.style?.stroke ?? accent;
  const surfaceStrokeWidth = clampFinite(node.style?.strokeWidth, 0, 12, 1);
  const cornerRadius =
    node.style?.borderRadius === undefined
      ? undefined
      : clampFinite(node.style.borderRadius, 0, 100, 0);
  const styleDash = getBorderDash(node.style);
  const common = {
    fill,
    stroke: borderStroke,
    strokeWidth: surfaceStrokeWidth,
    dash: styleDash,
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
            cornerRadius={cornerRadius ?? Math.min(24, (height - 8) / 2)}
            {...common}
          />
          <Circle
            x={30}
            y={height / 2}
            radius={21}
            fill={softAccent}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
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
            cornerRadius={cornerRadius ?? 14}
            {...common}
          />
          <Rect
            x={7}
            y={7}
            width={width - 14}
            height={height - 14}
            cornerRadius={Math.max(0, (cornerRadius ?? 14) - 4)}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
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
            cornerRadius={cornerRadius ?? Math.min(18, height / 3)}
            {...common}
          />
          <Line
            points={[8, height / 2, width - 8, height / 2]}
            stroke={semanticStroke}
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
          fill={fill}
          stroke={semanticStroke}
          strokeWidth={surfaceStrokeWidth}
          dash={styleDash}
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
            fill={fill}
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
            stroke={borderStroke}
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
          <Line
            points={[width, 10, width, height - 10]}
            stroke={borderStroke}
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
          <Ellipse
            x={width / 2}
            y={10}
            radiusX={width / 2}
            radiusY={10}
            fill={softAccent}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
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
            cornerRadius={cornerRadius ?? 10}
            {...common}
          />
          {[12, 24, 36].map((y) => (
            <Line
              key={y}
              points={[0, y, 4, y, width - 4, y, width, y]}
              stroke={semanticStroke}
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
            fill={fill}
            stroke={borderStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash}
            perfectDrawEnabled={false}
          />
          <Ellipse
            x={width / 2}
            y={8}
            radiusX={width / 2 - 8}
            radiusY={8}
            fill={softAccent}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
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
            cornerRadius={cornerRadius ?? height / 2}
            {...common}
          />
          {[width - 38, width - 28, width - 18].map((x) => (
            <Circle
              key={x}
              x={x}
              y={height / 2}
              radius={2}
              fill={semanticStroke}
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
            cornerRadius={cornerRadius ?? 10}
            fill={fill}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash ?? [6, 4]}
            perfectDrawEnabled={false}
          />
          <Rect
            x={5}
            y={5}
            width={width - 10}
            height={height - 10}
            cornerRadius={7}
            stroke={semanticStroke}
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
            cornerRadius={cornerRadius ?? 10}
            fill={fill}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash}
            perfectDrawEnabled={false}
          />
          <Line
            points={[12, 8, 22, 0, Math.min(74, width * 0.42), 0, Math.min(86, width * 0.49), 8]}
            closed
            fill={softAccent}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash}
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
            cornerRadius={cornerRadius ?? 8}
            fill={fill}
            opacity={node.style?.fill ? 1 : 0.22}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash ?? [8, 5]}
            perfectDrawEnabled={false}
          />
          <Rect
            x={5}
            y={5}
            width={width - 10}
            height={height - 10}
            cornerRadius={Math.max(0, (cornerRadius ?? 8) - 3)}
            stroke={semanticStroke}
            strokeWidth={Math.min(1, surfaceStrokeWidth)}
            opacity={0.35}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "module-boundary":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={cornerRadius ?? 10}
            fill={fill}
            opacity={node.style?.fill ? 1 : 0.28}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash ?? [10, 4, 2, 4]}
            perfectDrawEnabled={false}
          />
          <Rect
            x={8}
            y={8}
            width={Math.max(48, width - 16)}
            height={30}
            cornerRadius={6}
            fill={softAccent}
            opacity={0.68}
            listening={false}
          />
        </>
      );
    case "vpc-boundary":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={cornerRadius ?? 18}
            fill={fill}
            opacity={node.style?.fill ? 1 : 0.2}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash ?? [12, 6]}
            perfectDrawEnabled={false}
          />
          <Rect
            x={8}
            y={8}
            width={width - 16}
            height={height - 16}
            cornerRadius={Math.max(0, (cornerRadius ?? 18) - 6)}
            stroke={semanticStroke}
            strokeWidth={1}
            dash={[2, 6]}
            opacity={0.42}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "region-boundary":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={cornerRadius ?? 12}
            fill={fill}
            opacity={node.style?.fill ? 1 : 0.18}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash}
            perfectDrawEnabled={false}
          />
          <Line
            points={[0, 42, width, 42]}
            stroke={semanticStroke}
            strokeWidth={1}
            opacity={0.45}
            perfectDrawEnabled={false}
          />
          {[width - 56, width - 40, width - 24].map((x) => (
            <Circle key={x} x={x} y={21} radius={3} fill={semanticStroke} opacity={0.7} />
          ))}
        </>
      );
    case "availability-zone-boundary":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={cornerRadius ?? 10}
            fill={fill}
            opacity={node.style?.fill ? 1 : 0.18}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash ?? [5, 5]}
            perfectDrawEnabled={false}
          />
          <Line
            points={[12, 38, width - 12, 38]}
            stroke={semanticStroke}
            strokeWidth={1}
            dash={[2, 4]}
            opacity={0.55}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "cluster-boundary":
      return (
        <>
          <Line
            points={[18, 0, width - 18, 0, width, 18, width, height - 18, width - 18, height, 18, height, 0, height - 18, 0, 18]}
            closed
            fill={fill}
            opacity={node.style?.fill ? 1 : 0.24}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash}
            perfectDrawEnabled={false}
          />
          {[width - 46, width - 31, width - 16].map((x) => (
            <Circle
              key={x}
              x={x}
              y={18}
              radius={4}
              stroke={semanticStroke}
              strokeWidth={1}
              opacity={0.7}
            />
          ))}
        </>
      );
    case "deployment-boundary":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={cornerRadius ?? 8}
            fill={fill}
            opacity={node.style?.fill ? 1 : 0.22}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash ?? [6, 4]}
            perfectDrawEnabled={false}
          />
          {[0, 1, 2].map((index) => (
            <Rect
              key={index}
              x={width - 74 + index * 18}
              y={12}
              width={12}
              height={12}
              cornerRadius={3}
              fill={softAccent}
              stroke={semanticStroke}
              strokeWidth={1}
              opacity={0.78}
            />
          ))}
        </>
      );
    case "swimlane":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={cornerRadius ?? 6}
            fill={fill}
            opacity={node.style?.fill ? 1 : 0.2}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash}
            perfectDrawEnabled={false}
          />
          <Rect
            width={Math.min(46, width * 0.18)}
            height={height}
            cornerRadius={[cornerRadius ?? 6, 0, 0, cornerRadius ?? 6]}
            fill={softAccent}
            opacity={0.65}
            listening={false}
          />
          <Line
            points={[Math.min(46, width * 0.18), 0, Math.min(46, width * 0.18), height]}
            stroke={semanticStroke}
            strokeWidth={1}
            opacity={0.65}
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
            cornerRadius={cornerRadius ?? 8}
            fill={fill}
            opacity={node.style?.fill ? 1 : 0.44}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash}
            perfectDrawEnabled={false}
          />
          <Rect
            x={5}
            y={5}
            width={width - 10}
            height={24}
            cornerRadius={5}
            fill={softAccent}
            stroke={semanticStroke}
            strokeWidth={1}
            opacity={0.78}
            perfectDrawEnabled={false}
          />
          <Line
            points={[11, height - 9, width - 11, height - 9]}
            stroke={semanticStroke}
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
          stroke={borderStroke}
          strokeWidth={surfaceStrokeWidth}
          dash={styleDash ?? [3, 5]}
          opacity={node.style?.stroke ? 1 : 0.3}
          perfectDrawEnabled={false}
        />
      );
    case "note":
      return (
        <>
          <Line
            points={[0, 0, width - 18, 0, width, 18, width, height, 0, height]}
            closed
            fill={node.style?.fill ?? "#3d3610"}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash}
            perfectDrawEnabled={false}
          />
          <Line
            points={[width - 18, 0, width - 18, 18, width, 18]}
            closed
            fill={node.style?.fill ?? "#6b5d12"}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "warning-note":
      return (
        <>
          <Line
            points={[0, 0, width - 18, 0, width, 18, width, height, 0, height]}
            closed
            fill={node.style?.fill ?? "#3f121d"}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash}
            perfectDrawEnabled={false}
          />
          <Rect width={6} height={height} fill={semanticStroke} opacity={0.9} />
          <Line
            points={[width - 18, 0, width - 18, 18, width, 18]}
            closed
            fill={softAccent}
            stroke={semanticStroke}
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
        </>
      );
    case "assumption-note":
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={cornerRadius ?? 12}
            fill={node.style?.fill ?? "#082f49"}
            stroke={semanticStroke}
            strokeWidth={surfaceStrokeWidth}
            dash={styleDash ?? [5, 3]}
            perfectDrawEnabled={false}
          />
          <Circle
            x={22}
            y={22}
            radius={11}
            fill={softAccent}
            stroke={semanticStroke}
            strokeWidth={1}
          />
        </>
      );
    case "rectangle":
      return (
        <Rect
          width={width}
          height={height}
          cornerRadius={cornerRadius ?? 0}
          {...common}
        />
      );
    case "rounded-rectangle":
      return (
        <Rect
          width={width}
          height={height}
          cornerRadius={cornerRadius ?? 18}
          fill={node.style?.fill ?? softAccent}
          stroke={semanticStroke}
          strokeWidth={surfaceStrokeWidth}
          dash={styleDash}
          perfectDrawEnabled={false}
        />
      );
    case "ellipse":
      return (
        <Ellipse
          x={width / 2}
          y={height / 2}
          radiusX={width / 2}
          radiusY={height / 2}
          fill={fill}
          stroke={semanticStroke}
          strokeWidth={surfaceStrokeWidth}
          dash={styleDash}
          perfectDrawEnabled={false}
        />
      );
    case "diamond":
      return (
        <Line
          points={[width / 2, 0, width, height / 2, width / 2, height, 0, height / 2]}
          closed
          fill={fill}
          stroke={semanticStroke}
          strokeWidth={surfaceStrokeWidth}
          dash={styleDash}
          perfectDrawEnabled={false}
        />
      );
    case "callout":
      return (
        <Line
          points={[0, 0, width, 0, width, height - 20, 44, height - 20, 24, height, 28, height - 20, 0, height - 20]}
          closed
          fill={fill}
          stroke={semanticStroke}
          strokeWidth={surfaceStrokeWidth}
          dash={styleDash}
          perfectDrawEnabled={false}
        />
      );
    case "divider":
      return (
        <Line
          points={[0, height / 2, width, height / 2]}
          stroke={semanticStroke}
          strokeWidth={Math.max(1, surfaceStrokeWidth)}
          dash={styleDash}
          lineCap="round"
          perfectDrawEnabled={false}
        />
      );
    case "label":
      return (
        <Rect
          width={width}
          height={height}
          cornerRadius={cornerRadius ?? Math.min(12, height / 2)}
          fill={node.style?.fill ?? softAccent}
          stroke={semanticStroke}
          strokeWidth={surfaceStrokeWidth}
          dash={styleDash}
          perfectDrawEnabled={false}
        />
      );
    case "image":
      return null;
    case "compute":
    default:
      return (
        <>
          <Rect
            width={width}
            height={height}
            cornerRadius={cornerRadius ?? 10}
            {...common}
          />
          <Line
            points={[5, 13, 5, height - 13]}
            stroke={semanticStroke}
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
  transformerOwnsSelection = false,
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
  const isModule = isSystemDesignModuleNodeType(node.type);
  const isExpandable =
    isModule && hierarchy.isExpandable !== false;
  const isCollapsed =
    isModule && hierarchy.isCollapsed === true;
  const internalCount =
    typeof internalComponentCountOverride === "number"
      ? Math.max(0, Math.floor(internalComponentCountOverride))
      : parseInternalComponentCount(node);
  const status = node.metadata?.status ?? node.metadata?.state;
  const ports: SystemDesignPort[] = ["top", "right", "bottom", "left"];
  const isAnnotation = visual.category === "annotations";
  const isStructuralContainer = isSystemDesignBoundaryNodeType(node.type);
  const isConnectable = !isAnnotation && !isStructuralContainer;
  const isNote = NOTE_NODE_TYPES.has(node.type);
  const isFreeformText = FREEFORM_TEXT_NODE_TYPES.has(node.type);
  const textColor = node.textStyle?.color ?? theme.foreground;
  const fontFamily = node.textStyle?.fontFamily ?? "Arial";
  const fontSize = clampFinite(node.textStyle?.fontSize, 8, 72, 14);
  const lineHeight = clampFinite(node.textStyle?.lineHeight, 0.8, 3, 1.3);
  const textPadding = clampFinite(node.textStyle?.padding, 0, 64, 8);
  const nodeOpacity = clampFinite(node.style?.opacity, 0, 1, 1);
  const freehandDash = node.drawing
    ? getSystemDesignLineDash(
        node.drawing.lineStyle ?? "solid",
        node.drawing.strokeWidth,
        node.drawing.dashPattern,
      )
    : undefined;
  const freehandAnimationMode =
    node.drawing?.animationMode ?? "moving_dash";
  const freehandMotionDash = node.drawing
    ? freehandAnimationMode === "moving_dots"
      ? [1, 11]
      : freehandAnimationMode === "moving_dash"
        ? freehandDash ?? [
            node.drawing.strokeWidth * 5,
            node.drawing.strokeWidth * 3,
          ]
        : undefined
    : undefined;
  const fontStyle = getKonvaFontStyle(node);
  const semanticLabelFontStyle =
    node.textStyle?.fontWeight || node.textStyle?.fontStyle
      ? fontStyle
      : "bold";
  const textDecoration = node.textStyle?.textDecoration ?? "none";
  const textAlign = node.textStyle?.align ?? (isAnnotation ? "center" : "left");
  const textVerticalAlign = node.textStyle?.verticalAlign ?? "middle";
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
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    visualGroup.cache({
      pixelRatio: Math.min(3, devicePixelRatio * MAX_ZOOM),
    });
    return () => {
      visualGroup.clearCache();
    };
  }, [
    node.height,
    node.style?.borderRadius,
    node.style?.borderStyle,
    node.style?.fill,
    node.style?.opacity,
    node.style?.stroke,
    node.style?.strokeWidth,
    node.type,
    node.width,
    theme.border,
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
      <Rect
        name="system-design-node-hit-target"
        width={node.width}
        height={node.height}
        fill="transparent"
        perfectDrawEnabled={false}
      />

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
          shadowBlur={dragging ? 0 : 7}
          shadowOpacity={dragging ? 0 : 0.2}
          shadowOffsetY={dragging ? 0 : 4}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}

      {node.type !== "image" && node.type !== "freehand" && (
        <Group
          ref={staticVisualRef}
          listening={false}
          opacity={nodeOpacity}
        >
          <SemanticSurface
            chrome={visual.chrome}
            node={node}
            theme={theme}
            accent={visual.accent}
            softAccent={visual.softAccent}
          />
        </Group>
      )}

      {node.type === "freehand" && node.drawing && (
        <>
          <Line
            points={node.drawing.points}
            stroke={node.drawing.stroke}
            strokeWidth={node.drawing.strokeWidth}
            opacity={node.drawing.opacity ?? 1}
            dash={freehandDash}
            lineCap="round"
            lineJoin="round"
            tension={0.35}
            listening={false}
            perfectDrawEnabled={false}
          />
          {freehandAnimationMode !== "none" && (
            <Line
              name="system-design-freehand-motion"
              points={node.drawing.points}
              stroke={node.drawing.stroke}
              strokeWidth={node.drawing.strokeWidth + 1}
              opacity={
                (freehandAnimationMode === "flow_pulse" ? 0.3 : 0.85) *
                (node.drawing.opacity ?? 1)
              }
              dash={freehandMotionDash}
              lineCap="round"
              lineJoin="round"
              tension={0.35}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
        </>
      )}

      <Group opacity={nodeOpacity} visible={node.type !== "freehand"}>
      {!isAnnotation && (
        <SystemDesignSemanticGlyph
          type={node.type}
          x={14}
          y={isStructuralContainer ? 6 : Math.max(12, node.height / 2 - 16)}
          size={32}
          color={visual.accent}
        />
      )}

      {node.type === "image" ? null : isFreeformText ? (
          <Text
            x={node.type === "diamond" ? 14 : 0}
            y={0}
            width={
              node.width -
              (node.type === "diamond" ? 28 : 0)
            }
            height={
              node.height -
              (node.type === "callout" ? 20 : 0)
            }
            text={node.label}
            fill={textColor}
            fontFamily={fontFamily}
            fontSize={fontSize}
            fontStyle={fontStyle}
            textDecoration={textDecoration}
            align={textAlign}
            lineHeight={lineHeight}
            padding={textPadding}
            wrap="word"
            verticalAlign={textVerticalAlign}
            listening={false}
          />
        ) : isNote ? (
          <>
            <Text
              x={node.type === "warning_note" ? 16 : 12}
              y={12}
              width={node.width - (node.type === "warning_note" ? 40 : 34)}
              text={node.label}
              fill={node.textStyle?.color ?? visual.accent}
              fontFamily={fontFamily}
              fontSize={fontSize}
              fontStyle={semanticLabelFontStyle}
              textDecoration={textDecoration}
              align={node.textStyle?.align ?? "left"}
              lineHeight={lineHeight}
              ellipsis
              wrap="none"
              listening={false}
            />
            <Text
              x={node.type === "warning_note" ? 16 : 12}
              y={36}
              width={node.width - (node.type === "warning_note" ? 28 : 24)}
              height={Math.max(18, node.height - 46)}
              text={node.description ?? node.subtitle ?? ""}
              fill={node.textStyle?.color ?? theme.foreground}
              fontFamily={fontFamily}
              fontSize={Math.max(9, fontSize - 2)}
              fontStyle={fontStyle}
              textDecoration={textDecoration}
              align={node.textStyle?.align ?? "left"}
              verticalAlign={textVerticalAlign}
              lineHeight={lineHeight}
              padding={Math.min(textPadding, 12)}
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
              fill={textColor}
              fontFamily={fontFamily}
              fontSize={fontSize}
              fontStyle={semanticLabelFontStyle}
              textDecoration={textDecoration}
              align={textAlign}
              lineHeight={lineHeight}
              padding={Math.min(textPadding, 10)}
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
                fontFamily={fontFamily}
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
                fontFamily={fontFamily}
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
                y={isModule ? 36 : 12}
                size={20}
              />
            )}
          </>
        )}

        {isModule && (
          <>
            {!isCollapsed && node.description && (
              <Text
                x={contentX}
                y={node.height - (status ? 43 : 27)}
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

        {node.type === "image" && node.asset && (
          <SystemDesignAssetImage
            asset={node.asset}
            x={0}
            y={0}
            width={node.width}
            height={node.height}
          />
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
              width={Math.max(
                30,
                node.width - contentX - (isModule ? 52 : 18),
              )}
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

      {hovered && isExpandable && !dragging && (
        <Group x={10} y={-34} listening={false}>
          <Rect
            width={126}
            height={26}
            cornerRadius={7}
            fill={theme.surface}
            stroke={theme.border}
            strokeWidth={1}
            shadowColor="#000000"
            shadowBlur={6}
            shadowOpacity={0.2}
            shadowOffsetY={2}
            perfectDrawEnabled={false}
          />
          <Text
            x={8}
            y={7}
            width={110}
            text="Double-click to open"
            align="center"
            fill={visual.accent}
            fontFamily="Arial"
            fontSize={10}
            fontStyle="bold"
            listening={false}
          />
        </Group>
      )}

      {((hovered && !selected) ||
        (selected && !transformerOwnsSelection)) && (
        <Rect
          x={-3}
          y={-3}
          width={node.width + 6}
          height={node.height + 6}
          cornerRadius={13}
          stroke={selected ? theme.accent : visual.accent}
          strokeWidth={selected ? 2 : 1}
          opacity={selected ? 1 : 0.55}
          dash={isStructuralContainer ? [7, 4] : undefined}
          strokeScaleEnabled={false}
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
              strokeScaleEnabled={false}
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
