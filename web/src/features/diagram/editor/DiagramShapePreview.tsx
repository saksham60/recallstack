import { SystemDesignNodeIcon } from "@/features/system-design/components/SystemDesignIcons";
import { SYSTEM_DESIGN_NODE_TYPE_ORDER } from "@/features/system-design/constants/system-design-palette";
import type { DiagramShapeDefinition } from "../core/types";
import { DiagramIcon } from "./DiagramIcon";

function GenericShapeGlyph({ rendererId }: { rendererId: string }) {
  const common = { fill: "currentColor", fillOpacity: 0.1, stroke: "currentColor", strokeWidth: 1.7, vectorEffect: "non-scaling-stroke" as const };
  if (rendererId === "generic.circle") return <circle cx="16" cy="16" r="10.5" {...common} />;
  if (rendererId === "generic.ellipse") return <ellipse cx="16" cy="16" rx="13" ry="8.5" {...common} />;
  if (rendererId === "generic.diamond") return <polygon points="16,3 29,16 16,29 3,16" {...common} />;
  if (rendererId === "generic.triangle") return <polygon points="16,3 29,28 3,28" {...common} />;
  if (rendererId === "generic.hexagon") return <polygon points="9,4 23,4 30,16 23,28 9,28 2,16" {...common} />;
  if (rendererId === "generic.parallelogram") return <polygon points="8,5 30,5 24,27 2,27" {...common} />;
  if (rendererId === "generic.trapezoid") return <polygon points="8,5 24,5 30,27 2,27" {...common} />;
  if (rendererId === "generic.cylinder") return <><path d="M4 8v16c0 3 24 3 24 0V8" {...common} /><ellipse cx="16" cy="8" rx="12" ry="4" {...common} /><path d="M4 16c0 3 24 3 24 0" fill="none" stroke="currentColor" strokeWidth="1.4" /></>;
  if (rendererId === "generic.document") return <path d="M5 4h22v20c-4-3-7 3-11 0s-7 3-11 0V4Z" {...common} />;
  if (rendererId === "generic.cloud") return <path d="M8 25a6 6 0 0 1-1-12 9 9 0 0 1 17-2 7 7 0 0 1 0 14H8Z" {...common} />;
  if (rendererId === "generic.person") return <><circle cx="16" cy="9" r="5" {...common} /><path d="M6 28c1-8 4-12 10-12s9 4 10 12" {...common} /></>;
  if (rendererId === "generic.note") return <path d="M4 4h19l5 5v19H4V4Zm19 0v6h5" {...common} />;
  if (rendererId === "generic.frame") return <rect x="3" y="5" width="26" height="22" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeDasharray="4 2.5" />;
  if (rendererId === "generic.text") return <path d="M6 7h20M16 7v20M10 27h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
  return <rect x="3" y="6" width="26" height="20" rx={rendererId === "generic.rounded-rectangle" ? 5 : 1.5} {...common} />;
}

export function DiagramShapePreview({ shape }: { shape: DiagramShapeDefinition }) {
  type PaletteSystemDesignNodeType = (typeof SYSTEM_DESIGN_NODE_TYPE_ORDER)[number];
  const semanticType = shape.data?.systemDesignType;
  const isLegacySystemType = typeof semanticType === "string" && SYSTEM_DESIGN_NODE_TYPE_ORDER.includes(semanticType as PaletteSystemDesignNodeType);
  const color = shape.defaultStyle.stroke ?? "#a78bfa";
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-current/20 bg-current/5" style={{ color }} aria-hidden="true">
    {isLegacySystemType ? <SystemDesignNodeIcon type={semanticType as PaletteSystemDesignNodeType} className="h-[18px] w-[18px]" strokeWidth={1.8} /> : shape.packId === "system-design" ? <DiagramIcon name={shape.icon} className="h-[18px] w-[18px]" /> : <svg viewBox="0 0 32 32" className="h-[22px] w-[22px] overflow-visible"><GenericShapeGlyph rendererId={shape.rendererId} /></svg>}
  </span>;
}
