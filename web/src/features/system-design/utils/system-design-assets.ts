import createDOMPurify from "dompurify";
import type {
  SystemDesignNodeAsset,
  SystemDesignRasterAssetMimeType,
} from "../types/system-design.types";

export const SYSTEM_DESIGN_MAX_RASTER_BYTES = 2 * 1024 * 1024;
export const SYSTEM_DESIGN_MAX_SVG_BYTES = 512 * 1024;

const RASTER_MIME_TYPES = new Set<SystemDesignRasterAssetMimeType>([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export class SystemDesignAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemDesignAssetError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveDimension(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100_000
  );
}

function parseSvgDimension(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return isPositiveDimension(parsed) ? parsed : null;
}

function readSvgAttribute(source: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "i"),
  );
  return match?.[1];
}

function readSvgDimensions(svg: string): {
  intrinsicWidth: number;
  intrinsicHeight: number;
} {
  const openingTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const width = parseSvgDimension(readSvgAttribute(openingTag, "width"));
  const height = parseSvgDimension(readSvgAttribute(openingTag, "height"));
  if (width && height) return { intrinsicWidth: width, intrinsicHeight: height };

  const viewBox = readSvgAttribute(openingTag, "viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBox?.length === 4 &&
    isPositiveDimension(viewBox[2]) &&
    isPositiveDimension(viewBox[3])
  ) {
    return { intrinsicWidth: viewBox[2], intrinsicHeight: viewBox[3] };
  }
  return {
    intrinsicWidth: width ?? 256,
    intrinsicHeight: height ?? 256,
  };
}

function assertNoExternalSvgReferences(svg: string): void {
  if (/<!doctype|<\?xml-stylesheet|@import/i.test(svg)) {
    throw new SystemDesignAssetError(
      "SVG files with document declarations or imported styles are not supported.",
    );
  }

  const references = svg.matchAll(
    /\b(?:href|xlink:href|src)\s*=\s*(["'])(.*?)\1/gi,
  );
  for (const reference of references) {
    if (!reference[2].trim().startsWith("#")) {
      throw new SystemDesignAssetError(
        "SVG files cannot reference external resources.",
      );
    }
  }

  const cssUrls = svg.matchAll(/url\s*\(([^)]+)\)/gi);
  for (const cssUrl of cssUrls) {
    const target = cssUrl[1].trim().replace(/^['"]|['"]$/g, "");
    if (!target.startsWith("#")) {
      throw new SystemDesignAssetError(
        "SVG files cannot reference external resources.",
      );
    }
  }
}

function assertNoActiveSvgContent(svg: string): void {
  if (
    /<\s*(?:script|foreignObject|iframe|object|embed|audio|video)\b/i.test(
      svg,
    ) ||
    /\bon[a-z][\w:-]*\s*=/i.test(svg) ||
    /(?:expression\s*\(|-moz-binding\s*:|behavior\s*:)/i.test(svg)
  ) {
    throw new SystemDesignAssetError(
      "SVG files cannot contain scripts or other active content.",
    );
  }
}

function sanitizeSystemDesignSvgInBrowser(svg: string): string | null {
  if (typeof window === "undefined") return null;
  const purifier = createDOMPurify(window);
  return purifier.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      "script",
      "foreignObject",
      "iframe",
      "object",
      "embed",
      "audio",
      "video",
    ],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

export function sanitizeSystemDesignSvg(svg: string): string {
  if (!svg.trim()) {
    throw new SystemDesignAssetError("The pasted SVG is empty.");
  }
  if (new TextEncoder().encode(svg).byteLength > SYSTEM_DESIGN_MAX_SVG_BYTES) {
    throw new SystemDesignAssetError("SVG images must be 512 KB or smaller.");
  }
  assertNoExternalSvgReferences(svg);
  const browserSanitized = sanitizeSystemDesignSvgInBrowser(svg);
  // Model validation also runs in Node. In that environment there is no DOM,
  // so use a conservative validator that rejects active SVG content instead
  // of pulling jsdom into the model/test bundle. Every browser render still
  // passes through DOMPurify before a data URL is produced.
  if (browserSanitized === null) assertNoActiveSvgContent(svg);
  const sanitized = browserSanitized ?? svg.trim();
  if (!/<svg\b/i.test(sanitized)) {
    throw new SystemDesignAssetError(
      "The pasted content is not a valid SVG image.",
    );
  }
  assertNoExternalSvgReferences(sanitized);
  return sanitized;
}

export function createSystemDesignSvgAsset(
  svg: string,
  name?: string,
): SystemDesignNodeAsset {
  const sanitized = sanitizeSystemDesignSvg(svg);
  return {
    kind: "svg",
    mimeType: "image/svg+xml",
    svg: sanitized,
    ...readSvgDimensions(sanitized),
    ...(name?.trim() ? { name: name.trim() } : {}),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new SystemDesignAssetError("The pasted image could not be read."));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new SystemDesignAssetError("The pasted image could not be read."));
    };
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl: string): Promise<{
  intrinsicWidth: number;
  intrinsicHeight: number;
}> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        intrinsicWidth: image.naturalWidth,
        intrinsicHeight: image.naturalHeight,
      });
    image.onerror = () =>
      reject(new SystemDesignAssetError("The pasted image is not valid."));
    image.src = dataUrl;
  });
}

