import type {
  DiagramArrowhead,
  DiagramConnectorElement,
  DiagramConnectorRouting,
  DiagramDocument,
  DiagramElement,
  DiagramFrameElement,
  DiagramImageElement,
  DiagramJsonValue,
  DiagramPage,
  DiagramShapeElement,
  DiagramTextElement,
} from "../../core/types";
import { DIAGRAM_SCHEMA_VERSION } from "../../core/types";
import type {
  SystemDesignArrowhead,
  SystemDesignDocument,
  SystemDesignEdge,
  SystemDesignNode,
} from "@/features/system-design/types/system-design.types";
import {
  isSystemDesignBoundaryNodeType,
} from "@/features/system-design/constants/system-design-palette";
import { parseSystemDesignDocument } from "@/features/system-design/utils/diagram-validation";

function json(value: unknown): DiagramJsonValue {
  return JSON.parse(JSON.stringify(value)) as DiagramJsonValue;
}

function common(node: SystemDesignNode) {
  return {
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: Number(node.metadata?.rotation ?? 0),
    layer: node.layer,
    visible: node.visible,
    locked: node.locked,
    parentGroupId: node.groupId,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    style: node.style
      ? {
          fill: node.style.fill,
          stroke: node.style.stroke,
          strokeWidth: node.style.strokeWidth,
          strokeStyle: node.style.borderStyle,
          opacity: node.style.opacity,
          cornerRadius: node.style.borderRadius,
        }
      : undefined,
    data: {
      systemDesignType: node.type,
      subtitle: node.subtitle ?? "",
      description: node.description ?? "",
      technology: node.technology ? json(node.technology) : null,
      technologyId: node.technology?.id ?? "",
      isExpandable: node.isExpandable ?? false,
      isCollapsed: node.isCollapsed ?? false,
      parentModuleId: node.parentModuleId ?? "",
    },
  } as const;
}

function textStyle(node: SystemDesignNode) {
  if (!node.textStyle) return undefined;
  return {
    color: node.textStyle.color,
    fontFamily: node.textStyle.fontFamily,
    fontSize: node.textStyle.fontSize,
    fontWeight:
      node.textStyle.fontWeight === "bold" ? ("bold" as const) : ("normal" as const),
    italic: node.textStyle.fontStyle === "italic",
    underline: node.textStyle.textDecoration === "underline",
    align: node.textStyle.align,
    verticalAlign: node.textStyle.verticalAlign,
    lineHeight: node.textStyle.lineHeight,
    padding: node.textStyle.padding,
  };
}

function migrateNode(node: SystemDesignNode): DiagramElement {
  if (node.type === "image" && node.asset) {
    const image: DiagramImageElement = {
      ...common(node),
      kind: "image",
      asset: structuredClone(node.asset),
      label: node.label,
      textStyle: textStyle(node),
    };
    return image;
  }
  if (node.type === "text") {
    const text: DiagramTextElement = {
      ...common(node),
      kind: "text",
      text: node.label,
      textStyle: textStyle(node),
    };
    return text;
  }
  if (isSystemDesignBoundaryNodeType(node.type)) {
    const frame: DiagramFrameElement = {
      ...common(node),
      kind: "frame",
      frameDefinitionId: `system-design.${node.type}`,
      label: node.label,
      textStyle: textStyle(node),
      childPageId: node.childDiagramId,
    };
    return frame;
  }
  const shape: DiagramShapeElement = {
    ...common(node),
    kind: "shape",
    shapeDefinitionId: `system-design.${node.type}`,
    label: node.label,
    textStyle: textStyle(node),
    childPageId: node.childDiagramId,
  };
  return shape;
}

function routing(edge: SystemDesignEdge): DiagramConnectorRouting {
  if (edge.routing === "curved") return "curved";
  if (edge.routing === "elbow" || edge.routing === "orthogonal" || edge.routing === "step") return "orthogonal";
  return "straight";
}

function arrowhead(value: SystemDesignArrowhead | undefined): DiagramArrowhead | undefined {
  if (value === "filled_triangle") return "standard";
  return value;
}

function migrateEdge(edge: SystemDesignEdge, layer: number): DiagramConnectorElement {
  const label = edge.label ?? edge.protocol;
  return {
    id: edge.id,
    kind: "connector",
    source: { elementId: edge.sourceNodeId, portId: edge.sourcePort },
    target: { elementId: edge.targetNodeId, portId: edge.targetPort },
    routing: routing(edge),
    waypoints: [],
    labels: label
      ? [{ id: `${edge.id}_label`, text: label, position: edge.labelPosition ?? 0.5, background: edge.labelBackground, color: edge.labelTextColor }]
      : [],
    style: {
      stroke: edge.color,
      strokeWidth: edge.strokeWidth,
      opacity: edge.opacity,
      strokeStyle:
        edge.lineStyle === "dash_dot" ? "dashed" : edge.lineStyle,
      dashPattern: edge.dashPattern ? [...edge.dashPattern] : undefined,
      startArrowhead: arrowhead(edge.startArrowhead),
      endArrowhead: arrowhead(edge.endArrowhead),
    },
    layer,
    visible: true,
    locked: false,
    data: {
      semanticType: edge.type,
      protocol: edge.protocol ?? "",
      description: edge.description ?? "",
      originalRouting: edge.routing ?? "straight",
      labelIcon: edge.labelIcon ?? "none",
      animationMode: edge.animationMode ?? "none",
      animationSpeed: edge.animationSpeed ?? 1,
      animationDirection: edge.animationDirection ?? "forward",
    },
  };
}

export function migrateSystemDesignDocumentToDiagram(
  source: SystemDesignDocument,
): DiagramDocument {
  const pages: Record<string, DiagramPage> = {};
  for (const diagram of Object.values(source.diagrams)) {
    const nodes = diagram.nodes.map(migrateNode);
    pages[diagram.id] = {
      id: diagram.id,
      name: diagram.name,
      parentElementId: diagram.parentNodeId,
      elements: [
        ...nodes,
        ...diagram.edges.map((edge, index) => migrateEdge(edge, nodes.length + index)),
      ],
      viewport: { ...diagram.viewport },
    };
  }
  return {
    schemaVersion: DIAGRAM_SCHEMA_VERSION,
    id: source.id,
    title: source.title,
    enabledPackIds: ["generic", "system-design", "flowchart"],
    rootPageId: source.rootDiagramId,
    pages,
    metadata: {
      source: "system-design",
      sourceSchemaVersion: String(source.schemaVersion),
      problemId: source.problemId,
      status: source.status,
      ...(source.metadata ?? {}),
    },
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export function systemDesignDiagramMigration(value: unknown): DiagramDocument | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("problemId" in value) ||
    !("schemaVersion" in value)
  ) return null;
  try {
    return migrateSystemDesignDocumentToDiagram(parseSystemDesignDocument(value));
  } catch {
    return null;
  }
}
