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
  SystemDesignDocument,
  SystemDesignEdge,
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
  getNodePortPosition,
  SystemDesignEdgeRenderer,
} from "./SystemDesignEdgeRenderer";
import {
  SystemDesignNodeRenderer,
  type SystemDesignCanvasTheme,
} from "./SystemDesignNodeRenderer";

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
  document: SystemDesignDocument;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  preview: boolean;
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

export const SystemDesignCanvas = forwardRef<
  SystemDesignCanvasHandle,
  SystemDesignCanvasProps
>(function SystemDesignCanvas(
  {
    document,
    selectedNodeIds,
    selectedEdgeIds,
    preview,
    onSelectNode,
    onSelectEdge,
    onClearSelection,
    onMoveNodes,
    onResizeNode,
    onAddEdge,
    onViewportChange,
    onDropNodeType,
  },
  ref,
) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const dragSnapshot = useRef(new Map<string, { x: number; y: number }>());
  const [dragPositions, setDragPositions] = useState<
    Map<string, { x: number; y: number }> | null
  >(null);
  const [connection, setConnection] = useState<ConnectionDraft | null>(null);
  const connectionRef = useRef<ConnectionDraft | null>(null);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const { viewport } = document;

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
      [...document.nodes]
        .filter((node) => node.visible !== false)
        .sort((a, b) => a.layer - b.layer),
    [document.nodes],
  );
  const nodeMap = useMemo(
    () => new Map(visibleNodes.map((node) => [node.id, node])),
    [visibleNodes],
  );
  const renderedNodeMap = useMemo(() => {
    if (!dragPositions) return nodeMap;
    const rendered = new Map(nodeMap);
    dragPositions.forEach((position, id) => {
      const node = rendered.get(id);
      if (node) rendered.set(id, { ...node, ...position });
    });
    return rendered;
  }, [dragPositions, nodeMap]);

  const getVisibleCenter = useCallback(
    () =>
      worldPoint(
        { x: size.width / 2, y: size.height / 2 },
        document.viewport,
      ),
    [document.viewport, size.height, size.width],
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
  }, [document.nodes, nodeMap, preview, selectedNodeIds]);

  const gridLines = useMemo(() => {
    if (size.width === 0 || size.height === 0) return [];
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
    viewport.x,
    viewport.y,
    viewport.zoom,
  ]);

  const handleWheel = useCallback(
    (event: Konva.KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault();
      const stage = event.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (!stage || !pointer) return;
      const pointerWorld = worldPoint(pointer, viewport);
      const direction = event.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
      const nextZoom = clampZoom(viewport.zoom * direction);
      setViewport({
        x: pointer.x - pointerWorld.x * nextZoom,
        y: pointer.y - pointerWorld.y * nextZoom,
        zoom: nextZoom,
      });
    },
    [setViewport, viewport],
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
      setDragPositions(null);
    },
    [nodeMap, onSelectNode, selectedNodeIds],
  );

  const handleDragMove = useCallback(
    (nodeId: string, group: Konva.Group) => {
      const origin = dragSnapshot.current.get(nodeId);
      if (!origin) return;
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
      setDragPositions(positions);
      group.getLayer()?.batchDraw();
    },
    [],
  );

  const handleDragEnd = useCallback(
    (nodeId: string, group: Konva.Group) => {
      const origin = dragSnapshot.current.get(nodeId);
      if (!origin) {
        onMoveNodes([{ id: nodeId, x: group.x(), y: group.y() }]);
        setDragPositions(null);
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
      onMoveNodes(changes);
      setDragPositions(null);
    },
    [onMoveNodes],
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
    ) => onResizeNode({ id, ...frame }),
    [onResizeNode],
  );

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
        onDropNodeType(
          type,
          worldPoint(
            { x: event.clientX - rect.left, y: event.clientY - rect.top },
            viewport,
          ),
        );
      }}
    >
      <span className="sr-only">
        Use the component palette and inspector to edit the diagram. Keyboard
        shortcuts are available from the Help button.
      </span>
      {size.width > 0 && size.height > 0 && (
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
            if (!connection) return;
            const pointer = event.target.getStage()?.getPointerPosition();
            if (!pointer) return;
            setConnection((current) =>
              current
                ? (() => {
                    const next = {
                      ...current,
                      end: worldPoint(pointer, viewport),
                    };
                    connectionRef.current = next;
                    return next;
                  })()
                : null,
            );
          }}
          onTouchMove={(event) => {
            if (!connection) return;
            const pointer = event.target.getStage()?.getPointerPosition();
            if (!pointer) return;
            setConnection((current) =>
              current
                ? (() => {
                    const next = {
                      ...current,
                      end: worldPoint(pointer, viewport),
                    };
                    connectionRef.current = next;
                    return next;
                  })()
                : null,
            );
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
          <Layer>
            {document.edges.map((edge) => {
              const source = renderedNodeMap.get(edge.sourceNodeId);
              const target = renderedNodeMap.get(edge.targetNodeId);
              if (!source || !target) return null;
              return (
                <SystemDesignEdgeRenderer
                  key={edge.id}
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
            {connection && (
              <Arrow
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
          </Layer>
          <Layer>
            {visibleNodes.map((node) => (
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
              />
            ))}
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
          </Layer>
          {visibleNodes.length === 0 && (
            <Layer listening={false}>
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
            </Layer>
          )}
        </Stage>
      )}
    </div>
  );
});
