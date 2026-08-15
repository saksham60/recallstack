import type { DiagramPack, DiagramShapeDefinition } from "../../core/types";
import {
  COMMON_DIAGRAM_INSPECTOR_FIELDS,
  DEFAULT_DIAGRAM_PORTS,
} from "../../core/registry";
import { GenericShapeRenderer } from "./GenericShapeRenderer";
import { renderGenericShapeSvg } from "./generic-svg";

const defaultStyle = {
  fill: "#18181b",
  stroke: "#a78bfa",
  strokeWidth: 1.5,
  strokeStyle: "solid" as const,
  opacity: 1,
};

function shape(
  id: string,
  label: string,
  rendererId: string,
  icon: string,
  options: Partial<DiagramShapeDefinition> = {},
): DiagramShapeDefinition {
  return {
    id: `generic.${id}`,
    packId: "generic",
    label,
    category: options.category ?? "shapes",
    keywords: options.keywords ?? [label.toLowerCase(), id.replaceAll("-", " ")],
    icon,
    rendererId,
    defaultSize: options.defaultSize ?? { width: 160, height: 96 },
    minimumSize: options.minimumSize ?? { width: 40, height: 32 },
    resize: options.resize ?? { horizontal: true, vertical: true },
    rotatable: options.rotatable ?? true,
    ports: options.ports ?? DEFAULT_DIAGRAM_PORTS,
    defaultStyle: { ...defaultStyle, ...options.defaultStyle },
    defaultTextStyle: options.defaultTextStyle ?? {
      color: "#fafafa",
      fontSize: 14,
      fontWeight: "medium",
      align: "center",
      verticalAlign: "middle",
      padding: 12,
    },
    inspector: options.inspector ?? COMMON_DIAGRAM_INSPECTOR_FIELDS,
    isFrame: options.isFrame,
    data: options.data,
    validate: options.validate,
    exportSvg: renderGenericShapeSvg,
  };
}

export const GENERIC_SHAPES = [
  shape("rectangle", "Rectangle", "generic.rectangle", "square"),
  shape("rounded-rectangle", "Rounded Rectangle", "generic.rounded-rectangle", "rectangle-horizontal", { defaultStyle: { ...defaultStyle, cornerRadius: 12 } }),
  shape("circle", "Circle", "generic.circle", "circle", { defaultSize: { width: 104, height: 104 }, resize: { horizontal: true, vertical: true, preserveAspectRatio: true } }),
  shape("ellipse", "Ellipse", "generic.ellipse", "circle-ellipsis"),
  shape("diamond", "Diamond", "generic.diamond", "diamond", { defaultSize: { width: 140, height: 110 } }),
  shape("triangle", "Triangle", "generic.triangle", "triangle"),
  shape("hexagon", "Hexagon", "generic.hexagon", "hexagon"),
  shape("cylinder", "Cylinder", "generic.cylinder", "database", { keywords: ["database", "storage", "cylinder"] }),
  shape("document", "Document", "generic.document", "file-text"),
  shape("cloud", "Cloud", "generic.cloud", "cloud"),
  shape("person", "Person", "generic.person", "user-round", { defaultSize: { width: 96, height: 120 }, keywords: ["person", "user", "actor"] }),
  shape("text", "Text", "generic.text", "type", { category: "annotations", defaultSize: { width: 180, height: 64 }, defaultStyle: { fill: "transparent", stroke: "transparent", strokeWidth: 0 }, ports: [] }),
  shape("note", "Note", "generic.note", "sticky-note", { category: "annotations", defaultStyle: { fill: "#3f3718", stroke: "#eab308", strokeWidth: 1.5 } }),
  shape("frame", "Frame", "generic.frame", "frame", { category: "containers", defaultSize: { width: 420, height: 260 }, minimumSize: { width: 160, height: 100 }, rotatable: false, isFrame: true, defaultStyle: { fill: "#18181b22", stroke: "#71717a", strokeWidth: 1.5, strokeStyle: "dashed" } }),
  shape("container", "Container", "generic.frame", "box", { category: "containers", defaultSize: { width: 360, height: 220 }, minimumSize: { width: 140, height: 90 }, rotatable: false, isFrame: true, defaultStyle: { fill: "#18181b55", stroke: "#a78bfa", strokeWidth: 1.5 } }),
] as const;

export const genericDiagramPack: DiagramPack = {
  id: "generic",
  label: "General",
  description: "Foundational geometry, text, notes, frames, and containers.",
  icon: "shapes",
  categories: [
    { id: "shapes", label: "Shapes", order: 0 },
    { id: "annotations", label: "Annotations", order: 1 },
    { id: "containers", label: "Containers", order: 2 },
  ],
  shapes: GENERIC_SHAPES,
  renderers: {
    "generic.rectangle": GenericShapeRenderer,
    "generic.rounded-rectangle": GenericShapeRenderer,
    "generic.circle": GenericShapeRenderer,
    "generic.ellipse": GenericShapeRenderer,
    "generic.diamond": GenericShapeRenderer,
    "generic.triangle": GenericShapeRenderer,
    "generic.hexagon": GenericShapeRenderer,
    "generic.cylinder": GenericShapeRenderer,
    "generic.document": GenericShapeRenderer,
    "generic.cloud": GenericShapeRenderer,
    "generic.person": GenericShapeRenderer,
    "generic.text": GenericShapeRenderer,
    "generic.note": GenericShapeRenderer,
    "generic.frame": GenericShapeRenderer,
  },
};
