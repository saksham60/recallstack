"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type Konva from "konva";
import { Arrow, Layer, Line, Stage, Text, Transformer } from "react-konva";
import type {
  SystemDesignDiagram,
  SystemDesignEdge,
  SystemDesignNode,
  SystemDesignPort,
  SystemDesignViewport,
} from "../types/system-design.types";
import { useElementSize } from "../hooks/use-element-size";
import {
  MAX_ZOOM,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  MIN_ZOOM,
  createSystemDesignEdge,
} from "../utils/system-design-defaults";
import {
  recordSystemDesignDragFrame,
  recordSystemDesignRender,
  requestSystemDesignDragMeasurementFinish,
  startSystemDesignDragMeasurement,
} from "../utils/performance-instrumentation";
import {
  getNodePortPosition,
  SystemDesignEdgeRenderer,
  type SystemDesignEdgeRendererHandle,
} from "./SystemDesignEdgeRenderer";
import {
  SystemDesignNodeRenderer,
  type SystemDesignCanvasTheme,
} from "./SystemDesignNodeRenderer";
import { SystemDesignMinimap } from "./SystemDesignMinimap";

const GRID_SIZE = 24;

const DEFAULT_THEME: SystemDesignCanvasTheme = {
  background: "#09090b",
  surface: "#18181b",
  surfaceElevated: "#27272a",
  border: "#3f3f46",
  foreground: "#fafafa",
  muted: "#a1a1aa",
  accent: "#a78bfa",
  accentForeground: "#09090b",
  success: "#22c55e",
  warning: "#eab308",
  danger: "#ef4444",
};

interface NodePositionChange {
  id: string;
  x: number;
  y: number;
}

interface NodeFrameChange extends NodePositionChange {
  width: number;
  height: number;
}

interface ConnectionDraft {
  sourceNodeId: string;
  sourcePort: SystemDesignPort;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface SystemDesignCanvasHandle {
  fitToScreen: () => void;
  resetViewport: () => void;
  zoomBy: (factor: number) => void;
  getVisibleCenter: () => { x: number; y: number };
}

interface SystemDesignCanvasProps {
  diagram: SystemDesignDiagram;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  preview: boolean;
  showGrid?: boolean;
  snapToGrid?: boolean;
  internalComponentCounts?: Readonly<Record<string, number>>;
  onSelectNode: (nodeId: string, additive: boolean) => void;
  onSelectEdge: (edgeId: string, additive: boolean) => void;
  onClearSelection: () => void;
  onMoveNodes: (changes: NodePositionChange[]) => void;
  onResizeNode: (change: NodeFrameChange) => void;
  onAddEdge: (edge: SystemDesignEdge) => void;
  onViewportChange: (viewport: SystemDesignViewport) => void;
  onDropNodeType: (
    nodeType: string,
    position: { x: number; y: number },
  ) => void;
  onOpenModule?: (nodeId: string) => void;
  onEditNodeLabel?: (nodeId: string, label: string) => void;
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function readCanvasTheme(): SystemDesignCanvasTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    background: read("--background", DEFAULT_THEME.background),
    surface: read("--surface", DEFAULT_THEME.surface),
    surfaceElevated: read(
      "--surface-elevated",
      DEFAULT_THEME.surfaceElevated,
    ),
    border: read("--border", DEFAULT_THEME.border),
    foreground: read("--foreground", DEFAULT_THEME.foreground),
    muted: read("--muted", DEFAULT_THEME.muted),
    accent: read("--accent", DEFAULT_THEME.accent),
    accentForeground: read(
      "--accent-foreground",
      DEFAULT_THEME.accentForeground,
    ),
    success: read("--success", DEFAULT_THEME.success),
    warning: read("--warning", DEFAULT_THEME.warning),
    danger: read("--danger", DEFAULT_THEME.danger),
  };
}

