import createDOMPurify from "dompurify";
import type { DiagramImageAsset, DiagramRasterMimeType } from "../core/types";

export const DIAGRAM_MAX_RASTER_BYTES = 2 * 1024 * 1024;
export const DIAGRAM_MAX_SVG_BYTES = 512 * 1024;
export const DIAGRAM_MAX_IMAGE_DIMENSION = 16_384;

const RASTER_TYPES = new Set<DiagramRasterMimeType>(["image/png", "image/jpeg", "image/webp"]);

export class DiagramAssetError extends Error {
  constructor(message: string) { super(message); this.name = "DiagramAssetError"; }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= DIAGRAM_MAX_IMAGE_DIMENSION;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertSafeSvg(source: string): void {
  if (/<!doctype|<\?xml-stylesheet|@import/i.test(source) || /<\s*(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(source) || /\bon[a-z][\w:-]*\s*=/i.test(source) || /(?:javascript\s*:|data\s*:\s*text\/html|expression\s*\(|-moz-binding\s*:|behavior\s*:)/i.test(source)) {
    throw new DiagramAssetError("SVG contains active or executable content.");
  }
  for (const match of source.matchAll(/\b(?:href|xlink:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
    if (!match[2].trim().startsWith("#")) throw new DiagramAssetError("SVG cannot reference external resources.");
  }
  for (const match of source.matchAll(/url\s*\(([^)]+)\)/gi)) {
    if (!match[1].trim().replace(/^['"]|['"]$/g, "").startsWith("#")) throw new DiagramAssetError("SVG cannot reference external resources.");
  }
}

function svgDimension(source: string, name: string): number | null {
  const opening = source.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const raw = opening.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
  const parsed = raw?.match(/^(\d+(?:\.\d+)?)(?:px)?$/i)?.[1];
  const value = parsed ? Number(parsed) : null;
  return dimension(value) ? value : null;
}

function svgDimensions(source: string): { intrinsicWidth: number; intrinsicHeight: number } {
  const width = svgDimension(source, "width");
  const height = svgDimension(source, "height");
  if (width && height) return { intrinsicWidth: width, intrinsicHeight: height };
  const opening = source.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const box = opening.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1].trim().split(/[\s,]+/).map(Number);
  return { intrinsicWidth: width ?? (box?.length === 4 && dimension(box[2]) ? box[2] : 256), intrinsicHeight: height ?? (box?.length === 4 && dimension(box[3]) ? box[3] : 256) };
}

export function sanitizeDiagramSvg(source: string): string {
  if (!source.trim() || byteLength(source) > DIAGRAM_MAX_SVG_BYTES) throw new DiagramAssetError("SVG must be non-empty and no larger than 512 KB.");
  assertSafeSvg(source);
  const sanitized = typeof window === "undefined" ? source.trim() : createDOMPurify(window).sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed", "audio", "video"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
  if (!/<svg\b/i.test(sanitized)) throw new DiagramAssetError("The file is not a valid SVG image.");
  assertSafeSvg(sanitized);
  return sanitized;
}

export function createDiagramSvgAsset(source: string, name?: string): DiagramImageAsset {
  const svg = sanitizeDiagramSvg(source);
  return { kind: "svg", mimeType: "image/svg+xml", svg, ...svgDimensions(svg), ...(name?.trim() ? { name: name.trim() } : {}) };
}

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new DiagramAssetError("Image could not be read."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new DiagramAssetError("Image could not be read."));
    reader.readAsDataURL(file);
  });
}

function imageDimensions(source: string): Promise<{ intrinsicWidth: number; intrinsicHeight: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => dimension(image.naturalWidth) && dimension(image.naturalHeight) ? resolve({ intrinsicWidth: image.naturalWidth, intrinsicHeight: image.naturalHeight }) : reject(new DiagramAssetError("Image dimensions are unsupported."));
    image.onerror = () => reject(new DiagramAssetError("Image is invalid."));
    image.src = source;
  });
}

export async function readDiagramImageFile(file: File): Promise<DiagramImageAsset> {
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) return createDiagramSvgAsset(await file.text(), file.name);
  if (!RASTER_TYPES.has(file.type as DiagramRasterMimeType)) throw new DiagramAssetError("Only PNG, JPEG, WebP, and SVG images are supported.");
  if (file.size > DIAGRAM_MAX_RASTER_BYTES) throw new DiagramAssetError("Images must be 2 MB or smaller.");
  const source = await dataUrl(file);
  return { kind: "raster", mimeType: file.type as DiagramRasterMimeType, dataUrl: source, ...(await imageDimensions(source)), ...(file.name.trim() ? { name: file.name.trim() } : {}) };
}

export function validateDiagramImageAsset(value: unknown): DiagramImageAsset {
  if (!record(value) || !dimension(value.intrinsicWidth) || !dimension(value.intrinsicHeight)) throw new DiagramAssetError("Embedded image dimensions are invalid.");
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : undefined;
  if (value.kind === "svg" && value.mimeType === "image/svg+xml" && typeof value.svg === "string") return { kind: "svg", mimeType: "image/svg+xml", svg: sanitizeDiagramSvg(value.svg), intrinsicWidth: value.intrinsicWidth, intrinsicHeight: value.intrinsicHeight, ...(name ? { name } : {}) };
  if (value.kind === "raster" && RASTER_TYPES.has(value.mimeType as DiagramRasterMimeType) && typeof value.dataUrl === "string") {
    const mimeType = value.mimeType as DiagramRasterMimeType;
    const prefix = `data:${mimeType};base64,`;
    if (!value.dataUrl.startsWith(prefix) || value.dataUrl.length > Math.ceil(DIAGRAM_MAX_RASTER_BYTES * 1.4) + 128 || !/^[a-z0-9+/]*={0,2}$/i.test(value.dataUrl.slice(prefix.length))) throw new DiagramAssetError("Embedded raster image is unsafe.");
    return { kind: "raster", mimeType, dataUrl: value.dataUrl, intrinsicWidth: value.intrinsicWidth, intrinsicHeight: value.intrinsicHeight, ...(name ? { name } : {}) };
  }
  throw new DiagramAssetError("Embedded image type is unsupported.");
}

export function fitDiagramImageAsset(asset: DiagramImageAsset): { width: number; height: number } {
  const scale = Math.min(1, 420 / asset.intrinsicWidth, 300 / asset.intrinsicHeight);
  return { width: Math.max(64, Math.round(asset.intrinsicWidth * scale)), height: Math.max(48, Math.round(asset.intrinsicHeight * scale)) };
}
