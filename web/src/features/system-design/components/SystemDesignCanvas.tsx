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
import {
  Arrow,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import type {
  SystemDesignDiagram,
  SystemDesignEdge,
  SystemDesignEditorTool,
  SystemDesignNode,
  SystemDesignPort,
  SystemDesignSelectionMode,
  SystemDesignViewport,
} from "../types/system-design.types";
import { isSystemDesignBoundaryNodeType } from "../constants/system-design-palette";
import { useElementSize } from "../hooks/use-element-size";
import { isSystemDesignTypingTarget } from "../hooks/use-system-design-keyboard-shortcuts";
import {
  MAX_ZOOM,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  MIN_ZOOM,
  createSystemDesignEdge,
} from "../utils/system-design-defaults";
import { snapSystemDesignNodeToObjects } from "../utils/node-layout";
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

const MULTILINE_INLINE_EDIT_NODE_TYPES = new Set<
  SystemDesignNode["type"]
>([
  "text",
  "note",
  "warning_note",
  "assumption_note",
  "callout",
]);

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

const EMPTY_NODE_ID_SET: ReadonlySet<string> = new Set<string>();

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
  startInlineEdit: (nodeId: string) => void;
  applyRemoteNodePositions: (
    positions: Readonly<Record<string, { x: number; y: number }>>,
  ) => void;
  clearRemoteNodePositions: (nodeIds: readonly string[]) => void;
}

