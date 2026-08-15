"use client";

import { createElement, forwardRef, memo, useEffect, useMemo, useState } from "react";
import type Konva from "konva";
import { Circle, Group, Image as KonvaImage, Rect, Text } from "react-konva";
import type { DiagramRegistry } from "../core/registry";
import { recordDiagramRender } from "../core/performance";
import type { DiagramImageElement, DiagramPositionedElement, DiagramShapeElement } from "../core/types";

interface Props {
  element: DiagramPositionedElement;
  registry: DiagramRegistry;
  selected: boolean;
  connecting: boolean;
  showPorts: boolean;
  onSelect: (additive: boolean) => void;
  onOpenChildPage: () => void;
  onEditLabel: () => void;
  onDragStart: (group: Konva.Group) => void;
  onDragMove: (group: Konva.Group) => void;
  onDragEnd: (group: Konva.Group) => void;
  highlightedPortId?: string;
  onPortPointerDown: (portId: string, event: Konva.KonvaEventObject<PointerEvent>) => void;
  onContextMenu: (event: Konva.KonvaEventObject<PointerEvent>) => void;
}

function useDiagramImage(element: DiagramImageElement): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const source = useMemo(() => element.asset.kind === "raster" ? element.asset.dataUrl : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.asset.svg)}`, [element.asset]);
  useEffect(() => {
    const next = new Image();
    next.onload = () => setImage(next);
    next.src = source;
    return () => { next.onload = null; };
  }, [source]);
  return image;
}

function labelOf(element: DiagramPositionedElement): string {
  if (element.kind === "shape" || element.kind === "frame") return element.label;
  if (element.kind === "text") return element.text;
  return element.label ?? "";
}

const ShapeVisual = memo(function ShapeVisual({ element, registry, selected }: { element: DiagramShapeElement; registry: DiagramRegistry; selected: boolean }) {
  const definition = registry.getShape(element.shapeDefinitionId);
  if (!definition) return <Rect width={element.width} height={element.height} fill="#27272a" stroke="#ef4444" dash={[5, 4]} />;
  const Renderer = registry.resolveRenderer(definition);
  return createElement(Renderer, { element, definition, selected, color: element.style?.stroke ?? "#a78bfa" });
});

const ImageVisual = memo(function ImageVisual({ element }: { element: DiagramImageElement }) {
  const image = useDiagramImage(element);
  if (!image) return <Rect width={element.width} height={element.height} fill="transparent" />;
  const scale = Math.min(
    element.width / element.asset.intrinsicWidth,
    element.height / element.asset.intrinsicHeight,
  );
  const width = element.asset.intrinsicWidth * scale;
  const height = element.asset.intrinsicHeight * scale;
  return <KonvaImage image={image} x={(element.width - width) / 2} y={(element.height - height) / 2} width={width} height={height} />;
});

export const DiagramShapeRenderer = memo(forwardRef<Konva.Group, Props>(function DiagramShapeRenderer({ element, registry, selected, connecting, showPorts, onSelect, onOpenChildPage, onEditLabel, onDragStart, onDragMove, onDragEnd, highlightedPortId, onPortPointerDown, onContextMenu }, ref) {
  recordDiagramRender("shape");
  const [hovered, setHovered] = useState(false);
  if (!element.visible) return null;
  const definition = element.kind === "shape" ? registry.getShape(element.shapeDefinitionId) : undefined;
  const ports = definition?.ports ?? [];
  const textStyle = "textStyle" in element ? element.textStyle : undefined;
  const label = labelOf(element);
  const labelPadding = textStyle?.padding ?? 10;
  return (
    <Group
      ref={ref}
      id={element.id}
      name="diagram-element"
      x={element.x + element.width / 2}
      y={element.y + element.height / 2}
      width={element.width}
      height={element.height}
      rotation={element.rotation}
      draggable={!element.locked}
      onClick={(event) => { event.cancelBubble = true; onSelect(event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey); }}
      onTap={(event) => { event.cancelBubble = true; onSelect(false); }}
      onDblClick={(event) => { event.cancelBubble = true; if ((element.kind === "shape" || element.kind === "frame") && element.childPageId) onOpenChildPage(); else onEditLabel(); }}
      onDblTap={(event) => { event.cancelBubble = true; if ((element.kind === "shape" || element.kind === "frame") && element.childPageId) onOpenChildPage(); else onEditLabel(); }}
      onContextMenu={(event) => { event.cancelBubble = true; onContextMenu(event); }}
      onDragStart={(event) => onDragStart(event.target as Konva.Group)}
      onDragMove={(event) => onDragMove(event.target as Konva.Group)}
      onDragEnd={(event) => onDragEnd(event.target as Konva.Group)}
      onMouseEnter={(event) => { setHovered(true); const stage = event.target.getStage(); if (stage) stage.container().style.cursor = element.locked ? "default" : "move"; }}
      onMouseLeave={(event) => { setHovered(false); const stage = event.target.getStage(); if (stage) stage.container().style.cursor = "default"; }}
    >
      <Group x={-element.width / 2} y={-element.height / 2} opacity={element.style?.opacity ?? 1}>
        <Rect width={element.width} height={element.height} fill="transparent" listening />
        {element.kind === "shape" ? <ShapeVisual element={element} registry={registry} selected={selected} /> : null}
        {element.kind === "image" ? <ImageVisual element={element} /> : null}
        {element.kind === "frame" || element.kind === "group" ? <Rect width={element.width} height={element.height} fill={element.style?.fill ?? "transparent"} stroke={element.style?.stroke ?? "#71717a"} strokeWidth={element.style?.strokeWidth ?? 1.5} dash={[8, 5]} cornerRadius={element.style?.cornerRadius ?? 10} /> : null}
        {label && element.kind !== "image" && !definition?.rendersOwnLabel ? <Text x={labelPadding} y={labelPadding} width={Math.max(1, element.width - labelPadding * 2)} height={Math.max(1, element.height - labelPadding * 2)} text={label} fill={textStyle?.color ?? "#f4f4f5"} fontFamily={textStyle?.fontFamily ?? "Inter, Arial, sans-serif"} fontSize={textStyle?.fontSize ?? 13} fontStyle={`${textStyle?.fontWeight === "bold" || textStyle?.fontWeight === "semibold" ? "bold" : "normal"}${textStyle?.italic ? " italic" : ""}`} align={textStyle?.align ?? "center"} verticalAlign={textStyle?.verticalAlign ?? "middle"} lineHeight={textStyle?.lineHeight ?? 1.2} textDecoration={textStyle?.underline ? "underline" : undefined} listening={false} /> : null}
        {hovered && !selected ? <Rect width={element.width} height={element.height} stroke="#a78bfa" strokeWidth={1} opacity={0.7} cornerRadius={element.style?.cornerRadius ?? 4} shadowColor="#a78bfa" shadowBlur={5} listening={false} /> : null}
        {selected ? <Rect width={element.width} height={element.height} stroke="#a78bfa" strokeWidth={1.5} dash={element.locked ? [4, 3] : undefined} cornerRadius={element.style?.cornerRadius ?? 4} listening={false} /> : null}
        {showPorts || hovered ? ports.map((port) => {
          const offset = port.offset ?? 0.5;
          const point = port.side === "top" ? { x: element.width * offset, y: 0 } : port.side === "right" ? { x: element.width, y: element.height * offset } : port.side === "bottom" ? { x: element.width * offset, y: element.height } : { x: 0, y: element.height * offset };
          const highlighted = highlightedPortId === port.id;
          return <Circle key={port.id} x={point.x} y={point.y} radius={highlighted ? 6 : 4} fill={highlighted ? "#86efac" : connecting ? "#fef3c7" : "#fafafa"} stroke={highlighted ? "#22c55e" : connecting ? "#f59e0b" : "#8b5cf6"} strokeWidth={highlighted ? 2 : 1.5} hitStrokeWidth={14} onPointerDown={(event) => { event.cancelBubble = true; onPortPointerDown(port.id, event); }} onMouseEnter={(event) => { event.cancelBubble = true; const stage = event.target.getStage(); if (stage) stage.container().style.cursor = "crosshair"; }} onMouseLeave={(event) => { event.cancelBubble = true; const stage = event.target.getStage(); if (stage) stage.container().style.cursor = "default"; }} />;
        }) : null}
      </Group>
    </Group>
  );
}));
