import {
  SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS,
  SYSTEM_DESIGN_TECHNOLOGY_REGISTRY,
  getSystemDesignNodeVisual,
  type SystemDesignNodeChrome,
} from "@/features/system-design/constants/system-design-visual-registry";
import { SYSTEM_DESIGN_NODE_TYPE_ORDER } from "@/features/system-design/constants/system-design-palette";
import type { SystemDesignNodeType } from "@/features/system-design/types/system-design.types";
import type { DiagramShapeDefinition, DiagramShapeElement } from "../../core/types";
import { renderGenericShapeSvg } from "../generic/generic-svg";

const LEGACY_TYPES = new Set<string>(SYSTEM_DESIGN_NODE_TYPE_ORDER);

function rendererForChrome(chrome: SystemDesignNodeChrome): string {
  if (chrome === "datastore") return "generic.cylinder";
  if (chrome === "gateway") return "generic.hexagon";
  if (chrome === "identity") return "generic.person";
  if (["note", "warning-note", "assumption-note"].includes(chrome)) return "generic.note";
  if (chrome === "ellipse") return "generic.ellipse";
  if (chrome === "diamond") return "generic.diamond";
  if (["text", "label"].includes(chrome)) return "generic.text";
  if (chrome.includes("boundary") || chrome === "swimlane" || chrome === "container") return "generic.frame";
  return chrome === "client" ? "generic.rounded-rectangle" : "generic.rectangle";
}

export function renderSystemDesignShapeSvg(element: DiagramShapeElement, definition: DiagramShapeDefinition): string {
  const semanticType = String(element.data?.systemDesignType ?? "service");
  const visual = LEGACY_TYPES.has(semanticType)
    ? getSystemDesignNodeVisual(semanticType as SystemDesignNodeType)
    : { chrome: String(element.data?.semanticChrome ?? "compute") as SystemDesignNodeChrome, accent: element.style?.stroke ?? "#60a5fa" };
  const base = renderGenericShapeSvg(element, { ...definition, rendererId: rendererForChrome(visual.chrome), defaultStyle: { ...definition.defaultStyle, stroke: element.style?.stroke ?? visual.accent } });
  if (definition.isFrame || ["text", "label", "note", "warning-note", "assumption-note"].includes(visual.chrome)) return base;
  const technologyId = element.data?.technologyId;
  if (typeof technologyId === "string" && technologyId in SYSTEM_DESIGN_TECHNOLOGY_REGISTRY) {
    const technology = SYSTEM_DESIGN_TECHNOLOGY_REGISTRY[technologyId as keyof typeof SYSTEM_DESIGN_TECHNOLOGY_REGISTRY];
    const brand = SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS[technology.id];
    const paint = brand.style === "fill" ? `fill="${technology.onColor}"` : `fill="none" stroke="${technology.onColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
    return `${base}<rect x="12" y="12" width="28" height="28" rx="7" fill="${technology.color}"/><path d="${brand.path}" transform="translate(16 16) scale(.8333)" ${paint}/>`;
  }
  const accent = element.style?.stroke ?? visual.accent;
  const glyph = visual.chrome === "messaging" || semanticType.includes("queue") || semanticType.includes("stream")
    ? `<path d="M17 18h18M17 24h18M17 30h18" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>`
    : semanticType.includes("object") || semanticType.includes("storage")
      ? `<path d="M18 17h16v17H18zM18 21h16" fill="none" stroke="${accent}" stroke-width="2"/>`
      : `<path d="M18 18h16v16H18zM22 22h8M22 26h8M22 30h5" fill="none" stroke="${accent}" stroke-width="1.8" stroke-linecap="round"/>`;
  return `${base}${glyph}`;
}
