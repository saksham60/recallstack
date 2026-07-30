import type {
  SystemDesignEdge,
  SystemDesignNode,
  SystemDesignPoint,
  SystemDesignPort,
  SystemDesignRect,
  SystemDesignSize,
  SystemDesignViewport,
} from "../types/system-design.types";
import {
  DEFAULT_SYSTEM_DESIGN_VIEWPORT,
  MAX_ZOOM,
  MIN_ZOOM,
} from "./system-design-defaults";

export function clampSystemDesignZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToSystemDesignPoint(
  point: SystemDesignPoint,
  viewport: SystemDesignViewport,
): SystemDesignPoint {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function systemDesignPointToScreen(
  point: SystemDesignPoint,
  viewport: SystemDesignViewport,
): SystemDesignPoint {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

export function zoomSystemDesignViewportTowardPoint(
  viewport: SystemDesignViewport,
  screenPoint: SystemDesignPoint,
  requestedZoom: number,
): SystemDesignViewport {
  const zoom = clampSystemDesignZoom(requestedZoom);
  const worldPoint = screenToSystemDesignPoint(screenPoint, viewport);
  return {
    x: screenPoint.x - worldPoint.x * zoom,
    y: screenPoint.y - worldPoint.y * zoom,
    zoom,
  };
}

export function getSystemDesignVisibleCenter(
  viewport: SystemDesignViewport,
  viewportSize: SystemDesignSize,
): SystemDesignPoint {
  return screenToSystemDesignPoint(
    { x: viewportSize.width / 2, y: viewportSize.height / 2 },
    viewport,
  );
}

export function getSystemDesignNodeRect(
  node: SystemDesignNode,
): SystemDesignRect {
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
}

export function getSystemDesignPortPosition(
  node: SystemDesignNode,
  port: SystemDesignPort,
): SystemDesignPoint {
  switch (port) {
    case "top":
      return { x: node.x + node.width / 2, y: node.y };
    case "right":
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case "bottom":
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case "left":
      return { x: node.x, y: node.y + node.height / 2 };
  }
}

export function getSystemDesignConnectionPoints(
  source: SystemDesignPoint,
  target: SystemDesignPoint,
  routing: SystemDesignEdge["routing"] = "straight",
): number[] {
  if (routing !== "curved") {
    return [source.x, source.y, target.x, target.y];
  }
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) return [source.x, source.y, target.x, target.y];
  const bend = Math.min(80, Math.max(24, distance * 0.12));
  const middleX = (source.x + target.x) / 2;
  const middleY = (source.y + target.y) / 2;
  const controlX = middleX + (-deltaY / distance) * bend;
  const controlY = middleY + (deltaX / distance) * bend;
  return [
    source.x,
    source.y,
    controlX,
    controlY,
    target.x,
    target.y,
  ];
}

export interface SystemDesignEdgeGeometry {
  source: SystemDesignPoint;
  target: SystemDesignPoint;
  points: number[];
}

export function getSystemDesignEdgeGeometry(
  edge: SystemDesignEdge,
  nodes: readonly SystemDesignNode[],
): SystemDesignEdgeGeometry | null {
  const sourceNode = nodes.find((node) => node.id === edge.sourceNodeId);
  const targetNode = nodes.find((node) => node.id === edge.targetNodeId);
  if (!sourceNode || !targetNode || !sourceNode.visible || !targetNode.visible) {
    return null;
  }
  const source = getSystemDesignPortPosition(sourceNode, edge.sourcePort);
  const target = getSystemDesignPortPosition(targetNode, edge.targetPort);
  return {
    source,
    target,
    points: getSystemDesignConnectionPoints(source, target, edge.routing),
  };
}

export function getSystemDesignNodesBounds(
  nodes: readonly SystemDesignNode[],
): SystemDesignRect | null {
  const visibleNodes = nodes.filter((node) => node.visible);
  if (visibleNodes.length === 0) return null;
  const left = Math.min(...visibleNodes.map((node) => node.x));
  const top = Math.min(...visibleNodes.map((node) => node.y));
  const right = Math.max(
    ...visibleNodes.map((node) => node.x + node.width),
  );
  const bottom = Math.max(
    ...visibleNodes.map((node) => node.y + node.height),
  );
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function fitSystemDesignViewportToNodes(
  nodes: readonly SystemDesignNode[],
  viewportSize: SystemDesignSize,
  padding = 64,
): SystemDesignViewport {
  const bounds = getSystemDesignNodesBounds(nodes);
  if (
    !bounds ||
    viewportSize.width <= padding * 2 ||
    viewportSize.height <= padding * 2
  ) {
    return { ...DEFAULT_SYSTEM_DESIGN_VIEWPORT };
  }
  const widthZoom = (viewportSize.width - padding * 2) / bounds.width;
  const heightZoom = (viewportSize.height - padding * 2) / bounds.height;
  const zoom = clampSystemDesignZoom(Math.min(widthZoom, heightZoom));
  return {
    x:
      (viewportSize.width - bounds.width * zoom) / 2 -
      bounds.x * zoom,
    y:
      (viewportSize.height - bounds.height * zoom) / 2 -
      bounds.y * zoom,
    zoom,
  };
}

export function systemDesignRectsIntersect(
  left: SystemDesignRect,
  right: SystemDesignRect,
): boolean {
  return !(
    left.x + left.width < right.x ||
    right.x + right.width < left.x ||
    left.y + left.height < right.y ||
    right.y + right.height < left.y
  );
}

export function getSystemDesignNodesInRect(
  nodes: readonly SystemDesignNode[],
  rect: SystemDesignRect,
): string[] {
  return nodes
    .filter(
      (node) =>
        node.visible &&
        systemDesignRectsIntersect(getSystemDesignNodeRect(node), rect),
    )
    .map((node) => node.id);
}
