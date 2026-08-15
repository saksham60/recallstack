import type { DiagramPack, DiagramShapeDefinition } from "../../core/types";
import {
  COMMON_DIAGRAM_INSPECTOR_FIELDS,
  DEFAULT_DIAGRAM_PORTS,
} from "../../core/registry";
import { GenericShapeRenderer } from "../generic";

const flowStyle = {
  fill: "#18181b",
  stroke: "#22d3ee",
  strokeWidth: 1.5,
  strokeStyle: "solid" as const,
  opacity: 1,
};

function flowShape(
  id: string,
  label: string,
  rendererId: string,
  icon: string,
  keywords: readonly string[],
  size = { width: 170, height: 88 },
): DiagramShapeDefinition {
  return {
    id: `flowchart.${id}`,
    packId: "flowchart",
    label,
    category: id === "annotation" ? "annotations" : "flow",
    keywords,
    icon,
    rendererId,
    defaultSize: size,
    minimumSize: { width: 56, height: 40 },
    resize: { horizontal: true, vertical: true },
    rotatable: true,
    ports: id === "annotation" ? [] : DEFAULT_DIAGRAM_PORTS,
    defaultStyle:
      id === "annotation"
        ? { ...flowStyle, fill: "#312e1b", stroke: "#facc15" }
        : flowStyle,
    defaultTextStyle: {
      color: "#fafafa",
      fontSize: 14,
      fontWeight: "medium",
      align: "center",
      verticalAlign: "middle",
      padding: 12,
    },
    inspector: COMMON_DIAGRAM_INSPECTOR_FIELDS,
  };
}

export const FLOWCHART_SHAPES = [
  flowShape("start-end", "Start / End", "generic.ellipse", "circle-play", ["start", "end", "terminator"], { width: 160, height: 68 }),
  flowShape("process", "Process", "generic.rounded-rectangle", "square-function", ["process", "action", "task"]),
  flowShape("decision", "Decision", "generic.diamond", "diamond", ["decision", "condition", "branch", "yes", "no"], { width: 150, height: 112 }),
  flowShape("input-output", "Input / Output", "generic.parallelogram", "log-in", ["input", "output", "data", "io"]),
  flowShape("document", "Document", "generic.document", "file-text", ["document", "report", "file"]),
  flowShape("database", "Database", "generic.cylinder", "database", ["database", "data store", "storage"]),
  flowShape("manual-input", "Manual Input", "generic.trapezoid", "keyboard", ["manual input", "keyboard", "user input"]),
  flowShape("preparation", "Preparation", "generic.hexagon", "hexagon", ["preparation", "initialize", "setup"]),
  flowShape("connector", "Connector", "generic.circle", "circle-dot", ["connector", "continuation", "reference"], { width: 56, height: 56 }),
  flowShape("annotation", "Annotation", "generic.note", "sticky-note", ["annotation", "note", "comment"]),
] as const;

export const flowchartDiagramPack: DiagramPack = {
  id: "flowchart",
  label: "Flowchart",
  description: "Process, decision, input/output, document, and flow symbols.",
  icon: "workflow",
  categories: [
    { id: "flow", label: "Flowchart", order: 0 },
    { id: "annotations", label: "Annotations", order: 1 },
  ],
  shapes: FLOWCHART_SHAPES,
  renderers: {
    "generic.ellipse": GenericShapeRenderer,
    "generic.rounded-rectangle": GenericShapeRenderer,
    "generic.diamond": GenericShapeRenderer,
    "generic.parallelogram": GenericShapeRenderer,
    "generic.document": GenericShapeRenderer,
    "generic.cylinder": GenericShapeRenderer,
    "generic.trapezoid": GenericShapeRenderer,
    "generic.hexagon": GenericShapeRenderer,
    "generic.circle": GenericShapeRenderer,
    "generic.note": GenericShapeRenderer,
  },
};