export async function readSystemDesignImageFile(
  file: File,
): Promise<SystemDesignNodeAsset> {
  const isSvg =
    file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  if (isSvg) return createSystemDesignSvgAsset(await file.text(), file.name);

  if (!RASTER_MIME_TYPES.has(file.type as SystemDesignRasterAssetMimeType)) {
    throw new SystemDesignAssetError(
      "Only PNG, JPEG, WebP, and SVG images can be pasted.",
    );
  }
  if (file.size > SYSTEM_DESIGN_MAX_RASTER_BYTES) {
    throw new SystemDesignAssetError("Pasted images must be 2 MB or smaller.");
  }
  const dataUrl = await readFileAsDataUrl(file);
  return {
    kind: "raster",
    mimeType: file.type as SystemDesignRasterAssetMimeType,
    dataUrl,
    ...(await readImageDimensions(dataUrl)),
    ...(file.name.trim() ? { name: file.name.trim() } : {}),
  };
}

export function parseSystemDesignNodeAsset(
  value: unknown,
): SystemDesignNodeAsset {
  if (!isRecord(value)) {
    throw new SystemDesignAssetError("Expected an embedded image asset.");
  }
  if (
    !isPositiveDimension(value.intrinsicWidth) ||
    !isPositiveDimension(value.intrinsicHeight)
  ) {
    throw new SystemDesignAssetError(
      "Embedded image dimensions must be positive finite numbers.",
    );
  }
  const name = typeof value.name === "string" && value.name.trim()
    ? value.name.trim()
    : undefined;

  if (value.kind === "svg" && value.mimeType === "image/svg+xml") {
    if (typeof value.svg !== "string") {
      throw new SystemDesignAssetError("Expected embedded SVG content.");
    }
    return {
      kind: "svg",
      mimeType: "image/svg+xml",
      svg: sanitizeSystemDesignSvg(value.svg),
      intrinsicWidth: value.intrinsicWidth,
      intrinsicHeight: value.intrinsicHeight,
      ...(name ? { name } : {}),
    };
  }

  if (
    value.kind === "raster" &&
    RASTER_MIME_TYPES.has(value.mimeType as SystemDesignRasterAssetMimeType) &&
    typeof value.dataUrl === "string"
  ) {
    const mimeType = value.mimeType as SystemDesignRasterAssetMimeType;
    const prefix = `data:${mimeType};base64,`;
    if (
      !value.dataUrl.startsWith(prefix) ||
      value.dataUrl.length > Math.ceil(SYSTEM_DESIGN_MAX_RASTER_BYTES * 1.4) + 128 ||
      !/^[a-z0-9+/]*={0,2}$/i.test(value.dataUrl.slice(prefix.length))
    ) {
      throw new SystemDesignAssetError("Expected a safe embedded raster image.");
    }
    return {
      kind: "raster",
      mimeType,
      dataUrl: value.dataUrl,
      intrinsicWidth: value.intrinsicWidth,
      intrinsicHeight: value.intrinsicHeight,
      ...(name ? { name } : {}),
    };
  }
  throw new SystemDesignAssetError("Unsupported embedded image asset.");
}

export function getSystemDesignAssetSource(asset: SystemDesignNodeAsset): string {
  return asset.kind === "raster"
    ? asset.dataUrl
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        sanitizeSystemDesignSvg(asset.svg),
      )}`;
}

export function fitSystemDesignAssetFrame(asset: SystemDesignNodeAsset): {
  width: number;
  height: number;
} {
  const maximumWidth = 360;
  const maximumHeight = 260;
  const scale = Math.min(
    1,
    maximumWidth / asset.intrinsicWidth,
    maximumHeight / asset.intrinsicHeight,
  );
  return {
    width: Math.max(120, Math.round(asset.intrinsicWidth * scale)),
    height: Math.max(72, Math.round(asset.intrinsicHeight * scale)),
  };
}
