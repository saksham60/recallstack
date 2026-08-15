"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import { Layer, Line, Rect, Stage, Transformer } from "react-konva";
import { Shapes } from "lucide-react";
import { rectContainsRect, snapValue } from "../core/geometry";
import { recordDiagramRender } from "../core/performance";
import type { DiagramRegistry } from "../core/registry";
import { createDiagramConnector } from "../core/state";
import type { DiagramConnectorElement, DiagramEditorTool, DiagramPage, DiagramPoint, DiagramPositionedElement, DiagramRect, DiagramViewport } from "../core/types";
import { isDiagramConnectorElement, isDiagramPositionedElement } from "../core/types";
import { DiagramConnectorRenderer, type DiagramConnectorRendererHandle } from "./DiagramConnectorRenderer";
import { DiagramShapeRenderer } from "./DiagramShapeRenderer";
import { DiagramMinimap } from "./DiagramMinimap";

export const DIAGRAM_SHAPE_MIME = "application/x-recallstack-diagram-shape";
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

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
  onResizeElement: (elementId: string, size: { width: number; height: number }, position: DiagramPoint, rotation: number) => void;
  onAddConnector: (connector: DiagramConnectorElement) => void;
  onAddShape: (shapeDefinitionId: string, point: DiagramPoint) => void;
  onViewportChange: (viewport: DiagramViewport) => void;
  onOpenChildPage?: (pageId: string) => void;
  onRequestEditLabel?: (element: DiagramPositionedElement) => void;
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

