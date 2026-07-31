"use client";

import { memo } from "react";
import { Group, Path, Rect } from "react-konva";
import {
  SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS,
  resolveSystemDesignTechnology,
  type SystemDesignTechnologyVisual,
} from "../constants/system-design-visual-registry";

interface SystemDesignTechnologyMarkProps {
  technology: unknown;
  x?: number;
  y?: number;
  size?: number;
}

/**
 * A canvas-safe brand mark. All drawing is local Konva vector content and the
 * registry is closed, so no remote image can be injected through diagram data.
 */
export const SystemDesignTechnologyMark = memo(function SystemDesignTechnologyMark({
  technology,
  x = 0,
  y = 0,
  size = 20,
}: SystemDesignTechnologyMarkProps) {
  const definition = resolveSystemDesignTechnology(technology);
  if (!definition) return null;
  const brand = SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS[definition.id];
  const glyphSize = size * 0.72;
  const glyphScale = glyphSize / 24;

  return (
    <Group x={x} y={y} width={size} height={size} listening={false}>
      <Rect
        width={size}
        height={size}
        cornerRadius={Math.max(4, size * 0.26)}
        fill={definition.color}
        perfectDrawEnabled={false}
      />
      <Path
        x={(size - glyphSize) / 2}
        y={(size - glyphSize) / 2}
        data={brand.path}
        scaleX={glyphScale}
        scaleY={glyphScale}
        fill={brand.style === "fill" ? definition.onColor : undefined}
        stroke={brand.style === "stroke" ? definition.onColor : undefined}
        strokeWidth={brand.style === "stroke" ? 2 : 0}
        lineCap="round"
        lineJoin="round"
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
});

interface SystemDesignTechnologyIconProps {
  technology: unknown;
  className?: string;
  showName?: boolean;
}

export const SystemDesignTechnologyIcon = memo(function SystemDesignTechnologyIcon({
  technology,
  className = "",
  showName = false,
}: SystemDesignTechnologyIconProps) {
  const definition = resolveSystemDesignTechnology(technology);
  if (!definition) return null;
  const brand = SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS[definition.id];

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={definition.name}
      aria-label={definition.name}
    >
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[8px] font-bold"
        style={{
          backgroundColor: definition.color,
          color: definition.onColor,
        }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill={brand.style === "fill" ? "currentColor" : "none"}
          stroke={brand.style === "stroke" ? "currentColor" : "none"}
          strokeWidth={brand.style === "stroke" ? 2 : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={brand.path} />
        </svg>
      </span>
      {showName && (
        <span className="truncate text-xs">{definition.shortName}</span>
      )}
    </span>
  );
});

export function getSystemDesignTechnologyAriaLabel(
  technology: unknown,
): string | undefined {
  return (resolveSystemDesignTechnology(technology) as
    | SystemDesignTechnologyVisual
    | null)?.name;
}
