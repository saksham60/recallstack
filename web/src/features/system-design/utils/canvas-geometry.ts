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
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  switch (routing) {
    case "straight":
    case "bidirectional":
      return [source.x, source.y, target.x, target.y];
    case "curved": {
      const distance = Math.hypot(deltaX, deltaY);
      if (distance === 0) return [source.x, source.y, target.x, target.y];
      const bend = Math.min(80, Math.max(24, distance * 0.12));
      const middleX = (source.x + target.x) / 2;
      const middleY = (source.y + target.y) / 2;
      return [
        source.x,
        source.y,
        middleX + (-deltaY / distance) * bend,
        middleY + (deltaX / distance) * bend,
        target.x,
        target.y,
      ];
    }
    case "elbow":
      return Math.abs(deltaX) >= Math.abs(deltaY)
        ? [source.x, source.y, target.x, source.y, target.x, target.y]
        : [source.x, source.y, source.x, target.y, target.x, target.y];
    case "orthogonal": {
      const middleX = source.x + deltaX / 2;
      return [
        source.x,
        source.y,
        middleX,
        source.y,
        middleX,
        target.y,
        target.x,
        target.y,
      ];
    }
    case "step": {
      const firstX = source.x + deltaX / 3;
      const secondX = source.x + (deltaX * 2) / 3;
      const middleY = source.y + deltaY / 2;
      return [
        source.x,
        source.y,
        firstX,
        source.y,
        firstX,
        middleY,
        secondX,
        middleY,
        secondX,
        target.y,
        target.x,
        target.y,
      ];
    }
  }
}

export function getSystemDesignPathPoint(
  points: readonly number[],
  requestedPosition: number,
): SystemDesignPoint {
  if (points.length < 4) return { x: points[0] ?? 0, y: points[1] ?? 0 };
  const segments: Array<{
    start: SystemDesignPoint;
    end: SystemDesignPoint;
    length: number;
  }> = [];
  let totalLength = 0;
  for (let index = 0; index <= points.length - 4; index += 2) {
    const start = { x: points[index], y: points[index + 1] };
    const end = { x: points[index + 2], y: points[index + 3] };
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    segments.push({ start, end, length });
    totalLength += length;
  }
  if (totalLength === 0) return segments[0]?.start ?? { x: 0, y: 0 };
  let remaining = Math.min(1, Math.max(0, requestedPosition)) * totalLength;
  for (const segment of segments) {
    if (remaining <= segment.length || segment === segments.at(-1)) {
      const progress = segment.length === 0 ? 0 : remaining / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * progress,
        y: segment.start.y + (segment.end.y - segment.start.y) * progress,
      };
    }
    remaining -= segment.length;
  }
  return segments.at(-1)?.end ?? { x: 0, y: 0 };
}

export function getSystemDesignPathTangent(
  points: readonly number[],
  end: "start" | "end",
): SystemDesignPoint {
  if (points.length < 4) return { x: 1, y: 0 };
  if (end === "start") {
    for (let index = 0; index <= points.length - 4; index += 2) {
      const x = points[index + 2] - points[index];
      const y = points[index + 3] - points[index + 1];
      if (x !== 0 || y !== 0) return { x, y };
    }
  } else {
    for (let index = points.length - 2; index >= 2; index -= 2) {
      const x = points[index] - points[index - 2];
      const y = points[index + 1] - points[index - 1];
      if (x !== 0 || y !== 0) return { x, y };
    }
  }
  return { x: 1, y: 0 };
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
