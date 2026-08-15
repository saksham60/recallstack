import type {
  DiagramConnectorElement,
  DiagramElement,
  DiagramPoint,
  DiagramPortSide,
  DiagramPositionedElement,
  DiagramRect,
} from "../types";
import { isDiagramPositionedElement } from "../types";
import type { DiagramRegistry } from "../registry";

export function rotatePoint(point: DiagramPoint, center: DiagramPoint, degrees: number): DiagramPoint {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

export function elementCenter(element: DiagramPositionedElement): DiagramPoint {
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}

export function portPoint(element: DiagramPositionedElement, side: DiagramPortSide, offset = 0.5): DiagramPoint {
  const base = side === "top"
    ? { x: element.x + element.width * offset, y: element.y }
    : side === "right"
      ? { x: element.x + element.width, y: element.y + element.height * offset }
      : side === "bottom"
        ? { x: element.x + element.width * offset, y: element.y + element.height }
        : { x: element.x, y: element.y + element.height * offset };
  return rotatePoint(base, elementCenter(element), element.rotation);
}

export function resolvePortPoint(
  element: DiagramPositionedElement,
  portId: string,
  registry: DiagramRegistry,
): DiagramPoint {
  if (element.kind !== "shape") return elementCenter(element);
  const definition = registry.getShape(element.shapeDefinitionId);
  const port = definition?.ports.find((candidate) => candidate.id === portId) ?? definition?.ports[0];
  return port ? portPoint(element, port.side, port.offset) : elementCenter(element);
}

export function connectorPoints(
  connector: DiagramConnectorElement,
  elements: ReadonlyMap<string, DiagramElement>,
  registry: DiagramRegistry,
): DiagramPoint[] {
  const source = elements.get(connector.source.elementId);
  const target = elements.get(connector.target.elementId);
  if (!source || !target || !isDiagramPositionedElement(source) || !isDiagramPositionedElement(target)) return [];
  const start = resolvePortPoint(source, connector.source.portId, registry);
  const end = resolvePortPoint(target, connector.target.portId, registry);
  if (connector.waypoints.length) return [start, ...connector.waypoints, end];
  if (connector.routing === "curved") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const bend = Math.min(72, length * 0.18);
    return [start, { x: (start.x + end.x) / 2 - dy / length * bend, y: (start.y + end.y) / 2 + dx / length * bend }, end];
  }
  if (connector.routing === "orthogonal") {
    const midpoint = (start.x + end.x) / 2;
    return [start, { x: midpoint, y: start.y }, { x: midpoint, y: end.y }, end];
  }
  return [start, end];
}

export function positionedBounds(elements: readonly DiagramElement[]): DiagramRect | null {
  const positioned = elements.filter(isDiagramPositionedElement).filter((element) => element.visible);
  if (!positioned.length) return null;
  const left = Math.min(...positioned.map((element) => element.x));
  const top = Math.min(...positioned.map((element) => element.y));
  const right = Math.max(...positioned.map((element) => element.x + element.width));
  const bottom = Math.max(...positioned.map((element) => element.y + element.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function rectContainsRect(container: DiagramRect, target: DiagramRect): boolean {
  return target.x >= container.x && target.y >= container.y && target.x + target.width <= container.x + container.width && target.y + target.height <= container.y + container.height;
}

export function snapValue(value: number, gridSize: number): number {
  return gridSize > 0 ? Math.round(value / gridSize) * gridSize : value;
}

export function fitViewport(bounds: DiagramRect | null, width: number, height: number, padding = 80) {
  if (!bounds || width <= 0 || height <= 0) return { x: 0, y: 0, zoom: 1 };
  const zoom = Math.min(2, Math.max(0.1, Math.min((width - padding * 2) / Math.max(bounds.width, 1), (height - padding * 2) / Math.max(bounds.height, 1))));
  return { x: width / 2 - (bounds.x + bounds.width / 2) * zoom, y: height / 2 - (bounds.y + bounds.height / 2) * zoom, zoom };
}

export function connectorMidpoint(points: readonly DiagramPoint[], position = 0.5): DiagramPoint {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const target = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, Math.min(1, position));
  let traversed = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    if (traversed + lengths[index] >= target) {
      const ratio = lengths[index] ? (target - traversed) / lengths[index] : 0;
      return { x: points[index].x + (points[index + 1].x - points[index].x) * ratio, y: points[index].y + (points[index + 1].y - points[index].y) * ratio };
    }
    traversed += lengths[index];
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}