interface SystemDesignCanvasProps {
  diagram: SystemDesignDiagram;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  preview: boolean;
  showGrid?: boolean;
  snapToGrid?: boolean;
  snapToObjects?: boolean;
  activeTool?: SystemDesignEditorTool;
  animationsEnabled?: boolean;
  remotelyDraggedNodeIds?: ReadonlySet<string>;
  internalComponentCounts?: Readonly<Record<string, number>>;
  onSelectNode: (nodeId: string, additive: boolean) => void;
  onSelectNodes: (
    nodeIds: string[],
    mode: SystemDesignSelectionMode,
  ) => void;
  onSelectEdge: (edgeId: string, additive: boolean) => void;
  onClearSelection: () => void;
  onMoveNodes: (changes: NodePositionChange[]) => void;
  onNodeDragStart?: (nodeIds: readonly string[]) => void;
  onNodeDragPreview?: (changes: readonly NodePositionChange[]) => void;
  onNodeDragEnd?: (nodeIds: readonly string[]) => void;
  onResizeNode: (change: NodeFrameChange) => void;
  onAddEdge: (edge: SystemDesignEdge) => void;
  onAddFreehand?: (points: readonly { x: number; y: number }[]) => void;
  onViewportChange: (viewport: SystemDesignViewport) => void;
  onDropNodeType: (
    nodeType: string,
    position: { x: number; y: number },
  ) => void;
  onOpenModule?: (nodeId: string) => void;
  onEditNodeLabel?: (nodeId: string, label: string) => void;
  onEditEdgeLabel?: (edgeId: string, label: string) => void;
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
  return isSystemDesignBoundaryNodeType(node.type);
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
    snapToObjects = true,
    activeTool = "select",
    animationsEnabled = true,
    remotelyDraggedNodeIds = EMPTY_NODE_ID_SET,
    onSelectNode,
    onSelectNodes,
    onSelectEdge,
    onClearSelection,
    onMoveNodes,
    onNodeDragStart,
    onNodeDragPreview,
    onNodeDragEnd,
    onResizeNode,
    onAddEdge,
    onAddFreehand,
    onViewportChange,
    onDropNodeType,
    onOpenModule,
    onEditNodeLabel,
    onEditEdgeLabel,
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
  const marqueeRef = useRef<Konva.Rect>(null);
  const draftStrokeLineRef = useRef<Konva.Line>(null);
  const alignmentFrameRef = useRef<number | null>(null);
  const wheelCommitTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const animationStartedAtRef = useRef(0);
  const dragActiveRef = useRef(false);
  const pointerOverCanvasRef = useRef(false);
  const spacePanningRef = useRef(false);
  const pendingWheelViewportRef = useRef<SystemDesignViewport | null>(
    null,
  );
  const liftedNodeIdsRef = useRef<string[]>([]);
  const liftedEdgeIdsRef = useRef<string[]>([]);
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const remoteNodePositionsRef = useRef(
    new Map<string, { x: number; y: number }>(),
  );
  const edgeRefs = useRef(
    new Map<string, SystemDesignEdgeRendererHandle>(),
  );
  const edgeRefCallbacks = useRef(
    new Map<
      string,
      (handle: SystemDesignEdgeRendererHandle | null) => void
    >(),
  );
  const connectionArrowRef = useRef<Konva.Arrow>(null);
  const dragSnapshot = useRef(new Map<string, { x: number; y: number }>());
  const draftStrokeRef = useRef<Array<{ x: number; y: number }> | null>(null);
  const lastPinchDistanceRef = useRef<number | null>(null);
  const lastPinchCenterRef = useRef<{ x: number; y: number } | null>(null);
  const pendingTouchViewportRef = useRef<SystemDesignViewport | null>(null);
  const [connection, setConnection] = useState<ConnectionDraft | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editingEdgeLabel, setEditingEdgeLabel] = useState("");
  const [spacePanning, setSpacePanning] = useState(false);
  const beginInlineLabelEditRef = useRef<(nodeId: string) => void>(() => {});
  const connectionRef = useRef<ConnectionDraft | null>(null);
  const marqueeDraftRef = useRef<{
    start: { x: number; y: number };
    end: { x: number; y: number };
    additive: boolean;
  } | null>(null);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const { viewport } = diagram;

  const getEdgeRefCallback = useCallback((edgeId: string) => {
    const existing = edgeRefCallbacks.current.get(edgeId);
    if (existing) return existing;
    const callback = (handle: SystemDesignEdgeRendererHandle | null) => {
      if (handle) edgeRefs.current.set(edgeId, handle);
      else edgeRefs.current.delete(edgeId);
    };
    edgeRefCallbacks.current.set(edgeId, callback);
    return callback;
  }, []);

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
    const container = stageRef.current?.container();
    if (!container) return;
    container.style.cursor =
      preview || activeTool === "pan" || spacePanning
        ? "grab"
        : activeTool === "connect" || activeTool === "draw"
          ? "crosshair"
          : "default";
  }, [activeTool, preview, spacePanning]);

  useEffect(() => {
    const restorePersistentTool = () => {
      if (!spacePanningRef.current) return;
      spacePanningRef.current = false;
      setSpacePanning(false);
      const stage = stageRef.current;
      if (stage && !stage.isDragging()) {
        stage.draggable(preview || activeTool === "pan");
      }
      const elementListening =
        preview || (activeTool !== "pan" && activeTool !== "draw");
      boundaryLayerRef.current?.listening(elementListening);
      edgesLayerRef.current?.listening(elementListening);
      nodesLayerRef.current?.listening(elementListening);
      interactionLayerRef.current?.listening(true);
      stage?.batchDraw();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isSystemDesignTypingTarget(event.target)) {
        return;
      }
      const container = containerRef.current;
      const canvasIsActive =
        pointerOverCanvasRef.current ||
        Boolean(container?.contains(document.activeElement));
      if (!canvasIsActive) return;

      event.preventDefault();
      if (spacePanningRef.current) return;
      spacePanningRef.current = true;
      setSpacePanning(true);
      clearConnection();
      marqueeDraftRef.current = null;
      marqueeRef.current?.visible(false);
      interactionLayerRef.current?.batchDraw();
      stageRef.current?.draggable(true);
      boundaryLayerRef.current?.listening(false);
      edgesLayerRef.current?.listening(false);
      nodesLayerRef.current?.listening(false);
      interactionLayerRef.current?.listening(false);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !spacePanningRef.current) return;
      event.preventDefault();
      restorePersistentTool();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", restorePersistentTool);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", restorePersistentTool);
    };
  }, [activeTool, clearConnection, containerRef, preview]);

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

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const stopAnimationFrame = () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const updateAnimationState = () => {
      stopAnimationFrame();
      const animatedHandles = [...edgeRefs.current.values()].filter(
        (handle) => handle.isAnimated(),
      );
      const animatedFreehands = diagram.nodes.flatMap((node) => {
        if (
          node.type !== "freehand" ||
          !node.drawing ||
          node.visible === false ||
          node.drawing.animationMode === "none"
        ) {
          return [];
        }
        const line = nodeRefs.current
          .get(node.id)
          ?.findOne<Konva.Line>(".system-design-freehand-motion");
        return line ? [{ line, drawing: node.drawing }] : [];
      });
      const active =
        animationsEnabled &&
        !reducedMotion.matches &&
        document.visibilityState === "visible" &&
        (animatedHandles.length > 0 || animatedFreehands.length > 0);
      edgeRefs.current.forEach((handle) =>
        handle.setAnimationActive(active && handle.isAnimated()),
      );
      animatedFreehands.forEach(({ line, drawing }) => {
        line.visible(active);
        if (!active) {
          line.dashOffset(0);
          line.opacity(
            (drawing.animationMode === "flow_pulse" ? 0.3 : 0.85) *
              (drawing.opacity ?? 1),
          );
          line.strokeWidth(drawing.strokeWidth + 1);
        }
      });
      edgesLayerRef.current?.batchDraw();
      nodesLayerRef.current?.batchDraw();
      if (!active) return;

      animationStartedAtRef.current = performance.now();
      const drawFrame = (now: number) => {
        if (!dragActiveRef.current) {
          const elapsed = now - animationStartedAtRef.current;
          animatedHandles.forEach((handle) =>
            handle.setAnimationFrame(elapsed),
          );
          animatedFreehands.forEach(({ line, drawing }) => {
            const speed = drawing.animationSpeed ?? 1;
            if (drawing.animationMode === "flow_pulse") {
              const pulse = (Math.sin(elapsed * speed * 0.006) + 1) / 2;
              line.opacity((0.15 + pulse * 0.6) * (drawing.opacity ?? 1));
              line.strokeWidth(drawing.strokeWidth + pulse * 2);
              return;
            }
            const direction =
              drawing.animationDirection === "reverse" ? -1 : 1;
            line.dashOffset(-((elapsed * speed) / 35) * direction);
          });
          edgesLayerRef.current?.batchDraw();
          nodesLayerRef.current?.batchDraw();
        }
        animationFrameRef.current = window.requestAnimationFrame(drawFrame);
      };
      animationFrameRef.current = window.requestAnimationFrame(drawFrame);
    };

    updateAnimationState();
    document.addEventListener("visibilitychange", updateAnimationState);
    reducedMotion.addEventListener("change", updateAnimationState);
    return () => {
      stopAnimationFrame();
      document.removeEventListener("visibilitychange", updateAnimationState);
      reducedMotion.removeEventListener("change", updateAnimationState);
    };
  }, [animationsEnabled, diagram.edges, diagram.id, diagram.nodes]);

  useEffect(() => {
    const activeEdgeIds = new Set(diagram.edges.map((edge) => edge.id));
    edgeRefCallbacks.current.forEach((_, edgeId) => {
      if (!activeEdgeIds.has(edgeId)) edgeRefCallbacks.current.delete(edgeId);
    });
    edgeRefs.current.forEach((_, edgeId) => {
      if (!activeEdgeIds.has(edgeId)) edgeRefs.current.delete(edgeId);
    });
  }, [diagram.edges]);

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

  const applyRemoteNodePositions = useCallback(
    (positions: Readonly<Record<string, { x: number; y: number }>>) => {
      const applied = new Map<string, { x: number; y: number }>();
      Object.entries(positions).forEach(([nodeId, position]) => {
        if (!nodeMap.has(nodeId) || dragSnapshot.current.has(nodeId)) return;
        remoteNodePositionsRef.current.set(nodeId, position);
        nodeRefs.current.get(nodeId)?.position(position);
        applied.set(nodeId, position);
      });
      if (applied.size === 0) return;
      updateConnectedEdgeGeometry(applied);
      boundaryLayerRef.current?.batchDraw();
      nodesLayerRef.current?.batchDraw();
      edgesLayerRef.current?.batchDraw();
    },
    [nodeMap, updateConnectedEdgeGeometry],
  );

  const clearRemoteNodePositions = useCallback(
    (nodeIds: readonly string[]) => {
      const canonical = new Map<string, { x: number; y: number }>();
      nodeIds.forEach((nodeId) => {
        remoteNodePositionsRef.current.delete(nodeId);
        if (dragSnapshot.current.has(nodeId)) return;
        const node = nodeMap.get(nodeId);
        if (!node) return;
        const position = { x: node.x, y: node.y };
        nodeRefs.current.get(nodeId)?.position(position);
        canonical.set(nodeId, position);
      });
      if (canonical.size === 0) return;
      updateConnectedEdgeGeometry(canonical);
      boundaryLayerRef.current?.batchDraw();
      nodesLayerRef.current?.batchDraw();
      edgesLayerRef.current?.batchDraw();
    },
    [nodeMap, updateConnectedEdgeGeometry],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitToScreen,
      resetViewport,
      zoomBy,
      getVisibleCenter,
      startInlineEdit: (nodeId) => beginInlineLabelEditRef.current(nodeId),
      applyRemoteNodePositions,
      clearRemoteNodePositions,
    }),
    [
      applyRemoteNodePositions,
      clearRemoteNodePositions,
      fitToScreen,
      getVisibleCenter,
      resetViewport,
      zoomBy,
    ],
  );

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    if (
      preview ||
      selectedNodeIds.length !== 1 ||
      remotelyDraggedNodeIds.has(selectedNodeIds[0])
    ) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }
    const selected = nodeMap.get(selectedNodeIds[0]);
    const selectedRef = nodeRefs.current.get(selectedNodeIds[0]);
    if (
      !selected ||
      !selectedRef ||
      selected.locked ||
      selected.type === "freehand"
    ) {
      transformer.nodes([]);
    } else {
      transformer.nodes([selectedRef]);
    }
    transformer.getLayer()?.batchDraw();
  }, [
    diagram.nodes,
    nodeMap,
    preview,
    remotelyDraggedNodeIds,
    selectedNodeIds,
  ]);

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

  const beginMarqueeSelection = useCallback(
    (stage: Konva.Stage, additive: boolean) => {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const start = worldPoint(pointer, {
        x: stage.x(),
        y: stage.y(),
        zoom: stage.scaleX(),
      });
      marqueeDraftRef.current = { start, end: start, additive };
      marqueeRef.current?.position(start);
      marqueeRef.current?.size({ width: 0, height: 0 });
      marqueeRef.current?.visible(true);
      interactionLayerRef.current?.batchDraw();
    },
    [],
  );

  const updateMarqueeSelection = useCallback((stage: Konva.Stage) => {
    const draft = marqueeDraftRef.current;
    const pointer = stage.getPointerPosition();
    if (!draft || !pointer) return false;
    const end = worldPoint(pointer, {
      x: stage.x(),
      y: stage.y(),
      zoom: stage.scaleX(),
    });
    draft.end = end;
    const x = Math.min(draft.start.x, end.x);
    const y = Math.min(draft.start.y, end.y);
    marqueeRef.current?.position({ x, y });
    marqueeRef.current?.size({
      width: Math.abs(end.x - draft.start.x),
      height: Math.abs(end.y - draft.start.y),
    });
    interactionLayerRef.current?.batchDraw();
    return true;
  }, []);

  const finishMarqueeSelection = useCallback(() => {
    const draft = marqueeDraftRef.current;
    if (!draft) return false;
    marqueeDraftRef.current = null;
    marqueeRef.current?.visible(false);
    interactionLayerRef.current?.batchDraw();

    const left = Math.min(draft.start.x, draft.end.x);
    const top = Math.min(draft.start.y, draft.end.y);
    const right = Math.max(draft.start.x, draft.end.x);
    const bottom = Math.max(draft.start.y, draft.end.y);
    const moved =
      Math.hypot(
        draft.end.x - draft.start.x,
        draft.end.y - draft.start.y,
      ) * viewport.zoom >=
      4;
    if (!moved) {
      if (!draft.additive) onClearSelection();
      return true;
    }

    const nodeIds = visibleNodes
      .filter((node) => {
        const nodeRight = node.x + node.width;
        const nodeBottom = node.y + node.height;
        if (isBoundaryNode(node)) {
          return (
            node.x >= left &&
            node.y >= top &&
            nodeRight <= right &&
            nodeBottom <= bottom
          );
        }
        return !(
          nodeRight < left ||
          node.x > right ||
          nodeBottom < top ||
          node.y > bottom
        );
      })
      .map((node) => node.id);
    onSelectNodes(nodeIds, draft.additive ? "add" : "replace");
    return true;
  }, [onClearSelection, onSelectNodes, viewport.zoom, visibleNodes]);

  useEffect(() => {
    if (activeTool === "select") return;
    marqueeDraftRef.current = null;
    marqueeRef.current?.visible(false);
    interactionLayerRef.current?.batchDraw();
  }, [activeTool]);

  const cancelDraftStroke = useCallback(() => {
    draftStrokeRef.current = null;
    draftStrokeLineRef.current?.points([]);
    draftStrokeLineRef.current?.visible(false);
    interactionLayerRef.current?.batchDraw();
  }, []);

  useEffect(() => {
    if (activeTool !== "draw" || preview) cancelDraftStroke();
  }, [activeTool, cancelDraftStroke, preview]);

  const beginFreehandStroke = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent>) => {
      if (
        preview ||
        activeTool !== "draw" ||
        spacePanningRef.current ||
        event.evt.pointerType === "touch" ||
        (event.evt.pointerType === "mouse" && event.evt.button !== 0)
      ) {
        return;
      }
      const stage = event.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (!stage || !pointer) return;
      event.cancelBubble = true;
      stage.draggable(false);
      onClearSelection();
      const point = worldPoint(pointer, {
        x: stage.x(),
        y: stage.y(),
        zoom: stage.scaleX(),
      });
      draftStrokeRef.current = [point];
      draftStrokeLineRef.current?.points([point.x, point.y]);
      draftStrokeLineRef.current?.visible(true);
      interactionLayerRef.current?.batchDraw();
    },
    [activeTool, onClearSelection, preview],
  );

  const updateFreehandStroke = useCallback(
    (event: Konva.KonvaEventObject<PointerEvent>) => {
      const points = draftStrokeRef.current;
      if (!points || event.evt.pointerType === "touch") return;
      const stage = event.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (!stage || !pointer) return;
      const point = worldPoint(pointer, {
        x: stage.x(),
        y: stage.y(),
        zoom: stage.scaleX(),
      });
      const previous = points.at(-1);
      if (
        previous &&
        Math.hypot(point.x - previous.x, point.y - previous.y) *
          stage.scaleX() <
          1.5
      ) {
        return;
      }
      points.push(point);
      draftStrokeLineRef.current?.points(
        points.flatMap((entry) => [entry.x, entry.y]),
      );
      interactionLayerRef.current?.batchDraw();
    },
    [],
  );

  const finishFreehandStroke = useCallback(() => {
    const points = draftStrokeRef.current;
    if (!points) return;
    cancelDraftStroke();
    if (points.length >= 2) onAddFreehand?.(points);
  }, [cancelDraftStroke, onAddFreehand]);

  useEffect(() => {
    const finish = () => finishFreehandStroke();
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };
  }, [finishFreehandStroke]);

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
        wheelCommitTimerRef.current = null;
      }
      const pending = pendingWheelViewportRef.current;
      pendingWheelViewportRef.current = null;
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

  const getObjectSnappedPosition = useCallback(
    (
      nodeId: string,
      position: { x: number; y: number },
    ): { x: number; y: number } => {
      if (!snapToObjects) return position;
      const dragged = nodeMap.get(nodeId);
      if (!dragged) return position;
      return snapSystemDesignNodeToObjects(
        dragged,
        position,
        visibleNodes,
        {
          threshold: 6 / viewport.zoom,
          ignoredNodeIds: new Set(dragSnapshot.current.keys()),
        },
      );
    },
    [nodeMap, snapToObjects, viewport.zoom, visibleNodes],
  );

  const handleDragStart = useCallback(
    (nodeId: string) => {
      if (remotelyDraggedNodeIds.has(nodeId)) return;
      dragActiveRef.current = true;
      const activeIds = selectedNodeIds.includes(nodeId)
        ? selectedNodeIds
        : [nodeId];
      if (!selectedNodeIds.includes(nodeId)) onSelectNode(nodeId, false);
      dragSnapshot.current = new Map(
        activeIds.flatMap((id) => {
          const node = nodeMap.get(id);
          return node && !node.locked && !remotelyDraggedNodeIds.has(id)
            ? [[id, { x: node.x, y: node.y }] as const]
            : [];
        }),
      );
      liftDragVisuals([...dragSnapshot.current.keys()]);
      onNodeDragStart?.([...dragSnapshot.current.keys()]);
      startSystemDesignDragMeasurement(dragSnapshot.current.size);
    },
    [
      liftDragVisuals,
      nodeMap,
      onNodeDragStart,
      onSelectNode,
      remotelyDraggedNodeIds,
      selectedNodeIds,
    ],
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
      group.position(
        getObjectSnappedPosition(nodeId, {
          x: group.x(),
          y: group.y(),
        }),
      );
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
      onNodeDragPreview?.(
        [...positions].map(([id, position]) => ({ id, ...position })),
      );
      scheduleAlignmentGuides(nodeId, group);
      group.getLayer()?.batchDraw();
    },
    [
      getObjectSnappedPosition,
      onNodeDragPreview,
      scheduleAlignmentGuides,
      snapToGrid,
      updateConnectedEdgeGeometry,
    ],
  );

  const handleDragEnd = useCallback(
    (nodeId: string, group: Konva.Group) => {
      const origin = dragSnapshot.current.get(nodeId);
      if (!origin) {
        dragActiveRef.current = false;
        hideAlignmentGuides();
        restoreDragVisuals();
        const changes = [{ id: nodeId, x: group.x(), y: group.y() }];
        onNodeDragPreview?.(changes);
        onNodeDragEnd?.([nodeId]);
        onMoveNodes(changes);
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
      dragActiveRef.current = false;
      hideAlignmentGuides();
      restoreDragVisuals();
      onNodeDragPreview?.(changes);
      onNodeDragEnd?.(changes.map((change) => change.id));
      onMoveNodes(changes);
      requestSystemDesignDragMeasurementFinish();
    },
    [
      hideAlignmentGuides,
      onMoveNodes,
      onNodeDragEnd,
      onNodeDragPreview,
      restoreDragVisuals,
    ],
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
      setEditingEdgeId(null);
      setEditingEdgeLabel("");
      setEditingNodeId(nodeId);
      setEditingLabel(node.label);
    },
    [nodeMap, onEditNodeLabel, onSelectNode, preview],
  );
  beginInlineLabelEditRef.current = beginInlineLabelEdit;

  const finishInlineLabelEdit = useCallback(
    (commit: boolean) => {
      if (commit && editingNodeId && onEditNodeLabel) {
        const current = nodeMap.get(editingNodeId);
        const label =
          current && MULTILINE_INLINE_EDIT_NODE_TYPES.has(current.type)
            ? editingLabel.replace(/\r\n?/g, "\n")
            : editingLabel.trim();
        if (label.trim() && current && label !== current.label) {
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
  const usesMultilineInlineEditor =
    editingNode !== null &&
    MULTILINE_INLINE_EDIT_NODE_TYPES.has(editingNode.type);

  const beginInlineEdgeLabelEdit = useCallback(
    (edgeId: string) => {
      const edge = edgeMap.get(edgeId);
      if (!edge || preview || !onEditEdgeLabel) return;
      onSelectEdge(edgeId, false);
      setEditingNodeId(null);
      setEditingLabel("");
      setEditingEdgeId(edgeId);
      setEditingEdgeLabel(edge.label ?? "");
    },
    [edgeMap, onEditEdgeLabel, onSelectEdge, preview],
  );

  const finishInlineEdgeLabelEdit = useCallback(
    (commit: boolean) => {
      if (commit && editingEdgeId && onEditEdgeLabel) {
        const current = edgeMap.get(editingEdgeId);
        const label = editingEdgeLabel.trim();
        if (current && label !== (current.label ?? "")) {
          onEditEdgeLabel(editingEdgeId, label);
        }
      }
      setEditingEdgeId(null);
      setEditingEdgeLabel("");
    }, [edgeMap, editingEdgeId, editingEdgeLabel, onEditEdgeLabel]);

  useEffect(() => {
    if (editingEdgeId && !edgeMap.has(editingEdgeId)) {
      setEditingEdgeId(null);
      setEditingEdgeLabel("");
    }
  }, [edgeMap, editingEdgeId]);

  const editingEdge = editingEdgeId
    ? edgeMap.get(editingEdgeId) ?? null
    : null;
  const editingEdgeSource = editingEdge
    ? nodeMap.get(editingEdge.sourceNodeId)
    : undefined;
  const editingEdgeTarget = editingEdge
    ? nodeMap.get(editingEdge.targetNodeId)
    : undefined;
  const editingEdgePosition =
    editingEdge && editingEdgeSource && editingEdgeTarget
      ? (() => {
          const start = getNodePortPosition(
            editingEdgeSource,
            editingEdge.sourcePort,
          );
          const end = getNodePortPosition(
            editingEdgeTarget,
            editingEdge.targetPort,
          );
          const position = editingEdge.labelPosition ?? 0.5;
          return {
            x: start.x + (end.x - start.x) * position,
            y: start.y + (end.y - start.y) * position,
          };
        })()
      : null;

  return (
    <div
      ref={containerRef}
      data-testid="system-design-canvas"
      className="relative h-full min-h-0 w-full overflow-hidden bg-background focus-within:outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent"
      data-active-tool={activeTool}
      data-space-panning={spacePanning ? "true" : "false"}
      data-viewport-x={viewport.x}
      data-viewport-y={viewport.y}
      data-viewport-zoom={viewport.zoom}
      role="application"
      aria-label="System design diagram canvas"
      tabIndex={0}
      style={{ touchAction: "none" }}
      onPointerEnter={() => {
        pointerOverCanvasRef.current = true;
      }}
      onPointerLeave={() => {
        pointerOverCanvasRef.current = false;
      }}
      onPointerDownCapture={(event) => {
        if (!preview && event.target instanceof HTMLElement) {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
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
        shortcuts are available from the Help button. Hold Space and drag to
        pan the canvas temporarily.
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
          draggable={preview || activeTool === "pan" || spacePanning}
          onWheel={handleWheel}
          onPointerDown={beginFreehandStroke}
          onPointerMove={updateFreehandStroke}
          onPointerUp={finishFreehandStroke}
          onPointerCancel={finishFreehandStroke}
          onDragStart={(event) => {
            if (event.target !== event.target.getStage()) return;
            const container = stageRef.current?.container();
            if (container) container.style.cursor = "grabbing";
          }}
          onMouseDown={(event) => {
            const stage = event.target.getStage();
            if (!stage) return;
            const isEmptyCanvas = event.target === stage;
            if (spacePanningRef.current) {
              stage.draggable(true);
              return;
            }
            if (preview) {
              stage.draggable(isEmptyCanvas && !connection);
              return;
            }
            if (activeTool === "pan") {
              stage.draggable(true);
              return;
            }
            stage.draggable(false);
            if (isEmptyCanvas && activeTool === "select") {
              beginMarqueeSelection(stage, event.evt.shiftKey);
            } else if (isEmptyCanvas) {
              onClearSelection();
            }
          }}
          onTouchStart={(event) => {
            const stage = event.target.getStage();
            if (!stage) return;
            const isEmptyCanvas = event.target === stage;
            const touches = event.evt.touches;
            if (touches.length >= 2) {
              stage.stopDrag();
              stage.draggable(false);
              const bounds = stage.container().getBoundingClientRect();
              const first = touches[0];
              const second = touches[1];
              lastPinchDistanceRef.current = Math.hypot(
                second.clientX - first.clientX,
                second.clientY - first.clientY,
              );
              lastPinchCenterRef.current = {
                x: (first.clientX + second.clientX) / 2 - bounds.left,
                y: (first.clientY + second.clientY) / 2 - bounds.top,
              };
              return;
            }
            stage.draggable(
              (preview || activeTool === "pan" || activeTool === "draw") &&
                isEmptyCanvas &&
                !connection,
            );
            if (isEmptyCanvas && activeTool !== "pan") onClearSelection();
          }}
          onMouseMove={(event) => {
            if (spacePanningRef.current) return;
            const stage = event.target.getStage();
            if (stage && updateMarqueeSelection(stage)) return;
            const pointer = stage?.getPointerPosition();
            if (!pointer) return;
            updateConnectionPointer(pointer);
          }}
          onTouchMove={(event) => {
            const stage = event.target.getStage();
            if (!stage) return;
            const touches = event.evt.touches;
            if (
              touches.length >= 2 &&
              lastPinchDistanceRef.current !== null &&
              lastPinchCenterRef.current
            ) {
              event.evt.preventDefault();
              const bounds = stage.container().getBoundingClientRect();
              const first = touches[0];
              const second = touches[1];
              const distance = Math.hypot(
                second.clientX - first.clientX,
                second.clientY - first.clientY,
              );
              const center = {
                x: (first.clientX + second.clientX) / 2 - bounds.left,
                y: (first.clientY + second.clientY) / 2 - bounds.top,
              };
              const currentViewport = {
                x: stage.x(),
                y: stage.y(),
                zoom: stage.scaleX(),
              };
              const anchoredWorldPoint = worldPoint(
                lastPinchCenterRef.current,
                currentViewport,
              );
              const zoom = clampZoom(
                currentViewport.zoom *
                  (distance / lastPinchDistanceRef.current),
              );
              const nextViewport = {
                x: center.x - anchoredWorldPoint.x * zoom,
                y: center.y - anchoredWorldPoint.y * zoom,
                zoom,
              };
              stage.position({ x: nextViewport.x, y: nextViewport.y });
              stage.scale({ x: zoom, y: zoom });
              stage.batchDraw();
              pendingTouchViewportRef.current = nextViewport;
              lastPinchDistanceRef.current = distance;
              lastPinchCenterRef.current = center;
              return;
            }
            const pointer = stage.getPointerPosition();
            if (!pointer) return;
            updateConnectionPointer(pointer);
          }}
          onMouseUp={(event) => {
            const stage = event.target.getStage();
            if (!spacePanningRef.current) finishMarqueeSelection();
            stage?.draggable(
              preview || activeTool === "pan" || spacePanningRef.current,
            );
            if (connectionRef.current) clearConnection();
          }}
          onTouchEnd={(event) => {
            const stage = event.target.getStage();
            lastPinchDistanceRef.current = null;
            lastPinchCenterRef.current = null;
            const pendingTouchViewport = pendingTouchViewportRef.current;
            pendingTouchViewportRef.current = null;
            if (pendingTouchViewport) setViewport(pendingTouchViewport);
            stage?.draggable(
              preview || activeTool === "pan" || activeTool === "draw",
            );
            if (connectionRef.current) clearConnection();
          }}
          onDragEnd={(event) => {
            if (event.target !== event.target.getStage()) return;
            const container = stageRef.current?.container();
            if (container) {
              container.style.cursor =
                preview || activeTool === "pan" || spacePanningRef.current
                  ? "grab"
                  : activeTool === "connect" || activeTool === "draw"
                    ? "crosshair"
                    : "default";
            }
            event.target.draggable(
              preview || activeTool === "pan" || spacePanningRef.current,
            );
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
          <Layer
            ref={boundaryLayerRef}
            listening={
              !spacePanning &&
              (preview || (activeTool !== "pan" && activeTool !== "draw"))
            }
          >
            {boundaryNodes.map((node) => (
              <SystemDesignNodeRenderer
                key={node.id}
                node={node}
                selected={selectedNodeIds.includes(node.id)}
                transformerOwnsSelection={
                  !preview &&
                  selectedNodeIds.length === 1 &&
                  selectedNodeIds[0] === node.id &&
                  !node.locked &&
                  !remotelyDraggedNodeIds.has(node.id) &&
                  node.type !== "freehand"
                }
                dragDisabled={remotelyDraggedNodeIds.has(node.id)}
                positionOverride={
                  remotelyDraggedNodeIds.has(node.id)
                    ? remoteNodePositionsRef.current.get(node.id)
                    : undefined
                }
                connecting={
                  !spacePanning &&
                  (activeTool === "connect" ||
                  connection?.sourceNodeId === node.id
                  )
                }
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
          <Layer
            ref={edgesLayerRef}
            listening={
              !spacePanning &&
              (preview || (activeTool !== "pan" && activeTool !== "draw"))
            }
          >
            {diagram.edges.map((edge) => {
              const source = nodeMap.get(edge.sourceNodeId);
              const target = nodeMap.get(edge.targetNodeId);
              if (!source || !target) return null;
              return (
                <SystemDesignEdgeRenderer
                  key={edge.id}
                  ref={getEdgeRefCallback(edge.id)}
                  edge={edge}
                  source={source}
                  target={target}
                  selected={selectedEdgeIds.includes(edge.id)}
                  preview={preview}
                  theme={theme}
                  onSelect={onSelectEdge}
                  onEditLabel={beginInlineEdgeLabelEdit}
                />
              );
            })}
          </Layer>
          <Layer
            ref={nodesLayerRef}
            listening={
              !spacePanning &&
              (preview || (activeTool !== "pan" && activeTool !== "draw"))
            }
          >
            {foregroundNodes.map((node) => (
              <SystemDesignNodeRenderer
                key={node.id}
                node={node}
                selected={selectedNodeIds.includes(node.id)}
                transformerOwnsSelection={
                  !preview &&
                  selectedNodeIds.length === 1 &&
                  selectedNodeIds[0] === node.id &&
                  !node.locked &&
                  !remotelyDraggedNodeIds.has(node.id) &&
                  node.type !== "freehand"
                }
                dragDisabled={remotelyDraggedNodeIds.has(node.id)}
                positionOverride={
                  remotelyDraggedNodeIds.has(node.id)
                    ? remoteNodePositionsRef.current.get(node.id)
                    : undefined
                }
                connecting={
                  !spacePanning &&
                  (activeTool === "connect" ||
                  connection?.sourceNodeId === node.id
                  )
                }
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
          <Layer ref={interactionLayerRef} listening={!spacePanning}>
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
              ref={draftStrokeLineRef}
              visible={false}
              points={[]}
              stroke={theme.foreground}
              strokeWidth={3}
              opacity={1}
              lineCap="round"
              lineJoin="round"
              tension={0.35}
              listening={false}
              perfectDrawEnabled={false}
            />
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
            <Rect
              ref={marqueeRef}
              visible={false}
              fill={theme.accent}
              opacity={0.12}
              stroke={theme.accent}
              strokeWidth={1}
              strokeScaleEnabled={false}
              listening={false}
              perfectDrawEnabled={false}
            />
            {!preview && activeTool === "select" && !spacePanning && (
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                keepRatio={
                  nodeMap.get(selectedNodeIds[0])?.type === "image"
                }
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
          {editingEdge && editingEdgePosition && (
            <input
              autoFocus
              data-testid="system-design-inline-edge-label-input"
              aria-label={`Edit connection label${editingEdge.label ? ` ${editingEdge.label}` : ""}`}
              placeholder="Connection label"
              className="absolute z-30 rounded border border-accent bg-surface px-2 text-center text-xs font-semibold text-foreground shadow-xl outline-none ring-2 ring-accent/30"
              style={{
                left: editingEdgePosition.x * viewport.zoom + viewport.x,
                top: editingEdgePosition.y * viewport.zoom + viewport.y,
                width: 200,
                height: 34,
                transform: "translate(-50%, -50%)",
              }}
              value={editingEdgeLabel}
              onChange={(event) => setEditingEdgeLabel(event.target.value)}
              onBlur={() => finishInlineEdgeLabelEdit(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  finishInlineEdgeLabelEdit(true);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  finishInlineEdgeLabelEdit(false);
                }
              }}
            />
          )}
          {editingNode && usesMultilineInlineEditor && (
            <textarea
              autoFocus
              data-testid="system-design-inline-text-input"
              aria-label={`Edit ${editingNode.label}`}
              className="absolute z-30 resize-none rounded border border-accent bg-surface px-3 py-2 text-sm leading-5 text-foreground shadow-xl outline-none ring-2 ring-accent/30"
              style={{
                left: editingNode.x * viewport.zoom + viewport.x,
                top: editingNode.y * viewport.zoom + viewport.y,
                width: Math.max(160, editingNode.width * viewport.zoom),
                height: Math.max(72, editingNode.height * viewport.zoom),
              }}
              value={editingLabel}
              onChange={(event) => setEditingLabel(event.target.value)}
              onBlur={() => finishInlineLabelEdit(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  finishInlineLabelEdit(true);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  finishInlineLabelEdit(false);
                }
              }}
            />
          )}
          {editingNode && !usesMultilineInlineEditor && (
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
