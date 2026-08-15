"use client";

import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react";
import type Konva from "konva";
import { Circle, Group, Label, Line, Rect, RegularPolygon, Tag, Text } from "react-konva";
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
  onEndpointPointerDown: (endpoint: "source" | "target", event: Konva.KonvaEventObject<PointerEvent>) => void;
  onCommitWaypoints: (waypoints: DiagramPoint[]) => void;
  onAddWaypoint: (point: DiagramPoint) => void;
  onRemoveWaypoint: (index: number) => void;
  onEditLabel: (point: DiagramPoint) => void;
  onContextMenu: (event: Konva.KonvaEventObject<PointerEvent>) => void;
}

function dash(connector: DiagramConnectorElement): number[] | undefined {
  if (connector.style?.dashPattern?.length) return connector.style.dashPattern;
  if (connector.style?.strokeStyle === "dashed") return [10, 6];
  if (connector.style?.strokeStyle === "dotted") return [2, 5];
  return undefined;
}

function arrowRotation(point: DiagramPoint, neighbor: DiagramPoint): number {
  return Math.atan2(point.y - neighbor.y, point.x - neighbor.x) * 180 / Math.PI;
}

function EndpointArrow({ kind, point, neighbor, color, nodeRef, name }: {
  kind: DiagramArrowhead;
  point: DiagramPoint;
  neighbor: DiagramPoint;
  color: string;
  nodeRef: RefObject<Konva.Group | null>;
  name: string;
}) {
  if (kind === "none") return null;
  return (
    <Group ref={nodeRef} name={name} x={point.x} y={point.y} rotation={arrowRotation(point, neighbor)} listening={false}>
      {kind === "circle" ? <Circle radius={5} fill={color} /> : null}
      {kind === "diamond" ? <RegularPolygon sides={4} radius={7} rotation={45} fill={color} /> : null}
      {kind === "one" ? <Line points={[-5, -7, -5, 7]} stroke={color} strokeWidth={2} /> : null}
      {kind === "many" ? <><Line points={[-10, -7, 0, 0, -10, 7]} stroke={color} strokeWidth={2} /><Line points={[-10, 0, 0, 0]} stroke={color} strokeWidth={2} /></> : null}
      {kind === "standard" || kind === "open" ? <Line points={[-10, -5, 0, 0, -10, 5]} closed={kind === "standard"} fill={kind === "standard" ? color : undefined} stroke={color} strokeWidth={2} lineJoin="round" /> : null}
    </Group>
  );
}

function pointerInDiagram(event: Konva.KonvaEventObject<MouseEvent>): DiagramPoint {
  return event.target.getStage()?.getRelativePointerPosition() ?? { x: 0, y: 0 };
}

