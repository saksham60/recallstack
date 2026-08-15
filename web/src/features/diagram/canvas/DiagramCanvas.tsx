"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import { Layer, Line, Rect, Stage, Transformer } from "react-konva";
import { Crosshair, Maximize2, Minus, Plus, Shapes } from "lucide-react";
import { connectorPoints, fitViewport, positionedBounds, rectContainsRect, resolvePortPoint, snapValue } from "../core/geometry";
import { recordDiagramRender } from "../core/performance";
import type { DiagramRegistry } from "../core/registry";
import { createDiagramConnector, type DiagramElementPatch, type DiagramElementTransform } from "../core/state";
import type { DiagramConnectorElement, DiagramConnectorEndpoint, DiagramEditorTool, DiagramPage, DiagramPoint, DiagramPositionedElement, DiagramRect, DiagramViewport } from "../core/types";
import { isDiagramConnectorElement, isDiagramPositionedElement } from "../core/types";
import { DiagramConnectorRenderer, type DiagramConnectorRendererHandle } from "./DiagramConnectorRenderer";
import { DiagramShapeRenderer } from "./DiagramShapeRenderer";
import { DiagramMinimap } from "./DiagramMinimap";

export const DIAGRAM_SHAPE_MIME = "application/x-recallstack-diagram-shape";
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

interface ConnectionGesture {
  kind: "create" | "reattach";
  fixedPoint: DiagramPoint;
  blockedElementId: string;
  source?: DiagramConnectorEndpoint;
  connectorId?: string;
  endpoint?: "source" | "target";
}

function nearestSegmentIndex(points: readonly DiagramPoint[], point: DiagramPoint): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const projection = { x: start.x + dx * ratio, y: start.y + dy * ratio };
    const distance = Math.hypot(point.x - projection.x, point.y - projection.y);
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  }
  return bestIndex;
}

interface AlignmentSnap {
  dx: number;
  dy: number;
  vertical?: number;
  horizontal?: number;
}

function alignmentSnap(
  moving: DiagramRect,
  others: readonly DiagramPositionedElement[],
  threshold: number,
): AlignmentSnap {
  const xAnchors = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const yAnchors = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];
  let xMatch: { delta: number; guide: number } | undefined;
  let yMatch: { delta: number; guide: number } | undefined;
  for (const other of others) {
    const otherX = [other.x, other.x + other.width / 2, other.x + other.width];
    const otherY = [other.y, other.y + other.height / 2, other.y + other.height];
    for (const source of xAnchors) for (const target of otherX) {
      const delta = target - source;
      if (Math.abs(delta) <= threshold && (!xMatch || Math.abs(delta) < Math.abs(xMatch.delta))) xMatch = { delta, guide: target };
    }
    for (const source of yAnchors) for (const target of otherY) {
      const delta = target - source;
      if (Math.abs(delta) <= threshold && (!yMatch || Math.abs(delta) < Math.abs(yMatch.delta))) yMatch = { delta, guide: target };
    }
  }
  return { dx: xMatch?.delta ?? 0, dy: yMatch?.delta ?? 0, vertical: xMatch?.guide, horizontal: yMatch?.guide };
}

interface Props {
  page: DiagramPage;
  registry: DiagramRegistry;
  selectedElementIds: readonly string[];
  tool?: DiagramEditorTool;
  gridSize?: number;
  showGrid?: boolean;
  snapToGrid?: boolean;
  onSelect: (elementIds: string[], additive: boolean) => void;
  onClearSelection: () => void;
  onMoveElements: (positions: Readonly<Record<string, DiagramPoint>>) => void;
  onTransformElements: (transforms: Readonly<Record<string, DiagramElementTransform>>) => void;
  onAddConnector: (connector: DiagramConnectorElement) => void;
  onUpdateConnector: (connectorId: string, changes: DiagramElementPatch) => void;
  onAddShape: (shapeDefinitionId: string, point: DiagramPoint) => void;
  onCanvasTool?: (tool: "text" | "frame", point: DiagramPoint) => void;
  onDropImageFiles?: (files: readonly File[], point: DiagramPoint) => void;
  onRequestContextMenu?: (elementId: string | undefined, clientPoint: DiagramPoint, diagramPoint: DiagramPoint) => void;
  onViewportChange: (viewport: DiagramViewport) => void;
  onOpenChildPage?: (pageId: string) => void;
  onRequestEditLabel?: (element: DiagramPositionedElement) => void;
  onRequestEditConnectorLabel?: (connector: DiagramConnectorElement, point: DiagramPoint) => void;
}

function useCanvasSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setSize({ width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

function diagramPoint(stage: Konva.Stage): DiagramPoint {
  const pointer = stage.getPointerPosition() ?? { x: 0, y: 0 };
  return { x: (pointer.x - stage.x()) / stage.scaleX(), y: (pointer.y - stage.y()) / stage.scaleY() };
}

function pointerInStage(stage: Konva.Stage | null): DiagramPoint {
  return stage ? diagramPoint(stage) : { x: 0, y: 0 };
}

export function DiagramCanvas({ page, registry, selectedElementIds, tool = "select", gridSize = 24, showGrid = true, snapToGrid = true, onSelect, onClearSelection, onMoveElements, onTransformElements, onAddConnector, onUpdateConnector, onAddShape, onCanvasTool, onDropImageFiles, onRequestContextMenu, onViewportChange, onOpenChildPage, onRequestEditLabel, onRequestEditConnectorLabel }: Props) {
  recordDiagramRender("canvas");
  const { ref: containerRef, size } = useCanvasSize();
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const edgeRefs = useRef(new Map<string, DiagramConnectorRendererHandle>());
  const temporaryPositions = useRef(new Map<string, DiagramPoint>());
  const dragOrigin = useRef<{ id: string; center: DiagramPoint; positions: Map<string, DiagramPoint> } | null>(null);
  const smartSnappedAxes = useRef({ x: false, y: false });
  const verticalGuideRef = useRef<Konva.Line>(null);
  const horizontalGuideRef = useRef<Konva.Line>(null);
  const guideFrameRef = useRef<number | null>(null);
  const [marquee, setMarquee] = useState<DiagramRect | null>(null);
  const marqueeStart = useRef<DiagramPoint | null>(null);
  const panStart = useRef<{ pointer: DiagramPoint; viewport: DiagramViewport } | null>(null);
  const connectionGestureRef = useRef<ConnectionGesture | null>(null);
  const connectionTargetRef = useRef<DiagramConnectorEndpoint | null>(null);
  const connectionPreviewRef = useRef<Konva.Line>(null);
  const [connectionGesture, setConnectionGesture] = useState<ConnectionGesture | null>(null);
  const [connectionTarget, setConnectionTarget] = useState<DiagramConnectorEndpoint | null>(null);
  const selected = useMemo(() => new Set(selectedElementIds), [selectedElementIds]);
  const elementsById = useMemo(() => new Map(page.elements.map((element) => [element.id, element])), [page.elements]);
  const positioned = useMemo(() => page.elements.filter(isDiagramPositionedElement).sort((a, b) => {
    const structural = (element: DiagramPositionedElement) => element.kind === "frame" || element.kind === "group" || (element.kind === "shape" && registry.getShape(element.shapeDefinitionId)?.isFrame) ? 0 : 1;
    return structural(a) - structural(b) || a.layer - b.layer;
  }), [page.elements, registry]);
  const connectors = useMemo(() => page.elements.filter(isDiagramConnectorElement).sort((a, b) => a.layer - b.layer), [page.elements]);
  const transformTarget = selectedElementIds.length === 1 ? elementsById.get(selectedElementIds[0]) : undefined;
  const transformDefinition = transformTarget?.kind === "shape" ? registry.getShape(transformTarget.shapeDefinitionId) : undefined;
  const enabledAnchors = transformDefinition?.resize.preserveAspectRatio
    ? ["top-left", "top-right", "bottom-left", "bottom-right"]
    : transformDefinition?.resize.horizontal === false
      ? ["top-center", "bottom-center"]
      : transformDefinition?.resize.vertical === false
        ? ["middle-left", "middle-right"]
        : ["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"];

  useEffect(() => {
    const nodes = selectedElementIds.map((id) => nodeRefs.current.get(id)).filter((node): node is Konva.Group => Boolean(node));
    transformerRef.current?.nodes(nodes);
    transformerRef.current?.getLayer()?.batchDraw();
  }, [page.elements, selectedElementIds]);

  useEffect(() => () => {
    if (guideFrameRef.current !== null) cancelAnimationFrame(guideFrameRef.current);
  }, []);

  const temporaryPosition = useCallback((elementId: string) => temporaryPositions.current.get(elementId), []);
  const refreshConnectedEdges = useCallback((nodeIds: ReadonlySet<string>) => {
    for (const connector of connectors) if (nodeIds.has(connector.source.elementId) || nodeIds.has(connector.target.elementId)) edgeRefs.current.get(connector.id)?.refresh();
  }, [connectors]);

  const handleDragStart = useCallback((element: DiagramPositionedElement, group: Konva.Group) => {
    if (!selected.has(element.id)) onSelect([element.id], false);
    const selectedRoots = selected.has(element.id) ? selectedElementIds : [element.id];
    const movingIds = [...new Set(selectedRoots.flatMap((id) => {
      const candidate = elementsById.get(id);
      return candidate?.kind === "group" ? [id, ...candidate.childElementIds] : [id];
    }))];
    const positions = new Map<string, DiagramPoint>();
    for (const id of movingIds) {
      const candidate = elementsById.get(id);
      if (candidate && isDiagramPositionedElement(candidate) && !candidate.locked) positions.set(id, { x: candidate.x, y: candidate.y });
    }
    dragOrigin.current = { id: element.id, center: { x: group.x(), y: group.y() }, positions };
  }, [elementsById, onSelect, selected, selectedElementIds]);

  const handleDragMove = useCallback((element: DiagramPositionedElement, group: Konva.Group) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    const rawDx = group.x() - origin.center.x;
    const rawDy = group.y() - origin.center.y;
    const movingIds = new Set(origin.positions.keys());
    const snap = alignmentSnap(
      { x: element.x + rawDx, y: element.y + rawDy, width: element.width, height: element.height },
      positioned.filter((candidate) => candidate.visible && !candidate.locked && !movingIds.has(candidate.id) && !candidate.parentGroupId),
      6 / page.viewport.zoom,
    );
    const dx = rawDx + snap.dx;
    const dy = rawDy + snap.dy;
    smartSnappedAxes.current = { x: snap.vertical !== undefined, y: snap.horizontal !== undefined };
    if (snap.dx || snap.dy) group.position({ x: origin.center.x + dx, y: origin.center.y + dy });
    for (const [id, position] of origin.positions) {
      const candidate = elementsById.get(id);
      if (!candidate || !isDiagramPositionedElement(candidate)) continue;
      const next = { x: position.x + dx, y: position.y + dy };
      temporaryPositions.current.set(id, next);
      if (id !== element.id) {
        const node = nodeRefs.current.get(id);
        node?.position({ x: next.x + candidate.width / 2, y: next.y + candidate.height / 2 });
      }
    }
    if (guideFrameRef.current !== null) cancelAnimationFrame(guideFrameRef.current);
    guideFrameRef.current = requestAnimationFrame(() => {
      const left = -page.viewport.x / page.viewport.zoom;
      const top = -page.viewport.y / page.viewport.zoom;
      const right = left + size.width / page.viewport.zoom;
      const bottom = top + size.height / page.viewport.zoom;
      verticalGuideRef.current?.points(snap.vertical === undefined ? [] : [snap.vertical, top, snap.vertical, bottom]);
      verticalGuideRef.current?.visible(snap.vertical !== undefined);
      horizontalGuideRef.current?.points(snap.horizontal === undefined ? [] : [left, snap.horizontal, right, snap.horizontal]);
      horizontalGuideRef.current?.visible(snap.horizontal !== undefined);
      verticalGuideRef.current?.getLayer()?.batchDraw();
      guideFrameRef.current = null;
    });
    refreshConnectedEdges(new Set(origin.positions.keys()));
  }, [elementsById, page.viewport, positioned, refreshConnectedEdges, size]);

  const handleDragEnd = useCallback(() => {
    const origin = dragOrigin.current;
    if (!origin) return;
    const positions: Record<string, DiagramPoint> = {};
    for (const [id, point] of temporaryPositions.current) positions[id] = snapToGrid ? {
      x: smartSnappedAxes.current.x ? point.x : snapValue(point.x, gridSize),
      y: smartSnappedAxes.current.y ? point.y : snapValue(point.y, gridSize),
    } : point;
    temporaryPositions.current.clear();
    dragOrigin.current = null;
    smartSnappedAxes.current = { x: false, y: false };
    if (guideFrameRef.current !== null) cancelAnimationFrame(guideFrameRef.current);
    guideFrameRef.current = null;
    verticalGuideRef.current?.visible(false);
    horizontalGuideRef.current?.visible(false);
    verticalGuideRef.current?.getLayer()?.batchDraw();
    if (Object.keys(positions).length) onMoveElements(positions);
  }, [gridSize, onMoveElements, snapToGrid]);

  const handleTransformEnd = useCallback(() => {
    const transforms: Record<string, DiagramElementTransform> = {};
    for (const elementId of selectedElementIds) {
      const element = elementsById.get(elementId);
      const group = nodeRefs.current.get(elementId);
      if (!element || !isDiagramPositionedElement(element) || !group || element.locked) continue;
      const definition = element.kind === "shape" ? registry.getShape(element.shapeDefinitionId) : undefined;
      const minimum = definition?.minimumSize ?? { width: 24, height: 24 };
      let width = Math.max(minimum.width, element.width * Math.abs(group.scaleX()));
      let height = Math.max(minimum.height, element.height * Math.abs(group.scaleY()));
      if (definition?.resize.preserveAspectRatio) {
        const scale = Math.max(width / element.width, height / element.height);
        width = element.width * scale;
        height = element.height * scale;
      }
      transforms[element.id] = {
        x: group.x() - width / 2,
        y: group.y() - height / 2,
        width,
        height,
        rotation: definition?.rotatable === false ? element.rotation : group.rotation(),
      };
      group.scale({ x: 1, y: 1 });
    }
    if (Object.keys(transforms).length) onTransformElements(transforms);
  }, [elementsById, onTransformElements, registry, selectedElementIds]);

  const cancelConnection = useCallback(() => {
    connectionGestureRef.current = null;
    connectionTargetRef.current = null;
    setConnectionGesture(null);
    setConnectionTarget(null);
  }, []);

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && connectionGestureRef.current) {
        event.preventDefault();
        cancelConnection();
      }
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [cancelConnection]);

  const nearestPort = useCallback((point: DiagramPoint, blockedElementId: string): DiagramConnectorEndpoint | null => {
    let closest: DiagramConnectorEndpoint | null = null;
    let closestDistance = 16 / page.viewport.zoom;
    for (const element of positioned) {
      if (!element.visible || element.id === blockedElementId || element.kind !== "shape") continue;
      const definition = registry.getShape(element.shapeDefinitionId);
      for (const port of definition?.ports ?? []) {
        const portPosition = resolvePortPoint(element, port.id, registry);
        const distance = Math.hypot(point.x - portPosition.x, point.y - portPosition.y);
        if (distance <= closestDistance) {
          closest = { elementId: element.id, portId: port.id };
          closestDistance = distance;
        }
      }
    }
    return closest;
  }, [page.viewport.zoom, positioned, registry]);

  const beginConnection = useCallback((gesture: ConnectionGesture, pointer: DiagramPoint) => {
    connectionGestureRef.current = gesture;
    connectionTargetRef.current = null;
    setConnectionGesture(gesture);
    setConnectionTarget(null);
    connectionPreviewRef.current?.points([gesture.fixedPoint.x, gesture.fixedPoint.y, pointer.x, pointer.y]);
  }, []);

  const handlePortPointerDown = useCallback((elementId: string, portId: string, event: Konva.KonvaEventObject<PointerEvent>) => {
    if (event.evt.button !== 0) return;
    event.evt.preventDefault();
    const element = elementsById.get(elementId);
    const stage = event.target.getStage();
    if (!element || !isDiagramPositionedElement(element) || !stage) return;
    const endpoint = { elementId, portId };
    beginConnection({ kind: "create", source: endpoint, fixedPoint: resolvePortPoint(element, portId, registry), blockedElementId: elementId }, diagramPoint(stage));
  }, [beginConnection, elementsById, registry]);

  const handleEndpointPointerDown = useCallback((connector: DiagramConnectorElement, endpoint: "source" | "target", event: Konva.KonvaEventObject<PointerEvent>) => {
    if (event.evt.button !== 0 || connector.locked) return;
    event.evt.preventDefault();
    const fixedEndpoint = endpoint === "source" ? connector.target : connector.source;
    const fixedElement = elementsById.get(fixedEndpoint.elementId);
    const stage = event.target.getStage();
    if (!fixedElement || !isDiagramPositionedElement(fixedElement) || !stage) return;
    beginConnection({
      kind: "reattach",
      connectorId: connector.id,
      endpoint,
      fixedPoint: resolvePortPoint(fixedElement, fixedEndpoint.portId, registry),
      blockedElementId: fixedEndpoint.elementId,
    }, diagramPoint(stage));
  }, [beginConnection, elementsById, registry]);

  const finishConnection = useCallback(() => {
    const gesture = connectionGestureRef.current;
    const target = connectionTargetRef.current;
    if (gesture && target) {
      if (gesture.kind === "create" && gesture.source) {
        const sourceElement = elementsById.get(gesture.source.elementId);
        const targetElement = elementsById.get(target.elementId);
        const connector = createDiagramConnector(gesture.source.elementId, gesture.source.portId, target.elementId, target.portId);
        onAddConnector(registry.decorateConnector(
          connector,
          sourceElement?.kind === "shape" ? sourceElement.shapeDefinitionId : undefined,
          targetElement?.kind === "shape" ? targetElement.shapeDefinitionId : undefined,
        ));
      } else if (gesture.kind === "reattach" && gesture.connectorId && gesture.endpoint) {
        onUpdateConnector(gesture.connectorId, { [gesture.endpoint]: target });
      }
    }
    cancelConnection();
  }, [cancelConnection, elementsById, onAddConnector, onUpdateConnector, registry]);

  const gridLines = useMemo(() => {
    if (!showGrid) return [];
    const viewport = page.viewport;
    const left = -viewport.x / viewport.zoom;
    const top = -viewport.y / viewport.zoom;
    const right = left + size.width / viewport.zoom;
    const bottom = top + size.height / viewport.zoom;
    const lines: Array<{ key: string; points: number[] }> = [];
    for (let x = Math.floor(left / gridSize) * gridSize; x <= right; x += gridSize) lines.push({ key: `x-${x}`, points: [x, top, x, bottom] });
    for (let y = Math.floor(top / gridSize) * gridSize; y <= bottom; y += gridSize) lines.push({ key: `y-${y}`, points: [left, y, right, y] });
    return lines;
  }, [gridSize, page.viewport, showGrid, size]);

  const handlePointerDown = useCallback((event: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = event.target.getStage();
    if (!stage || event.target !== stage) return;
    if (connectionGestureRef.current) { cancelConnection(); return; }
    const point = diagramPoint(stage);
    if (tool === "pan" || event.evt.button === 1) {
      panStart.current = { pointer: { x: event.evt.clientX, y: event.evt.clientY }, viewport: page.viewport };
      return;
    }
    if (tool === "text" || tool === "frame") {
      onCanvasTool?.(tool, point);
      return;
    }
    onClearSelection();
    if (tool === "select") { marqueeStart.current = point; setMarquee({ ...point, width: 0, height: 0 }); }
  }, [cancelConnection, onCanvasTool, onClearSelection, page.viewport, tool]);

  const handlePointerMove = useCallback((event: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = event.target.getStage();
    const gesture = connectionGestureRef.current;
    if (stage && gesture) {
      const point = diagramPoint(stage);
      const target = nearestPort(point, gesture.blockedElementId);
      connectionPreviewRef.current?.points([gesture.fixedPoint.x, gesture.fixedPoint.y, point.x, point.y]);
      connectionPreviewRef.current?.getLayer()?.batchDraw();
      const previous = connectionTargetRef.current;
      if (previous?.elementId !== target?.elementId || previous?.portId !== target?.portId) {
        connectionTargetRef.current = target;
        setConnectionTarget(target);
      }
      return;
    }
    if (panStart.current) {
      onViewportChange({ ...panStart.current.viewport, x: panStart.current.viewport.x + event.evt.clientX - panStart.current.pointer.x, y: panStart.current.viewport.y + event.evt.clientY - panStart.current.pointer.y });
      return;
    }
    if (!stage || !marqueeStart.current) return;
    const point = diagramPoint(stage);
    setMarquee({ x: Math.min(point.x, marqueeStart.current.x), y: Math.min(point.y, marqueeStart.current.y), width: Math.abs(point.x - marqueeStart.current.x), height: Math.abs(point.y - marqueeStart.current.y) });
  }, [nearestPort, onViewportChange]);

  const handlePointerUp = useCallback(() => {
    if (connectionGestureRef.current) { finishConnection(); return; }
    panStart.current = null;
    if (marquee && (marquee.width > 2 || marquee.height > 2)) onSelect(positioned.filter((element) => rectContainsRect(marquee, element)).map((element) => element.id), false);
    marqueeStart.current = null;
    setMarquee(null);
  }, [finishConnection, marquee, onSelect, positioned]);

  const handleWheel = useCallback((event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = event.target.getStage();
    if (!stage) return;
    if (!event.evt.ctrlKey && !event.evt.metaKey) {
      onViewportChange({ ...page.viewport, x: page.viewport.x - event.evt.deltaX, y: page.viewport.y - event.evt.deltaY });
      return;
    }
    const pointer = stage.getPointerPosition() ?? { x: size.width / 2, y: size.height / 2 };
    const world = { x: (pointer.x - page.viewport.x) / page.viewport.zoom, y: (pointer.y - page.viewport.y) / page.viewport.zoom };
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, page.viewport.zoom * (event.evt.deltaY > 0 ? 0.9 : 1.1)));
    onViewportChange({ x: pointer.x - world.x * zoom, y: pointer.y - world.y * zoom, zoom });
  }, [onViewportChange, page.viewport, size]);

  const setZoom = useCallback((zoom: number) => {
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    const worldCenter = {
      x: (size.width / 2 - page.viewport.x) / page.viewport.zoom,
      y: (size.height / 2 - page.viewport.y) / page.viewport.zoom,
    };
    onViewportChange({
      x: size.width / 2 - worldCenter.x * nextZoom,
      y: size.height / 2 - worldCenter.y * nextZoom,
      zoom: nextZoom,
    });
  }, [onViewportChange, page.viewport, size]);

  const fitElements = useCallback((elements: readonly DiagramPositionedElement[]) => {
    onViewportChange(fitViewport(positionedBounds(elements), size.width, size.height, 64));
  }, [onViewportChange, size]);

  const selectionForFit = useMemo(() => positioned.filter((element) => selected.has(element.id)), [positioned, selected]);

  return (
    <div ref={containerRef} className="relative h-full min-h-[420px] w-full overflow-hidden bg-[#09090b]" tabIndex={0} data-testid="diagram-canvas" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const stage = stageRef.current; if (!stage) return; const point = diagramPoint(stage); const shapeId = event.dataTransfer.getData(DIAGRAM_SHAPE_MIME); if (shapeId) onAddShape(shapeId, point); else if (event.dataTransfer.files.length) onDropImageFiles?.([...event.dataTransfer.files], point); }} onContextMenu={(event) => event.preventDefault()}>
      <Stage ref={stageRef} width={size.width} height={size.height} x={page.viewport.x} y={page.viewport.y} scaleX={page.viewport.zoom} scaleY={page.viewport.zoom} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onWheel={handleWheel} onContextMenu={(event) => { event.evt.preventDefault(); const stage = event.target.getStage(); if (stage && event.target === stage) onRequestContextMenu?.(undefined, { x: event.evt.clientX, y: event.evt.clientY }, diagramPoint(stage)); }}>
        <Layer listening={false}>{gridLines.map((line) => <Line key={line.key} points={line.points} stroke="#27272a" strokeWidth={1 / page.viewport.zoom} />)}</Layer>
        <Layer>{connectors.map((connector) => <DiagramConnectorRenderer
          key={connector.id}
          ref={(handle) => { if (handle) edgeRefs.current.set(connector.id, handle); else edgeRefs.current.delete(connector.id); }}
          connector={connector}
          elements={elementsById}
          registry={registry}
          selected={selected.has(connector.id)}
          resolveTemporaryPosition={temporaryPosition}
          onSelect={(additive) => onSelect([connector.id], additive)}
          onEndpointPointerDown={(endpoint, event) => handleEndpointPointerDown(connector, endpoint, event)}
          onCommitWaypoints={(waypoints) => onUpdateConnector(connector.id, { waypoints })}
          onAddWaypoint={(point) => {
            const route = connectorPoints(connector, elementsById, registry);
            const insertionIndex = Math.min(connector.waypoints.length, nearestSegmentIndex(route, point));
            const waypoints = [...connector.waypoints];
            waypoints.splice(insertionIndex, 0, point);
            onUpdateConnector(connector.id, { waypoints });
          }}
          onRemoveWaypoint={(index) => onUpdateConnector(connector.id, { waypoints: connector.waypoints.filter((_, waypointIndex) => waypointIndex !== index) })}
          onEditLabel={(point) => onRequestEditConnectorLabel?.(connector, point)}
          onContextMenu={(event) => { event.evt.preventDefault(); onRequestContextMenu?.(connector.id, { x: event.evt.clientX, y: event.evt.clientY }, pointerInStage(event.target.getStage())); }}
        />)}</Layer>
        <Layer>
          {positioned.map((element) => <DiagramShapeRenderer key={element.id} ref={(node) => { if (node) nodeRefs.current.set(element.id, node); else nodeRefs.current.delete(element.id); }} element={element} registry={registry} selected={selected.has(element.id)} connecting={Boolean(connectionGesture)} showPorts={tool === "connect" || selected.has(element.id) || Boolean(connectionGesture)} highlightedPortId={connectionTarget?.elementId === element.id ? connectionTarget.portId : undefined} onSelect={(additive) => onSelect([element.id], additive)} onOpenChildPage={() => { if ((element.kind === "shape" || element.kind === "frame") && element.childPageId) onOpenChildPage?.(element.childPageId); }} onEditLabel={() => onRequestEditLabel?.(element)} onDragStart={(group) => handleDragStart(element, group)} onDragMove={(group) => handleDragMove(element, group)} onDragEnd={handleDragEnd} onPortPointerDown={(portId, event) => handlePortPointerDown(element.id, portId, event)} onContextMenu={(event) => { event.evt.preventDefault(); onRequestContextMenu?.(element.id, { x: event.evt.clientX, y: event.evt.clientY }, pointerInStage(event.target.getStage())); }} />)}
          <Transformer
            ref={transformerRef}
            rotateEnabled={selectedElementIds.length === 1 && (!transformDefinition || transformDefinition.rotatable !== false)}
            enabledAnchors={enabledAnchors}
            keepRatio={Boolean(transformDefinition?.resize.preserveAspectRatio)}
            flipEnabled={false}
            padding={3}
            borderStroke="#8b5cf6"
            borderStrokeWidth={1.25}
            anchorFill="#fafafa"
            anchorStroke="#7c3aed"
            anchorStrokeWidth={1.5}
            anchorSize={8}
            anchorCornerRadius={2}
            rotateAnchorOffset={24}
            rotateLineVisible
            anchorStyleFunc={(anchor) => { if (anchor.hasName("rotater")) { anchor.fill("#8b5cf6"); anchor.cornerRadius(8); anchor.stroke("#ddd6fe"); } }}
            boundBoxFunc={(oldBox, newBox) => newBox.width < 20 || newBox.height < 20 ? oldBox : newBox}
            onTransformEnd={handleTransformEnd}
          />
        </Layer>
        <Layer listening={false}>
          {marquee ? <Rect {...marquee} fill="#a78bfa22" stroke="#a78bfa" strokeWidth={1 / page.viewport.zoom} dash={[5, 4]} /> : null}
          {connectionGesture ? <Line ref={connectionPreviewRef} points={[connectionGesture.fixedPoint.x, connectionGesture.fixedPoint.y, connectionGesture.fixedPoint.x, connectionGesture.fixedPoint.y]} stroke={connectionTarget ? "#22c55e" : "#a78bfa"} strokeWidth={2 / page.viewport.zoom} dash={[7 / page.viewport.zoom, 5 / page.viewport.zoom]} lineCap="round" /> : null}
          <Line ref={verticalGuideRef} visible={false} points={[]} stroke="#f472b6" strokeWidth={1 / page.viewport.zoom} dash={[5 / page.viewport.zoom, 4 / page.viewport.zoom]} />
          <Line ref={horizontalGuideRef} visible={false} points={[]} stroke="#f472b6" strokeWidth={1 / page.viewport.zoom} dash={[5 / page.viewport.zoom, 4 / page.viewport.zoom]} />
        </Layer>
      </Stage>
      {!positioned.some((element) => element.visible) ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-xl border border-border/80 bg-surface/80 px-8 py-7 text-center shadow-2xl backdrop-blur-sm"><Shapes className="mx-auto h-7 w-7 text-accent" /><p className="mt-3 text-sm font-medium text-foreground">Start with a shape</p><p className="mt-1 max-w-56 text-[11px] leading-relaxed text-muted">Choose a pack on the left, then click or drag a shape onto the canvas.</p></div></div> : null}
      {connectionGesture ? <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-amber-500/40 bg-amber-950/90 px-3 py-1 text-[10px] font-medium text-amber-200 shadow-lg">Drag to a highlighted port · Escape cancels</div> : null}
      <div className="absolute bottom-3 right-[159px] z-10 flex h-8 items-center rounded-md border border-border bg-surface/95 p-0.5 shadow-lg backdrop-blur-sm" aria-label="Zoom controls">
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => setZoom(page.viewport.zoom / 1.2)} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-elevated hover:text-foreground"><Minus className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label="Reset zoom to 100%" title="Reset zoom to 100%" onClick={() => setZoom(1)} className="h-7 min-w-11 rounded px-1 text-[10px] font-medium text-muted hover:bg-surface-elevated hover:text-foreground">{Math.round(page.viewport.zoom * 100)}%</button>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => setZoom(page.viewport.zoom * 1.2)} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-elevated hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <button type="button" aria-label="Fit selection" title="Fit selection" disabled={!selectionForFit.length} onClick={() => fitElements(selectionForFit)} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-30"><Crosshair className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label="Fit diagram" title="Fit diagram" onClick={() => fitElements(positioned)} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-surface-elevated hover:text-foreground"><Maximize2 className="h-3.5 w-3.5" /></button>
      </div>
      <DiagramMinimap elements={page.elements} viewport={page.viewport} canvasWidth={size.width} canvasHeight={size.height} onViewportChange={onViewportChange} />
    </div>
  );
}