function worldPoint(
  point: { x: number; y: number },
  viewport: SystemDesignViewport,
): { x: number; y: number } {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

function isBoundaryNode(node: SystemDesignNode): boolean {
  return node.type === "system_boundary" || node.type === "container";
}

export const SystemDesignCanvas = forwardRef<
  SystemDesignCanvasHandle,
  SystemDesignCanvasProps
>(function SystemDesignCanvas(
  {
    diagram,
    selectedNodeIds,
    selectedEdgeIds,
    preview,
    showGrid = true,
    snapToGrid = true,
    onSelectNode,
    onSelectEdge,
    onClearSelection,
    onMoveNodes,
    onResizeNode,
    onAddEdge,
    onViewportChange,
    onDropNodeType,
    onOpenModule,
    onEditNodeLabel,
    internalComponentCounts = {},
  },
  ref,
) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const edgesLayerRef = useRef<Konva.Layer>(null);
  const boundaryLayerRef = useRef<Konva.Layer>(null);
  const nodesLayerRef = useRef<Konva.Layer>(null);
  const interactionLayerRef = useRef<Konva.Layer>(null);
  const verticalGuideRef = useRef<Konva.Line>(null);
  const horizontalGuideRef = useRef<Konva.Line>(null);
  const alignmentFrameRef = useRef<number | null>(null);
  const wheelCommitTimerRef = useRef<number | null>(null);
  const pendingWheelViewportRef = useRef<SystemDesignViewport | null>(
    null,
  );
  const liftedNodeIdsRef = useRef<string[]>([]);
  const liftedEdgeIdsRef = useRef<string[]>([]);
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const edgeRefs = useRef(
    new Map<string, SystemDesignEdgeRendererHandle>(),
  );
  const connectionArrowRef = useRef<Konva.Arrow>(null);
  const dragSnapshot = useRef(new Map<string, { x: number; y: number }>());
  const [connection, setConnection] = useState<ConnectionDraft | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const connectionRef = useRef<ConnectionDraft | null>(null);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const { viewport } = diagram;

  useEffect(() => {
    recordSystemDesignRender("canvas");
  });

  const clearConnection = useCallback(() => {
    connectionRef.current = null;
    setConnection(null);
  }, []);

  useEffect(() => {
    setTheme(readCanvasTheme());
  }, []);

  useEffect(() => {
    const cancelActiveConnection = () => {
      if (connectionRef.current) clearConnection();
    };
    window.addEventListener("mouseup", cancelActiveConnection);
    window.addEventListener("touchend", cancelActiveConnection);
    window.addEventListener("blur", cancelActiveConnection);
    return () => {
      window.removeEventListener("mouseup", cancelActiveConnection);
      window.removeEventListener("touchend", cancelActiveConnection);
      window.removeEventListener("blur", cancelActiveConnection);
    };
  }, [clearConnection]);

  const visibleNodes = useMemo(
    () =>
      [...diagram.nodes]
        .filter((node) => node.visible !== false)
        .sort((a, b) => a.layer - b.layer),
    [diagram.nodes],
  );
  const nodeMap = useMemo(
    () => new Map(visibleNodes.map((node) => [node.id, node])),
    [visibleNodes],
  );
  const boundaryNodes = useMemo(
    () => visibleNodes.filter(isBoundaryNode),
    [visibleNodes],
  );
  const foregroundNodes = useMemo(
    () => visibleNodes.filter((node) => !isBoundaryNode(node)),
    [visibleNodes],
  );
  const connectedEdgesByNode = useMemo(() => {
    const byNode = new Map<string, SystemDesignEdge[]>();
    diagram.edges.forEach((edge) => {
      const sourceEdges = byNode.get(edge.sourceNodeId) ?? [];
      sourceEdges.push(edge);
      byNode.set(edge.sourceNodeId, sourceEdges);
      const targetEdges = byNode.get(edge.targetNodeId) ?? [];
      targetEdges.push(edge);
      byNode.set(edge.targetNodeId, targetEdges);
    });
    return byNode;
  }, [diagram.edges]);
  const edgeMap = useMemo(
    () => new Map(diagram.edges.map((edge) => [edge.id, edge])),
    [diagram.edges],
  );

  const updateConnectedEdgeGeometry = useCallback(
    (positions: ReadonlyMap<string, { x: number; y: number }>) => {
      const edgeIds = new Set<string>();
      positions.forEach((_, nodeId) => {
        connectedEdgesByNode
          .get(nodeId)
          ?.forEach((edge) => edgeIds.add(edge.id));
      });
      edgeIds.forEach((edgeId) => {
        const edge = edgeMap.get(edgeId);
        if (!edge) return;
        const source = nodeMap.get(edge.sourceNodeId);
        const target = nodeMap.get(edge.targetNodeId);
        if (!source || !target) return;
        const sourcePosition = positions.get(source.id);
        const targetPosition = positions.get(target.id);
        const nextSource: SystemDesignNode = sourcePosition
          ? { ...source, ...sourcePosition }
          : source;
        const nextTarget: SystemDesignNode = targetPosition
          ? { ...target, ...targetPosition }
          : target;
        edgeRefs.current
          .get(edgeId)
          ?.updateGeometry(nextSource, nextTarget);
      });
      recordSystemDesignDragFrame(edgeIds.size);
    },
    [connectedEdgesByNode, edgeMap, nodeMap],
  );

  const liftDragVisuals = useCallback(
    (nodeIds: readonly string[]) => {
      const interactionLayer = interactionLayerRef.current;
      if (!interactionLayer) return;
      const edgeIds = new Set<string>();
      nodeIds.forEach((nodeId) => {
        connectedEdgesByNode
          .get(nodeId)
          ?.forEach((edge) => edgeIds.add(edge.id));
      });
      liftedNodeIdsRef.current = [...nodeIds];
      liftedEdgeIdsRef.current = [...edgeIds];
      transformerRef.current?.nodes([]);
      edgeIds.forEach((edgeId) => {
        edgeRefs.current.get(edgeId)?.getGroup()?.moveTo(interactionLayer);
      });
      nodeIds.forEach((nodeId) => {
        const group = nodeRefs.current.get(nodeId);
        group?.find("Shape").forEach((nodeShape) => {
          const shape = nodeShape as Konva.Shape;
          shape.setAttr(
            "_systemDesignShadowEnabled",
            shape.shadowEnabled(),
          );
          shape.shadowEnabled(false);
        });
        group?.moveTo(interactionLayer);
      });
      transformerRef.current?.moveToTop();
      edgesLayerRef.current?.batchDraw();
      boundaryLayerRef.current?.batchDraw();
      nodesLayerRef.current?.batchDraw();
      interactionLayer.batchDraw();
    },
    [connectedEdgesByNode],
  );

  const restoreDragVisuals = useCallback(() => {
    const edgesLayer = edgesLayerRef.current;
    const nodesLayer = nodesLayerRef.current;
    if (edgesLayer) {
      liftedEdgeIdsRef.current.forEach((edgeId) => {
        edgeRefs.current.get(edgeId)?.getGroup()?.moveTo(edgesLayer);
      });
    }
    if (nodesLayer) {
      liftedNodeIdsRef.current.forEach((nodeId) => {
        const group = nodeRefs.current.get(nodeId);
        group?.find("Shape").forEach((nodeShape) => {
          const shape = nodeShape as Konva.Shape;
          const shadowEnabled = shape.getAttr(
            "_systemDesignShadowEnabled",
          );
          if (typeof shadowEnabled === "boolean") {
            shape.shadowEnabled(shadowEnabled);
          }
          shape.setAttr("_systemDesignShadowEnabled", undefined);
        });
        const targetLayer = nodeMap.get(nodeId);
        group?.moveTo(
          targetLayer && isBoundaryNode(targetLayer)
            ? boundaryLayerRef.current ?? nodesLayer
            : nodesLayer,
        );
      });
    }
    liftedEdgeIdsRef.current = [];
    liftedNodeIdsRef.current = [];
    edgesLayer?.batchDraw();
    boundaryLayerRef.current?.batchDraw();
    nodesLayer?.batchDraw();
    interactionLayerRef.current?.batchDraw();
  }, [nodeMap]);

  const getVisibleCenter = useCallback(
    () =>
      worldPoint(
        { x: size.width / 2, y: size.height / 2 },
        diagram.viewport,
      ),
    [diagram.viewport, size.height, size.width],
  );

  const setViewport = useCallback(
    (next: SystemDesignViewport) => {
      onViewportChange({
        x: Number.isFinite(next.x) ? next.x : 0,
        y: Number.isFinite(next.y) ? next.y : 0,
        zoom: clampZoom(next.zoom),
      });
    },
    [onViewportChange],
  );

  const resetViewport = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 });
  }, [setViewport]);

  const fitToScreen = useCallback(() => {
    if (visibleNodes.length === 0 || size.width === 0 || size.height === 0) {
      resetViewport();
      return;
    }
    const padding = 72;
    const left = Math.min(...visibleNodes.map((node) => node.x));
    const top = Math.min(...visibleNodes.map((node) => node.y));
    const right = Math.max(
      ...visibleNodes.map((node) => node.x + node.width),
    );
    const bottom = Math.max(
      ...visibleNodes.map((node) => node.y + node.height),
    );
    const boundsWidth = Math.max(1, right - left);
    const boundsHeight = Math.max(1, bottom - top);
    const zoom = clampZoom(
      Math.min(
        (size.width - padding * 2) / boundsWidth,
        (size.height - padding * 2) / boundsHeight,
        1.5,
      ),
    );
    setViewport({
      x: size.width / 2 - (left + boundsWidth / 2) * zoom,
      y: size.height / 2 - (top + boundsHeight / 2) * zoom,
      zoom,
    });
  }, [
    resetViewport,
    setViewport,
    size.height,
    size.width,
    visibleNodes,
  ]);

  const zoomBy = useCallback(
    (factor: number) => {
      const nextZoom = clampZoom(viewport.zoom * factor);
      const center = { x: size.width / 2, y: size.height / 2 };
      const point = worldPoint(center, viewport);
      setViewport({
        x: center.x - point.x * nextZoom,
        y: center.y - point.y * nextZoom,
        zoom: nextZoom,
      });
    },
    [setViewport, size.height, size.width, viewport],
  );

  useImperativeHandle(
    ref,
    () => ({ fitToScreen, resetViewport, zoomBy, getVisibleCenter }),
    [fitToScreen, getVisibleCenter, resetViewport, zoomBy],
  );

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    if (preview || selectedNodeIds.length !== 1) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }
    const selected = nodeMap.get(selectedNodeIds[0]);
    const selectedRef = nodeRefs.current.get(selectedNodeIds[0]);
    if (!selected || !selectedRef || selected.locked) {
      transformer.nodes([]);
    } else {
      transformer.nodes([selectedRef]);
    }
    transformer.getLayer()?.batchDraw();
  }, [diagram.nodes, nodeMap, preview, selectedNodeIds]);

  const gridLines = useMemo(() => {
    if (!showGrid || size.width === 0 || size.height === 0) return [];
    const left = -viewport.x / viewport.zoom;
    const top = -viewport.y / viewport.zoom;
    const right = left + size.width / viewport.zoom;
    const bottom = top + size.height / viewport.zoom;
    const firstX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
    const firstY = Math.floor(top / GRID_SIZE) * GRID_SIZE;
    const lines: Array<{ key: string; points: number[]; major: boolean }> = [];
    for (let x = firstX; x <= right + GRID_SIZE; x += GRID_SIZE) {
      lines.push({
        key: `x-${x}`,
        points: [x, top - GRID_SIZE, x, bottom + GRID_SIZE],
        major: Math.round(x / GRID_SIZE) % 5 === 0,
      });
    }
    for (let y = firstY; y <= bottom + GRID_SIZE; y += GRID_SIZE) {
      lines.push({
        key: `y-${y}`,
        points: [left - GRID_SIZE, y, right + GRID_SIZE, y],
        major: Math.round(y / GRID_SIZE) % 5 === 0,
      });
    }
    return lines;
  }, [
    size.height,
    size.width,
    showGrid,
    viewport.x,
    viewport.y,
    viewport.zoom,
  ]);

  const hideAlignmentGuides = useCallback(() => {
    verticalGuideRef.current?.visible(false);
    horizontalGuideRef.current?.visible(false);
    interactionLayerRef.current?.batchDraw();
  }, []);

  const scheduleAlignmentGuides = useCallback(
    (nodeId: string, group: Konva.Group) => {
      if (alignmentFrameRef.current !== null) return;
      alignmentFrameRef.current = window.requestAnimationFrame(() => {
        alignmentFrameRef.current = null;
        const dragged = nodeMap.get(nodeId);
        if (!dragged) return;
        const ignored = new Set(dragSnapshot.current.keys());
        const threshold = 6 / viewport.zoom;
        const draggedX = [
          group.x(),
          group.x() + dragged.width / 2,
          group.x() + dragged.width,
        ];
        const draggedY = [
          group.y(),
          group.y() + dragged.height / 2,
          group.y() + dragged.height,
        ];
        let closestXValue: number | null = null;
        let closestXDistance = Number.POSITIVE_INFINITY;
        let closestYValue: number | null = null;
        let closestYDistance = Number.POSITIVE_INFINITY;

        nodeMap.forEach((candidate) => {
          if (ignored.has(candidate.id)) return;
          const anchorsX = [
            candidate.x,
            candidate.x + candidate.width / 2,
            candidate.x + candidate.width,
          ];
          const anchorsY = [
            candidate.y,
            candidate.y + candidate.height / 2,
            candidate.y + candidate.height,
          ];
          anchorsX.forEach((anchor) => {
            draggedX.forEach((value) => {
              const distance = Math.abs(anchor - value);
              if (
                distance <= threshold &&
                distance < closestXDistance
              ) {
                closestXValue = anchor;
                closestXDistance = distance;
              }
            });
          });
          anchorsY.forEach((anchor) => {
            draggedY.forEach((value) => {
              const distance = Math.abs(anchor - value);
              if (
                distance <= threshold &&
                distance < closestYDistance
              ) {
                closestYValue = anchor;
                closestYDistance = distance;
              }
            });
          });
        });

        const left = -viewport.x / viewport.zoom;
        const top = -viewport.y / viewport.zoom;
        const right = left + size.width / viewport.zoom;
        const bottom = top + size.height / viewport.zoom;
        if (closestXValue !== null) {
          verticalGuideRef.current?.points([
            closestXValue,
            top,
            closestXValue,
            bottom,
          ]);
          verticalGuideRef.current?.visible(true);
        } else {
          verticalGuideRef.current?.visible(false);
        }
        if (closestYValue !== null) {
          horizontalGuideRef.current?.points([
            left,
            closestYValue,
            right,
            closestYValue,
          ]);
          horizontalGuideRef.current?.visible(true);
        } else {
          horizontalGuideRef.current?.visible(false);
        }
        interactionLayerRef.current?.batchDraw();
      });
    },
    [nodeMap, size.height, size.width, viewport],
  );

  useEffect(
    () => () => {
      if (alignmentFrameRef.current !== null) {
        window.cancelAnimationFrame(alignmentFrameRef.current);
      }
    },
    [],
  );

  const handleWheel = useCallback(
    (event: Konva.KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault();
      const stage = event.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (!stage || !pointer) return;
      const currentViewport = {
        x: stage.x(),
        y: stage.y(),
        zoom: stage.scaleX(),
      };
      const pointerWorld = worldPoint(pointer, currentViewport);
      const direction = event.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
      const nextZoom = clampZoom(currentViewport.zoom * direction);
      const nextViewport = {
        x: pointer.x - pointerWorld.x * nextZoom,
        y: pointer.y - pointerWorld.y * nextZoom,
        zoom: nextZoom,
      };
      stage.position({ x: nextViewport.x, y: nextViewport.y });
      stage.scale({ x: nextZoom, y: nextZoom });
      stage.batchDraw();
      pendingWheelViewportRef.current = nextViewport;
      if (wheelCommitTimerRef.current !== null) {
        window.clearTimeout(wheelCommitTimerRef.current);
      }
      wheelCommitTimerRef.current = window.setTimeout(() => {
        wheelCommitTimerRef.current = null;
        const pending = pendingWheelViewportRef.current;
        pendingWheelViewportRef.current = null;
        if (pending) setViewport(pending);
      }, 120);
    },
    [setViewport],
  );

  useEffect(
    () => () => {
      if (wheelCommitTimerRef.current !== null) {
        window.clearTimeout(wheelCommitTimerRef.current);
      }
      const pending = pendingWheelViewportRef.current;
      if (pending) onViewportChange(pending);
    },
    [onViewportChange],
  );

  const handleMinimapNavigate = useCallback(
    (point: { x: number; y: number }) => {
      setViewport({
        x: size.width / 2 - point.x * viewport.zoom,
        y: size.height / 2 - point.y * viewport.zoom,
        zoom: viewport.zoom,
      });
    },
    [setViewport, size.height, size.width, viewport.zoom],
  );

  const handleDragStart = useCallback(
    (nodeId: string) => {
      const activeIds = selectedNodeIds.includes(nodeId)
        ? selectedNodeIds
        : [nodeId];
      if (!selectedNodeIds.includes(nodeId)) onSelectNode(nodeId, false);
      dragSnapshot.current = new Map(
        activeIds.flatMap((id) => {
          const node = nodeMap.get(id);
          return node && !node.locked
            ? [[id, { x: node.x, y: node.y }] as const]
            : [];
        }),
      );
      liftDragVisuals([...dragSnapshot.current.keys()]);
      startSystemDesignDragMeasurement(dragSnapshot.current.size);
    },
    [liftDragVisuals, nodeMap, onSelectNode, selectedNodeIds],
  );

  const handleDragMove = useCallback(
    (nodeId: string, group: Konva.Group) => {
      const origin = dragSnapshot.current.get(nodeId);
      if (!origin) return;
      if (snapToGrid) {
        group.position({
          x: Math.round(group.x() / GRID_SIZE) * GRID_SIZE,
          y: Math.round(group.y() / GRID_SIZE) * GRID_SIZE,
        });
      }
      const deltaX = group.x() - origin.x;
      const deltaY = group.y() - origin.y;
      const positions = new Map<string, { x: number; y: number }>();
      dragSnapshot.current.forEach((position, id) => {
        const next = {
          x: position.x + deltaX,
          y: position.y + deltaY,
        };
        positions.set(id, next);
        if (id !== nodeId) nodeRefs.current.get(id)?.position(next);
      });
      updateConnectedEdgeGeometry(positions);
      scheduleAlignmentGuides(nodeId, group);
      group.getLayer()?.batchDraw();
    },
    [scheduleAlignmentGuides, snapToGrid, updateConnectedEdgeGeometry],
  );

  const handleDragEnd = useCallback(
    (nodeId: string, group: Konva.Group) => {
      const origin = dragSnapshot.current.get(nodeId);
      if (!origin) {
        hideAlignmentGuides();
        restoreDragVisuals();
        onMoveNodes([{ id: nodeId, x: group.x(), y: group.y() }]);
        requestSystemDesignDragMeasurementFinish();
        return;
      }
      const deltaX = group.x() - origin.x;
      const deltaY = group.y() - origin.y;
      const changes = [...dragSnapshot.current.entries()].map(
        ([id, position]) => ({
          id,
          x: position.x + deltaX,
          y: position.y + deltaY,
        }),
      );
      dragSnapshot.current.clear();
      hideAlignmentGuides();
      restoreDragVisuals();
      onMoveNodes(changes);
      requestSystemDesignDragMeasurementFinish();
    },
    [hideAlignmentGuides, onMoveNodes, restoreDragVisuals],
  );

  const handlePortStart = useCallback(
    (
      nodeId: string,
      port: SystemDesignPort,
      event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
    ) => {
      if (preview) return;
      const node = nodeMap.get(nodeId);
      const stage = event.target.getStage();
      if (!node || !stage) return;
      event.target.getParent()?.stopDrag();
      const start = getNodePortPosition(node, port);
      const draft = {
        sourceNodeId: nodeId,
        sourcePort: port,
        start,
        end: start,
      };
      connectionRef.current = draft;
      setConnection(draft);
    },
    [nodeMap, preview],
  );

  const handlePortEnd = useCallback(
    (
      targetNodeId: string,
      targetPort: SystemDesignPort,
    ) => {
      const draft = connectionRef.current;
      if (!draft || draft.sourceNodeId === targetNodeId) {
        clearConnection();
        return;
      }
      onAddEdge(
        createSystemDesignEdge(
          draft.sourceNodeId,
          targetNodeId,
          draft.sourcePort,
          targetPort,
        ),
      );
      clearConnection();
    },
    [clearConnection, onAddEdge],
  );

  const updateConnectionPointer = useCallback(
    (pointer: { x: number; y: number }) => {
      const current = connectionRef.current;
      if (!current) return;
      const end = worldPoint(pointer, viewport);
      connectionRef.current = { ...current, end };
      connectionArrowRef.current?.points([
        current.start.x,
        current.start.y,
        end.x,
        end.y,
      ]);
      connectionArrowRef.current?.getLayer()?.batchDraw();
    },
    [viewport],
  );

  const emptyCenter = getVisibleCenter();

  const registerNodeRef = useCallback(
    (id: string, group: Konva.Group | null) => {
      if (group) nodeRefs.current.set(id, group);
      else nodeRefs.current.delete(id);
    },
    [],
  );

  const handleResizeEnd = useCallback(
    (
      id: string,
      frame: { x: number; y: number; width: number; height: number },
    ) =>
      onResizeNode({
        id,
        x: snapToGrid
          ? Math.round(frame.x / GRID_SIZE) * GRID_SIZE
          : frame.x,
        y: snapToGrid
          ? Math.round(frame.y / GRID_SIZE) * GRID_SIZE
          : frame.y,
        width: snapToGrid
          ? Math.round(frame.width / GRID_SIZE) * GRID_SIZE
          : frame.width,
        height: snapToGrid
          ? Math.round(frame.height / GRID_SIZE) * GRID_SIZE
          : frame.height,
      }),
    [onResizeNode, snapToGrid],
  );

  const beginInlineLabelEdit = useCallback(
    (nodeId: string) => {
      const node = nodeMap.get(nodeId);
      if (!node || preview || !onEditNodeLabel) return;
      onSelectNode(nodeId, false);
      setEditingNodeId(nodeId);
      setEditingLabel(node.label);
    },
    [nodeMap, onEditNodeLabel, onSelectNode, preview],
  );

  const finishInlineLabelEdit = useCallback(
    (commit: boolean) => {
      if (commit && editingNodeId && onEditNodeLabel) {
        const label = editingLabel.trim();
        const current = nodeMap.get(editingNodeId);
        if (label && current && label !== current.label) {
          onEditNodeLabel(editingNodeId, label);
        }
      }
      setEditingNodeId(null);
      setEditingLabel("");
    },
    [editingLabel, editingNodeId, nodeMap, onEditNodeLabel],
  );

  useEffect(() => {
    if (editingNodeId && !nodeMap.has(editingNodeId)) {
      setEditingNodeId(null);
      setEditingLabel("");
    }
  }, [editingNodeId, nodeMap]);

  const editingNode = editingNodeId
    ? nodeMap.get(editingNodeId) ?? null
    : null;

  return (
    <div
      ref={containerRef}
      data-testid="system-design-canvas"
      className="relative h-full min-h-0 w-full overflow-hidden bg-background focus-within:outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent"
      role="application"
      aria-label="System design diagram canvas"
      tabIndex={0}
      onDragOver={(event) => {
        if (!preview) event.preventDefault();
      }}
      onDrop={(event) => {
        if (preview) return;
        event.preventDefault();
        const type = event.dataTransfer.getData(
          "application/x-recallstack-system-design-node",
        );
        if (!type) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const position = worldPoint(
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          viewport,
        );
        onDropNodeType(type, {
          x: snapToGrid
            ? Math.round(position.x / GRID_SIZE) * GRID_SIZE
            : position.x,
          y: snapToGrid
            ? Math.round(position.y / GRID_SIZE) * GRID_SIZE
            : position.y,
        });
      }}
    >
      <span className="sr-only">
        Use the component palette and inspector to edit the diagram. Keyboard
        shortcuts are available from the Help button.
      </span>
      {size.width > 0 && size.height > 0 && (
        <>
          <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.zoom}
          scaleY={viewport.zoom}
          draggable={!connection}
          onWheel={handleWheel}
          onMouseDown={(event) => {
            const stage = event.target.getStage();
            const isEmptyCanvas = event.target === stage;
            stage?.draggable(isEmptyCanvas && !connection);
            if (isEmptyCanvas) onClearSelection();
          }}
          onTouchStart={(event) => {
            const stage = event.target.getStage();
            const isEmptyCanvas = event.target === stage;
            stage?.draggable(isEmptyCanvas && !connection);
            if (isEmptyCanvas) onClearSelection();
          }}
          onMouseMove={(event) => {
            const pointer = event.target.getStage()?.getPointerPosition();
            if (!pointer) return;
            updateConnectionPointer(pointer);
          }}
          onTouchMove={(event) => {
            const pointer = event.target.getStage()?.getPointerPosition();
            if (!pointer) return;
            updateConnectionPointer(pointer);
          }}
          onMouseUp={(event) => {
            event.target.getStage()?.draggable(true);
            if (connectionRef.current) clearConnection();
          }}
          onTouchEnd={(event) => {
            event.target.getStage()?.draggable(true);
            if (connectionRef.current) clearConnection();
          }}
          onDragEnd={(event) => {
            if (event.target !== event.target.getStage()) return;
            setViewport({
              x: event.target.x(),
              y: event.target.y(),
              zoom: viewport.zoom,
            });
          }}
        >
          <Layer listening={false}>
            {gridLines.map((line) => (
              <Line
                key={line.key}
                points={line.points}
                stroke={theme.border}
                strokeWidth={line.major ? 0.8 : 0.35}
                opacity={line.major ? 0.34 : 0.2}
              />
            ))}
          </Layer>
          <Layer ref={boundaryLayerRef}>
            {boundaryNodes.map((node) => (
              <SystemDesignNodeRenderer
                key={node.id}
                node={node}
                selected={selectedNodeIds.includes(node.id)}
                connecting={connection?.sourceNodeId === node.id}
                preview={preview}
                theme={theme}
                registerRef={registerNodeRef}
                onSelect={onSelectNode}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onResizeEnd={handleResizeEnd}
                onPortStart={handlePortStart}
                onPortEnd={handlePortEnd}
                onOpenModule={onOpenModule}
                onEditLabel={beginInlineLabelEdit}
                internalComponentCount={internalComponentCounts[node.id]}
              />
            ))}
          </Layer>
          <Layer ref={edgesLayerRef}>
            {diagram.edges.map((edge) => {
              const source = nodeMap.get(edge.sourceNodeId);
              const target = nodeMap.get(edge.targetNodeId);
              if (!source || !target) return null;
              return (
                <SystemDesignEdgeRenderer
                  key={edge.id}
                  ref={(handle) => {
                    if (handle) edgeRefs.current.set(edge.id, handle);
                    else edgeRefs.current.delete(edge.id);
                  }}
                  edge={edge}
                  source={source}
                  target={target}
                  selected={selectedEdgeIds.includes(edge.id)}
                  preview={preview}
                  theme={theme}
                  onSelect={onSelectEdge}
                />
              );
            })}
          </Layer>
          <Layer ref={nodesLayerRef}>
            {foregroundNodes.map((node) => (
              <SystemDesignNodeRenderer
                key={node.id}
                node={node}
                selected={selectedNodeIds.includes(node.id)}
                connecting={connection?.sourceNodeId === node.id}
                preview={preview}
                theme={theme}
                registerRef={registerNodeRef}
                onSelect={onSelectNode}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onResizeEnd={handleResizeEnd}
                onPortStart={handlePortStart}
                onPortEnd={handlePortEnd}
                onOpenModule={onOpenModule}
                onEditLabel={beginInlineLabelEdit}
                internalComponentCount={internalComponentCounts[node.id]}
              />
            ))}
          </Layer>
          <Layer ref={interactionLayerRef}>
            {connection && (
              <Arrow
                ref={connectionArrowRef}
                points={[
                  connection.start.x,
                  connection.start.y,
                  connection.end.x,
                  connection.end.y,
                ]}
                stroke={theme.accent}
                fill={theme.accent}
                strokeWidth={2}
                dash={[8, 5]}
                opacity={0.9}
                pointerLength={8}
                pointerWidth={8}
                listening={false}
              />
            )}
            <Line
              ref={verticalGuideRef}
              visible={false}
              listening={false}
              stroke={theme.accent}
              strokeWidth={1}
              dash={[5, 5]}
            />
            <Line
              ref={horizontalGuideRef}
              visible={false}
              listening={false}
              stroke={theme.accent}
              strokeWidth={1}
              dash={[5, 5]}
            />
            {!preview && (
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                keepRatio={false}
                flipEnabled={false}
                borderStroke={theme.accent}
                anchorFill={theme.surface}
                anchorStroke={theme.accent}
                anchorSize={9}
                enabledAnchors={[
                  "top-left",
                  "top-center",
                  "top-right",
                  "middle-left",
                  "middle-right",
                  "bottom-left",
                  "bottom-center",
                  "bottom-right",
                ]}
                boundBoxFunc={(oldBox, nextBox) =>
                  Math.abs(nextBox.width) <
                    MIN_NODE_WIDTH * viewport.zoom ||
                  Math.abs(nextBox.height) <
                    MIN_NODE_HEIGHT * viewport.zoom
                    ? oldBox
                    : nextBox
                }
              />
            )}
            {visibleNodes.length === 0 && (
              <>
              <Text
                x={emptyCenter.x - 220}
                y={emptyCenter.y - 30}
                width={440}
                align="center"
                text="Drag a component here to start designing."
                fill={theme.foreground}
                fontFamily="Arial"
                fontSize={18}
                fontStyle="bold"
              />
              <Text
                x={emptyCenter.x - 220}
                y={emptyCenter.y + 3}
                width={440}
                align="center"
                text="Start with a client, API gateway, service and database."
                fill={theme.muted}
                fontFamily="Arial"
                fontSize={12}
              />
              </>
            )}
          </Layer>
          </Stage>
          <SystemDesignMinimap
            nodes={diagram.nodes}
            edges={diagram.edges}
            viewport={viewport}
            canvasSize={size}
            onNavigate={handleMinimapNavigate}
          />
          {editingNode && (
            <input
              autoFocus
              data-testid="system-design-inline-label-input"
              aria-label={`Rename ${editingNode.label}`}
              className="absolute z-30 rounded border border-accent bg-surface px-2 text-sm font-semibold text-foreground shadow-xl outline-none ring-2 ring-accent/30"
              style={{
                left: editingNode.x * viewport.zoom + viewport.x,
                top: editingNode.y * viewport.zoom + viewport.y,
                width: Math.max(120, editingNode.width * viewport.zoom),
                height: Math.max(32, Math.min(44, editingNode.height * viewport.zoom)),
              }}
              value={editingLabel}
              onChange={(event) => setEditingLabel(event.target.value)}
              onBlur={() => finishInlineLabelEdit(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  finishInlineLabelEdit(true);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  finishInlineLabelEdit(false);
                }
              }}
            />
          )}
        </>
      )}
    </div>
  );
});