export const DiagramConnectorRenderer = memo(forwardRef<DiagramConnectorRendererHandle, Props>(function DiagramConnectorRenderer({
  connector,
  elements,
  registry,
  selected,
  resolveTemporaryPosition,
  onSelect,
  onEndpointPointerDown,
  onCommitWaypoints,
  onAddWaypoint,
  onRemoveWaypoint,
  onEditLabel,
  onContextMenu,
}, ref) {
  recordDiagramRender("connector");
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<Konva.Group>(null);
  const startArrowRef = useRef<Konva.Group>(null);
  const endArrowRef = useRef<Konva.Group>(null);
  const labelRefs = useRef(new Map<string, Konva.Label>());
  const waypointRefs = useRef(new Map<number, Konva.Circle>());
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
  const color = connector.style?.stroke ?? "#94a3b8";

  const applyGeometry = useCallback((nextPoints: readonly DiagramPoint[]) => {
    const flat = nextPoints.flatMap((point) => [point.x, point.y]);
    for (const node of groupRef.current?.find(".diagram-connector-path") ?? []) {
      if ("points" in node && typeof node.points === "function") node.points(flat);
    }
    const start = nextPoints[0];
    const second = nextPoints[1];
    const end = nextPoints.at(-1);
    const penultimate = nextPoints.at(-2);
    if (start && second && startArrowRef.current) {
      startArrowRef.current.position(start);
      startArrowRef.current.rotation(arrowRotation(start, second));
    }
    if (end && penultimate && endArrowRef.current) {
      endArrowRef.current.position(end);
      endArrowRef.current.rotation(arrowRotation(end, penultimate));
    }
    for (const label of connector.labels) {
      labelRefs.current.get(label.id)?.position(connectorMidpoint(nextPoints, label.position));
    }
    groupRef.current?.getLayer()?.batchDraw();
  }, [connector.labels]);

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
      applyGeometry(connectorPoints(connector, liveElements, registry));
    },
  }), [applyGeometry, connector, elements, registry, resolveTemporaryPosition]);

  if (points.length < 2 || connector.visible === false) return null;
  const flatPoints = points.flatMap((point) => [point.x, point.y]);
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
    onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.cancelBubble = true;
      onSelect(event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey);
    },
    onTap: (event: Konva.KonvaEventObject<TouchEvent>) => { event.cancelBubble = true; onSelect(false); },
    onDblClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.cancelBubble = true;
      const point = pointerInDiagram(event);
      if (event.evt.altKey) onAddWaypoint(point);
      else onEditLabel(point);
    },
    onContextMenu: (event: Konva.KonvaEventObject<PointerEvent>) => {
      event.cancelBubble = true;
      onContextMenu(event);
    },
    onMouseEnter: (event: Konva.KonvaEventObject<MouseEvent>) => { setHovered(true); const stage = event.target.getStage(); if (stage) stage.container().style.cursor = "pointer"; },
    onMouseLeave: (event: Konva.KonvaEventObject<MouseEvent>) => { setHovered(false); const stage = event.target.getStage(); if (stage) stage.container().style.cursor = "default"; },
  };
  return (
    <Group ref={groupRef}>
      {selected || hovered ? <Line {...shared} stroke="#a78bfa" strokeWidth={(connector.style?.strokeWidth ?? 2) + (selected ? 5 : 3)} opacity={selected ? 0.25 : 0.14} listening={false} /> : null}
      <Line {...shared} />
      <EndpointArrow nodeRef={startArrowRef} name="diagram-start-arrow" kind={connector.style?.startArrowhead ?? "none"} point={points[0]} neighbor={points[1]} color={color} />
      <EndpointArrow nodeRef={endArrowRef} name="diagram-end-arrow" kind={connector.style?.endArrowhead ?? "standard"} point={points.at(-1)!} neighbor={points.at(-2)!} color={color} />
      {connector.labels.map((label) => {
        const point = connectorMidpoint(points, label.position);
        return <Label key={label.id} ref={(node) => { if (node) labelRefs.current.set(label.id, node); else labelRefs.current.delete(label.id); }} x={point.x} y={point.y} offsetX={45} offsetY={12} onDblClick={(event) => { event.cancelBubble = true; onEditLabel(point); }}><Tag fill={label.background ?? "#18181b"} stroke="#3f3f46" strokeWidth={0.75} cornerRadius={5} opacity={0.96} /><Text text={label.text} width={90} align="center" padding={5} fontSize={11} fill={label.color ?? "#e4e4e7"} /></Label>;
      })}
      {selected && !connector.locked ? (
        <>
          <Circle x={points[0].x} y={points[0].y} radius={6} fill="#fafafa" stroke="#8b5cf6" strokeWidth={2} onPointerDown={(event) => { event.cancelBubble = true; onEndpointPointerDown("source", event); }} />
          <Circle x={points.at(-1)!.x} y={points.at(-1)!.y} radius={6} fill="#fafafa" stroke="#8b5cf6" strokeWidth={2} onPointerDown={(event) => { event.cancelBubble = true; onEndpointPointerDown("target", event); }} />
          {connector.waypoints.map((waypoint, index) => <Circle
            key={`waypoint-${index}`}
            ref={(node) => { if (node) waypointRefs.current.set(index, node); else waypointRefs.current.delete(index); }}
            x={waypoint.x}
            y={waypoint.y}
            radius={5}
            fill="#18181b"
            stroke="#c4b5fd"
            strokeWidth={1.5}
            draggable
            onDragMove={() => {
              const waypoints = connector.waypoints.map((point, waypointIndex) => waypointRefs.current.get(waypointIndex)?.position() ?? point);
              applyGeometry(connectorPoints({ ...connector, waypoints }, elements, registry));
            }}
            onDragEnd={() => onCommitWaypoints(connector.waypoints.map((point, waypointIndex) => waypointRefs.current.get(waypointIndex)?.position() ?? point))}
            onDblClick={(event) => { event.cancelBubble = true; onRemoveWaypoint(index); }}
            onContextMenu={(event) => { event.evt.preventDefault(); event.cancelBubble = true; onRemoveWaypoint(index); }}
          />)}
          {connector.waypoints.length === 0 && connector.routing === "orthogonal" ? connectorPoints(connector, elements, registry).slice(1, -1).map((bend, index) => <Rect key={`generated-bend-${index}`} x={bend.x - 3} y={bend.y - 3} width={6} height={6} fill="#18181b" stroke="#71717a" listening={false} />) : null}
        </>
      ) : null}
    </Group>
  );
}));