export function DiagramCanvas({ page, registry, selectedElementIds, tool = "select", gridSize = 24, showGrid = true, snapToGrid = true, onSelect, onClearSelection, onMoveElements, onResizeElement, onAddConnector, onAddShape, onViewportChange, onOpenChildPage, onRequestEditLabel }: Props) {
  recordDiagramRender("canvas");
  const { ref: containerRef, size } = useCanvasSize();
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const edgeRefs = useRef(new Map<string, DiagramConnectorRendererHandle>());
  const temporaryPositions = useRef(new Map<string, DiagramPoint>());
  const dragOrigin = useRef<{ id: string; center: DiagramPoint; positions: Map<string, DiagramPoint> } | null>(null);
  const [marquee, setMarquee] = useState<DiagramRect | null>(null);
  const marqueeStart = useRef<DiagramPoint | null>(null);
  const panStart = useRef<{ pointer: DiagramPoint; viewport: DiagramViewport } | null>(null);
  const [connectionStart, setConnectionStart] = useState<{ elementId: string; portId: string } | null>(null);
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

  const temporaryPosition = useCallback((elementId: string) => temporaryPositions.current.get(elementId), []);
  const refreshConnectedEdges = useCallback((nodeIds: ReadonlySet<string>) => {
    for (const connector of connectors) if (nodeIds.has(connector.source.elementId) || nodeIds.has(connector.target.elementId)) edgeRefs.current.get(connector.id)?.refresh();
  }, [connectors]);

  const handleDragStart = useCallback((element: DiagramPositionedElement, group: Konva.Group) => {
    if (!selected.has(element.id)) onSelect([element.id], false);
    const movingIds = selected.has(element.id) ? selectedElementIds : [element.id];
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
    const dx = group.x() - origin.center.x;
    const dy = group.y() - origin.center.y;
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
    refreshConnectedEdges(new Set(origin.positions.keys()));
  }, [elementsById, refreshConnectedEdges]);

  const handleDragEnd = useCallback(() => {
    const origin = dragOrigin.current;
    if (!origin) return;
    const positions: Record<string, DiagramPoint> = {};
    for (const [id, point] of temporaryPositions.current) positions[id] = snapToGrid ? { x: snapValue(point.x, gridSize), y: snapValue(point.y, gridSize) } : point;
    temporaryPositions.current.clear();
    dragOrigin.current = null;
    if (Object.keys(positions).length) onMoveElements(positions);
  }, [gridSize, onMoveElements, snapToGrid]);

  const handleTransformEnd = useCallback((element: DiagramPositionedElement, group: Konva.Group) => {
    const definition = element.kind === "shape" ? registry.getShape(element.shapeDefinitionId) : undefined;
    const minimum = definition?.minimumSize ?? { width: 24, height: 24 };
    let width = Math.max(minimum.width, element.width * Math.abs(group.scaleX()));
    let height = Math.max(minimum.height, element.height * Math.abs(group.scaleY()));
    if (definition?.resize.preserveAspectRatio) {
      const scale = Math.max(width / element.width, height / element.height);
      width = element.width * scale;
      height = element.height * scale;
    }
    group.scale({ x: 1, y: 1 });
    onResizeElement(element.id, { width, height }, { x: group.x() - width / 2, y: group.y() - height / 2 }, definition?.rotatable === false ? element.rotation : group.rotation());
  }, [onResizeElement, registry]);

  const handlePort = useCallback((elementId: string, portId: string) => {
    if (!connectionStart) { setConnectionStart({ elementId, portId }); return; }
    if (connectionStart.elementId !== elementId) onAddConnector(createDiagramConnector(connectionStart.elementId, connectionStart.portId, elementId, portId));
    setConnectionStart(null);
  }, [connectionStart, onAddConnector]);

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
    const point = diagramPoint(stage);
    if (tool === "pan" || event.evt.button === 1) {
      panStart.current = { pointer: { x: event.evt.clientX, y: event.evt.clientY }, viewport: page.viewport };
      return;
    }
    onClearSelection();
    setConnectionStart(null);
    if (tool === "select") { marqueeStart.current = point; setMarquee({ ...point, width: 0, height: 0 }); }
  }, [onClearSelection, page.viewport, tool]);

  const handlePointerMove = useCallback((event: Konva.KonvaEventObject<PointerEvent>) => {
    if (panStart.current) {
      onViewportChange({ ...panStart.current.viewport, x: panStart.current.viewport.x + event.evt.clientX - panStart.current.pointer.x, y: panStart.current.viewport.y + event.evt.clientY - panStart.current.pointer.y });
      return;
    }
    const stage = event.target.getStage();
    if (!stage || !marqueeStart.current) return;
    const point = diagramPoint(stage);
    setMarquee({ x: Math.min(point.x, marqueeStart.current.x), y: Math.min(point.y, marqueeStart.current.y), width: Math.abs(point.x - marqueeStart.current.x), height: Math.abs(point.y - marqueeStart.current.y) });
  }, [onViewportChange]);

  const handlePointerUp = useCallback(() => {
    panStart.current = null;
    if (marquee && (marquee.width > 2 || marquee.height > 2)) onSelect(positioned.filter((element) => rectContainsRect(marquee, element)).map((element) => element.id), false);
    marqueeStart.current = null;
    setMarquee(null);
  }, [marquee, onSelect, positioned]);

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

  return (
    <div ref={containerRef} className="relative h-full min-h-[420px] w-full overflow-hidden bg-[#09090b]" tabIndex={0} data-testid="diagram-canvas" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const shapeId = event.dataTransfer.getData(DIAGRAM_SHAPE_MIME); const stage = stageRef.current; if (shapeId && stage) onAddShape(shapeId, diagramPoint(stage)); }}>
      <Stage ref={stageRef} width={size.width} height={size.height} x={page.viewport.x} y={page.viewport.y} scaleX={page.viewport.zoom} scaleY={page.viewport.zoom} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onWheel={handleWheel}>
        <Layer listening={false}>{gridLines.map((line) => <Line key={line.key} points={line.points} stroke="#27272a" strokeWidth={1 / page.viewport.zoom} />)}</Layer>
        <Layer>{connectors.map((connector) => <DiagramConnectorRenderer key={connector.id} ref={(handle) => { if (handle) edgeRefs.current.set(connector.id, handle); else edgeRefs.current.delete(connector.id); }} connector={connector} elements={elementsById} registry={registry} selected={selected.has(connector.id)} resolveTemporaryPosition={temporaryPosition} onSelect={(additive) => onSelect([connector.id], additive)} />)}</Layer>
        <Layer>
          {positioned.map((element) => <DiagramShapeRenderer key={element.id} ref={(node) => { if (node) nodeRefs.current.set(element.id, node); else nodeRefs.current.delete(element.id); }} element={element} registry={registry} selected={selected.has(element.id)} connecting={Boolean(connectionStart)} showPorts={tool === "connect" || selected.has(element.id)} onSelect={(additive) => onSelect([element.id], additive)} onOpenChildPage={() => { if ((element.kind === "shape" || element.kind === "frame") && element.childPageId) onOpenChildPage?.(element.childPageId); }} onEditLabel={() => onRequestEditLabel?.(element)} onDragStart={(group) => handleDragStart(element, group)} onDragMove={(group) => handleDragMove(element, group)} onDragEnd={handleDragEnd} onTransformEnd={(group) => handleTransformEnd(element, group)} onPortClick={(portId) => handlePort(element.id, portId)} />)}
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
          />
        </Layer>
        <Layer listening={false}>{marquee ? <Rect {...marquee} fill="#a78bfa22" stroke="#a78bfa" strokeWidth={1 / page.viewport.zoom} dash={[5, 4]} /> : null}</Layer>
      </Stage>
      {!positioned.some((element) => element.visible) ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-xl border border-border/80 bg-surface/80 px-8 py-7 text-center shadow-2xl backdrop-blur-sm"><Shapes className="mx-auto h-7 w-7 text-accent" /><p className="mt-3 text-sm font-medium text-foreground">Start with a shape</p><p className="mt-1 max-w-56 text-[11px] leading-relaxed text-muted">Choose a pack on the left, then click or drag a shape onto the canvas.</p></div></div> : null}
      {connectionStart ? <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-amber-500/40 bg-amber-950/90 px-3 py-1 text-[10px] font-medium text-amber-200 shadow-lg">Choose a target port · click empty canvas to cancel</div> : null}
      <DiagramMinimap elements={page.elements} viewport={page.viewport} canvasWidth={size.width} canvasHeight={size.height} onViewportChange={onViewportChange} />
    </div>
  );
}
