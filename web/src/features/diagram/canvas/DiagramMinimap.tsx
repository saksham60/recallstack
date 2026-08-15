"use client";

import { positionedBounds } from "../core/geometry";
import type { DiagramElement, DiagramViewport } from "../core/types";
import { isDiagramPositionedElement } from "../core/types";

interface Props { elements: readonly DiagramElement[]; viewport: DiagramViewport; canvasWidth: number; canvasHeight: number; onViewportChange: (viewport: DiagramViewport) => void }

export function DiagramMinimap({ elements, viewport, canvasWidth, canvasHeight, onViewportChange }: Props) {
  const bounds = positionedBounds(elements);
  if (!bounds) return null;
  const padding = 24;
  const world = { x: bounds.x - padding, y: bounds.y - padding, width: Math.max(bounds.width + padding * 2, canvasWidth / viewport.zoom), height: Math.max(bounds.height + padding * 2, canvasHeight / viewport.zoom) };
  const scale = Math.min(136 / world.width, 84 / world.height);
  const visible = { x: (-viewport.x / viewport.zoom - world.x) * scale, y: (-viewport.y / viewport.zoom - world.y) * scale, width: canvasWidth / viewport.zoom * scale, height: canvasHeight / viewport.zoom * scale };
  return <button type="button" aria-label="Diagram minimap" title="Click to recenter the canvas" className="absolute bottom-3 right-3 h-[92px] w-[144px] cursor-crosshair overflow-hidden rounded-md border border-zinc-600 bg-zinc-950/95 p-1 shadow-xl transition hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); const worldX = world.x + (event.clientX - rect.left - 4) / scale; const worldY = world.y + (event.clientY - rect.top - 4) / scale; onViewportChange({ ...viewport, x: canvasWidth / 2 - worldX * viewport.zoom, y: canvasHeight / 2 - worldY * viewport.zoom }); }}>
    <svg viewBox={`0 0 ${world.width * scale} ${world.height * scale}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {elements.filter(isDiagramPositionedElement).filter((element) => element.visible).map((element) => <rect key={element.id} x={(element.x - world.x) * scale} y={(element.y - world.y) * scale} width={Math.max(2, element.width * scale)} height={Math.max(2, element.height * scale)} rx="2" fill={element.style?.fill === "transparent" ? "#27272a" : element.style?.fill ?? "#27272a"} stroke={element.style?.stroke ?? "#71717a"} strokeWidth="1" />)}
      <rect x={visible.x} y={visible.y} width={visible.width} height={visible.height} fill="#a78bfa1f" stroke="#a78bfa" strokeWidth="1.5" />
    </svg>
  </button>;
}
