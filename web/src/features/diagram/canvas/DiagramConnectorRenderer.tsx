"use client";

import { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import { Circle, Group, Label, Line, RegularPolygon, Tag, Text } from "react-konva";
import { connectorMidpoint, connectorPoints } from "../core/geometry";
import { recordDiagramRender } from "../core/performance";
import type { DiagramRegistry } from "../core/registry";
import type { DiagramArrowhead, DiagramConnectorElement, DiagramElement, DiagramPoint } from "../core/types";

export interface DiagramConnectorRendererHandle { refresh(): void }

interface Props {
  connector: DiagramConnectorElement;
  elements: ReadonlyMap<string, DiagramElement>;
  registry: DiagramRegistry;
  selected: boolean;
  resolveTemporaryPosition?: (elementId: string) => DiagramPoint | undefined;
  onSelect: (additive: boolean) => void;
}

function dash(connector: DiagramConnectorElement): number[] | undefined {
  if (connector.style?.dashPattern?.length) return connector.style.dashPattern;
  if (connector.style?.strokeStyle === "dashed") return [10, 6];
  if (connector.style?.strokeStyle === "dotted") return [2, 5];
  return undefined;
}

function EndpointArrow({ kind, point, neighbor, color }: { kind: DiagramArrowhead; point: DiagramPoint; neighbor: DiagramPoint; color: string }) {
  if (kind === "none") return null;
  const angle = Math.atan2(point.y - neighbor.y, point.x - neighbor.x);
  if (kind === "circle") return <Circle x={point.x} y={point.y} radius={5} fill={color} listening={false} />;
  if (kind === "diamond") return <RegularPolygon x={point.x} y={point.y} sides={4} radius={7} rotation={angle * 180 / Math.PI + 45} fill={color} listening={false} />;
  const length = 10;
  const spread = 0.48;
  const left = { x: point.x - Math.cos(angle - spread) * length, y: point.y - Math.sin(angle - spread) * length };
  const right = { x: point.x - Math.cos(angle + spread) * length, y: point.y - Math.sin(angle + spread) * length };
  return <Line points={[left.x, left.y, point.x, point.y, right.x, right.y]} closed={kind === "standard"} fill={kind === "standard" ? color : undefined} stroke={color} strokeWidth={2} lineJoin="round" listening={false} />;
}

export const DiagramConnectorRenderer = memo(forwardRef<DiagramConnectorRendererHandle, Props>(function DiagramConnectorRenderer({ connector, elements, registry, selected, resolveTemporaryPosition, onSelect }, ref) {
  recordDiagramRender("connector");
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<Konva.Group>(null);
  const resolvedElements = useMemo(() => {
    if (!resolveTemporaryPosition) return elements;
    const next = new Map(elements);
    for (const endpoint of [connector.source, connector.target]) {
      const element = next.get(endpoint.elementId);
      const position = resolveTemporaryPosition(endpoint.elementId);
      if (element && element.kind !== "connector" && position) next.set(element.id, { ...element, ...position });
    }
    return next;
  }, [connector.source, connector.target, elements, resolveTemporaryPosition]);
  const points = connectorPoints(connector, resolvedElements, registry);
  const flatPoints = points.flatMap((point) => [point.x, point.y]);
  const color = connector.style?.stroke ?? "#94a3b8";

  useImperativeHandle(ref, () => ({
    refresh: () => {
      const liveElements = new Map(elements);
      if (resolveTemporaryPosition) {
        for (const endpoint of [connector.source, connector.target]) {
          const element = liveElements.get(endpoint.elementId);
          const position = resolveTemporaryPosition(endpoint.elementId);
          if (element && element.kind !== "connector" && position) liveElements.set(element.id, { ...element, ...position });
        }
      }
      const livePoints = connectorPoints(connector, liveElements, registry).flatMap((point) => [point.x, point.y]);
      for (const node of groupRef.current?.find(".diagram-connector-path") ?? []) {
        if ("points" in node && typeof node.points === "function") node.points(livePoints);
      }
      groupRef.current?.getLayer()?.batchDraw();
    },
  }), [connector, elements, registry, resolveTemporaryPosition]);
  if (points.length < 2 || connector.visible === false) return null;
  const shared = {
    name: "diagram-connector-path",
    points: flatPoints,
    stroke: color,
    strokeWidth: connector.style?.strokeWidth ?? 2,
    opacity: connector.style?.opacity ?? 1,
    dash: dash(connector),
    tension: connector.routing === "curved" ? 0.45 : 0,
    hitStrokeWidth: 14,
    lineCap: "round" as const,
    lineJoin: "round" as const,
    onClick: (event: { evt: MouseEvent }) => onSelect(event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey),
    onTap: () => onSelect(false),
    onMouseEnter: (event: { target: Konva.Node }) => { setHovered(true); const stage = event.target.getStage(); if (stage) stage.container().style.cursor = "pointer"; },
    onMouseLeave: (event: { target: Konva.Node }) => { setHovered(false); const stage = event.target.getStage(); if (stage) stage.container().style.cursor = "default"; },
  };
  return (
    <Group ref={groupRef}>
      {selected || hovered ? <Line {...shared} stroke="#a78bfa" strokeWidth={(connector.style?.strokeWidth ?? 2) + (selected ? 5 : 3)} opacity={selected ? 0.25 : 0.14} listening={false} /> : null}
      <Line {...shared} />
      <EndpointArrow kind={connector.style?.startArrowhead ?? "none"} point={points[0]} neighbor={points[1]} color={color} />
      <EndpointArrow kind={connector.style?.endArrowhead ?? "standard"} point={points.at(-1)!} neighbor={points.at(-2)!} color={color} />
      {connector.labels.map((label) => {
        const point = connectorMidpoint(points, label.position);
        return <Label key={label.id} x={point.x} y={point.y} offsetX={30} offsetY={11} listening={false}><Tag fill={label.background ?? "#18181b"} cornerRadius={5} opacity={0.94} /><Text text={label.text} width={60} align="center" padding={5} fontSize={11} fill={label.color ?? "#e4e4e7"} /></Label>;
      })}
    </Group>
  );
}));
