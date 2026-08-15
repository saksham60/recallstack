import { connectorMidpoint, connectorPoints, positionedBounds } from "../core/geometry";
import type { DiagramRegistry } from "../core/registry";
import type { DiagramConnectorElement, DiagramDocument, DiagramElement, DiagramPage, DiagramPositionedElement, DiagramTextStyle } from "../core/types";
import { isDiagramPositionedElement } from "../core/types";

export interface DiagramSvgExportOptions {
  background?: string | null;
  padding?: number;
  elementIds?: readonly string[];
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function slug(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram";
}

function dash(style: { strokeStyle?: string; dashPattern?: number[] } | undefined): string {
  const pattern = style?.dashPattern?.length ? style.dashPattern : style?.strokeStyle === "dashed" ? [10, 6] : style?.strokeStyle === "dotted" ? [2, 5] : [];
  return pattern.length ? ` stroke-dasharray="${pattern.join(" ")}"` : "";
}

function textSvg(text: string, width: number, height: number, style: DiagramTextStyle | undefined): string {
  if (!text) return "";
  const padding = style?.padding ?? 10;
  const align = style?.align ?? "center";
  const vertical = style?.verticalAlign ?? "middle";
  const fontSize = style?.fontSize ?? 13;
  const lines = text.split(/\r?\n/);
  const lineHeight = fontSize * (style?.lineHeight ?? 1.2);
  const x = align === "left" ? padding : align === "right" ? width - padding : width / 2;
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const blockHeight = lines.length * lineHeight;
  const y = vertical === "top" ? padding + fontSize : vertical === "bottom" ? height - padding - blockHeight + fontSize : (height - blockHeight) / 2 + fontSize;
  const decoration = style?.underline ? ' text-decoration="underline"' : "";
  const italic = style?.italic ? ' font-style="italic"' : "";
  const weight = style?.fontWeight === "bold" ? 700 : style?.fontWeight === "semibold" ? 600 : style?.fontWeight === "medium" ? 500 : 400;
  return `<text x="${x}" y="${y}" fill="${escapeXml(style?.color ?? "#f4f4f5")}" font-family="${escapeXml(style?.fontFamily ?? "Inter, Arial, sans-serif")}" font-size="${fontSize}" font-weight="${weight}" text-anchor="${anchor}"${italic}${decoration}>${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function imageSvg(element: Extract<DiagramPositionedElement, { kind: "image" }>): string {
  const source = element.asset.kind === "raster" ? element.asset.dataUrl : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.asset.svg)}`;
  return `<image width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid meet" href="${escapeXml(source)}"/>`;
}

function positionedSvg(element: DiagramPositionedElement, registry: DiagramRegistry): string {
  const transform = `translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2})`;
  if (element.kind === "shape") {
    const definition = registry.getShape(element.shapeDefinitionId);
    const body = definition?.exportSvg?.(element, definition) ?? `<rect width="${element.width}" height="${element.height}" rx="8" fill="${escapeXml(element.style?.fill ?? "#18181b")}" stroke="${escapeXml(element.style?.stroke ?? "#ef4444")}"/>`;
    return `<g id="${escapeXml(element.id)}" transform="${transform}">${body}${definition?.rendersOwnLabel ? "" : textSvg(element.label, element.width, element.height, element.textStyle)}</g>`;
  }
  if (element.kind === "text") return `<g id="${escapeXml(element.id)}" transform="${transform}" opacity="${element.style?.opacity ?? 1}">${textSvg(element.text, element.width, element.height, element.textStyle)}</g>`;
  if (element.kind === "image") return `<g id="${escapeXml(element.id)}" transform="${transform}" opacity="${element.style?.opacity ?? 1}">${imageSvg(element)}</g>`;
  const style = element.style;
  const stroke = escapeXml(style?.stroke ?? (element.kind === "group" ? "#a78bfa" : "#71717a"));
  const body = `<rect width="${element.width}" height="${element.height}" rx="${style?.cornerRadius ?? 8}" fill="${escapeXml(style?.fill ?? "transparent")}" stroke="${stroke}" stroke-width="${style?.strokeWidth ?? 1.5}" opacity="${style?.opacity ?? 1}"${dash(style)}/>`;
  const label = element.kind === "frame" ? element.label : element.label ?? "";
  const textStyle = element.kind === "frame" ? element.textStyle : undefined;
  return `<g id="${escapeXml(element.id)}" transform="${transform}">${body}${textSvg(label, element.width, element.height, textStyle)}</g>`;
}

function connectorSvg(connector: DiagramConnectorElement, elements: ReadonlyMap<string, DiagramElement>, registry: DiagramRegistry): string {
  const points = connectorPoints(connector, elements, registry);
  if (points.length < 2) return "";
  const color = escapeXml(connector.style?.stroke ?? "#94a3b8");
  const pointList = points.map((point) => `${point.x},${point.y}`).join(" ");
  const curved = connector.routing === "curved" && points.length === 2;
  const path = curved
    ? `<path d="M${points[0].x} ${points[0].y} C${(points[0].x + points[1].x) / 2} ${points[0].y}, ${(points[0].x + points[1].x) / 2} ${points[1].y}, ${points[1].x} ${points[1].y}"`
    : `<polyline points="${pointList}"`;
  const startMarker = connector.style?.startArrowhead && connector.style.startArrowhead !== "none" ? ` marker-start="url(#arrow-${connector.style.startArrowhead}-start)"` : "";
  const endKind = connector.style?.endArrowhead ?? "standard";
  const endMarker = endKind !== "none" ? ` marker-end="url(#arrow-${endKind})"` : "";
  const labels = connector.labels.map((label) => { const point = connectorMidpoint(points, label.position); return `<g transform="translate(${point.x} ${point.y})"><rect x="-48" y="-12" width="96" height="24" rx="5" fill="${escapeXml(label.background ?? "#18181b")}" stroke="#3f3f46"/><text y="4" text-anchor="middle" fill="${escapeXml(label.color ?? "#e4e4e7")}" font-family="Inter, Arial, sans-serif" font-size="11">${escapeXml(label.text)}</text></g>`; }).join("");
  return `<g id="${escapeXml(connector.id)}">${path} fill="none" stroke="${color}" stroke-width="${connector.style?.strokeWidth ?? 2}" opacity="${connector.style?.opacity ?? 1}" stroke-linecap="round" stroke-linejoin="round"${dash(connector.style)}${startMarker}${endMarker}/>${labels}</g>`;
}

const markerDefs = `<defs>
  <marker id="arrow-standard" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="context-stroke"/></marker>
  <marker id="arrow-standard-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10 0L0 5L10 10Z" fill="context-stroke"/></marker>
  <marker id="arrow-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="context-stroke" stroke-width="1.5"/></marker>
  <marker id="arrow-open-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M9 1L1 5L9 9" fill="none" stroke="context-stroke" stroke-width="1.5"/></marker>
  <marker id="arrow-diamond" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 6L6 1L11 6L6 11Z" fill="context-stroke"/></marker>
  <marker id="arrow-diamond-start" viewBox="0 0 12 12" refX="1" refY="6" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 6L6 1L11 6L6 11Z" fill="context-stroke"/></marker>
  <marker id="arrow-circle" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="8" markerHeight="8" orient="auto"><circle cx="6" cy="6" r="4" fill="context-stroke"/></marker>
  <marker id="arrow-circle-start" viewBox="0 0 12 12" refX="1" refY="6" markerWidth="8" markerHeight="8" orient="auto"><circle cx="6" cy="6" r="4" fill="context-stroke"/></marker>
  <marker id="arrow-one" viewBox="0 0 12 14" refX="11" refY="7" markerWidth="8" markerHeight="9" orient="auto"><path d="M7 1V13" stroke="context-stroke" stroke-width="2"/></marker>
  <marker id="arrow-one-start" viewBox="0 0 12 14" refX="1" refY="7" markerWidth="8" markerHeight="9" orient="auto"><path d="M5 1V13" stroke="context-stroke" stroke-width="2"/></marker>
  <marker id="arrow-many" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="10" markerHeight="10" orient="auto"><path d="M1 1L13 7L1 13M1 7H13" fill="none" stroke="context-stroke" stroke-width="1.7"/></marker>
  <marker id="arrow-many-start" viewBox="0 0 14 14" refX="1" refY="7" markerWidth="10" markerHeight="10" orient="auto"><path d="M13 1L1 7L13 13M1 7H13" fill="none" stroke="context-stroke" stroke-width="1.7"/></marker>
</defs>`;

export function createDiagramSvg(page: DiagramPage, registry: DiagramRegistry, options: DiagramSvgExportOptions = {}): string {
  const requested = options.elementIds?.length ? new Set(options.elementIds) : null;
  const included = page.elements.filter((element) => element.visible && (!requested || requested.has(element.id) || (element.kind === "connector" && requested.has(element.source.elementId) && requested.has(element.target.elementId))));
  const bounds = positionedBounds(included) ?? { x: 0, y: 0, width: 800, height: 600 };
  const padding = options.padding ?? 32;
  const view = { x: bounds.x - padding, y: bounds.y - padding, width: Math.max(1, bounds.width + padding * 2), height: Math.max(1, bounds.height + padding * 2) };
  const elements = new Map(included.map((element) => [element.id, element]));
  const positioned = included.filter(isDiagramPositionedElement);
  const backgrounds = positioned.filter((element) => element.kind === "frame" || element.kind === "group" || (element.kind === "shape" && registry.getShape(element.shapeDefinitionId)?.isFrame)).sort((a, b) => a.layer - b.layer);
  const foreground = positioned.filter((element) => !backgrounds.includes(element)).sort((a, b) => a.layer - b.layer);
  const connectors = included.filter((element): element is DiagramConnectorElement => element.kind === "connector").sort((a, b) => a.layer - b.layer);
  const background = options.background === null ? "" : `<rect x="${view.x}" y="${view.y}" width="${view.width}" height="${view.height}" fill="${escapeXml(options.background ?? "#09090b")}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" viewBox="${view.x} ${view.y} ${view.width} ${view.height}" role="img" aria-label="${escapeXml(page.name)}">${markerDefs}${background}<g data-plane="backgrounds">${backgrounds.map((element) => positionedSvg(element, registry)).join("")}</g><g data-plane="connectors">${connectors.map((connector) => connectorSvg(connector, elements, registry)).join("")}</g><g data-plane="elements">${foreground.map((element) => positionedSvg(element, registry)).join("")}</g></svg>`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadDiagramSvg(document: DiagramDocument, page: DiagramPage, registry: DiagramRegistry, options?: DiagramSvgExportOptions): void {
  downloadBlob(new Blob([createDiagramSvg(page, registry, options)], { type: "image/svg+xml;charset=utf-8" }), `${slug(document.title)}-${slug(page.name)}.svg`);
}

export async function renderDiagramPng(page: DiagramPage, registry: DiagramRegistry, options: DiagramSvgExportOptions & { scale?: 1 | 2 } = {}): Promise<Blob> {
  const svg = createDiagramSvg(page, registry, options);
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The SVG export could not be rendered.")); image.src = source; });
    const scale = options.scale ?? 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.ceil(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas export is unavailable.");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png"));
  } finally { URL.revokeObjectURL(source); }
}

export async function downloadDiagramPng(document: DiagramDocument, page: DiagramPage, registry: DiagramRegistry, options?: DiagramSvgExportOptions & { scale?: 1 | 2 }): Promise<void> {
  downloadBlob(await renderDiagramPng(page, registry, options), `${slug(document.title)}-${slug(page.name)}.png`);
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Export could not be read.")); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Export could not be read.")); reader.readAsDataURL(blob); });
}

export async function downloadDiagramPdf(document: DiagramDocument, page: DiagramPage, registry: DiagramRegistry, options?: DiagramSvgExportOptions): Promise<void> {
  const png = await renderDiagramPng(page, registry, { ...options, scale: 2 });
  const data = await blobDataUrl(png);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const next = new Image(); next.onload = () => resolve(next); next.onerror = () => reject(new Error("PDF source could not be rendered.")); next.src = data; });
  const { jsPDF } = await import("jspdf");
  const landscape = image.naturalWidth >= image.naturalHeight;
  const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min((pageWidth - 48) / image.naturalWidth, (pageHeight - 48) / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  pdf.addImage(data, "PNG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
  pdf.save(`${slug(document.title)}-${slug(page.name)}.pdf`);
}
