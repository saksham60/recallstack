"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Image as KonvaImage, Rect, Text } from "react-konva";
import type { DiagramShapeRendererProps } from "../../core/types";

const imageCache = new Map<string, HTMLImageElement>();

function iconSource(definition: DiagramShapeRendererProps["definition"]): string | null {
  if (!definition.iconComponent) return null;
  const svg = renderToStaticMarkup(createElement(definition.iconComponent, { width: 64, height: 64, "aria-hidden": true }));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function useCloudIcon(definition: DiagramShapeRendererProps["definition"]): HTMLImageElement | null {
  const source = useMemo(() => iconSource(definition), [definition]);
  const [image, setImage] = useState<HTMLImageElement | null>(() => imageCache.get(definition.id) ?? null);
  useEffect(() => {
    if (!source) return;
    const cached = imageCache.get(definition.id);
    if (cached) return;
    const next = new Image();
    next.onload = () => { imageCache.set(definition.id, next); setImage(next); };
    next.src = source;
    return () => { next.onload = null; };
  }, [definition.id, source]);
  return image;
}

export function CloudPackRenderer({ element, definition }: DiagramShapeRendererProps) {
  const icon = useCloudIcon(definition);
  const providerColor = String(definition.data?.providerColor ?? element.style?.stroke ?? "#60a5fa");
  return <>
    <Rect width={element.width} height={element.height} fill={element.style?.fill ?? "#18181b"} stroke={element.style?.stroke ?? providerColor} strokeWidth={element.style?.strokeWidth ?? 1.25} cornerRadius={element.style?.cornerRadius ?? 10} opacity={element.style?.opacity ?? 1} />
    <Rect width={4} height={element.height} fill={providerColor} cornerRadius={[10, 0, 0, 10]} />
    {icon ? <KonvaImage image={icon} x={14} y={(element.height - 42) / 2} width={42} height={42} /> : <Rect x={14} y={(element.height - 42) / 2} width={42} height={42} stroke={providerColor} cornerRadius={8} />}
    <Text x={66} y={12} width={Math.max(30, element.width - 76)} height={element.height - 24} text={element.label} fill={element.textStyle?.color ?? "#f4f4f5"} fontFamily="Inter" fontSize={element.textStyle?.fontSize ?? 12} fontStyle="bold" verticalAlign="middle" wrap="word" />
  </>;
}

export function renderCloudShapeSvg(element: DiagramShapeRendererProps["element"], definition: DiagramShapeRendererProps["definition"]): string {
  const source = iconSource(definition);
  const color = String(definition.data?.providerColor ?? element.style?.stroke ?? "#60a5fa");
  const label = element.label.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<rect width="${element.width}" height="${element.height}" rx="10" fill="${element.style?.fill ?? "#18181b"}" stroke="${element.style?.stroke ?? color}" stroke-width="${element.style?.strokeWidth ?? 1.25}"/><path d="M10 0H4Q0 0 0 10V${element.height - 10}Q0 ${element.height} 4 ${element.height}H10Z" fill="${color}"/>${source ? `<image x="14" y="${(element.height - 42) / 2}" width="42" height="42" href="${source.replaceAll("&", "&amp;")}"/>` : ""}<text x="66" y="${element.height / 2 + 4}" fill="#f4f4f5" font-family="Inter,Arial" font-size="12" font-weight="600">${label}</text>`;
}
