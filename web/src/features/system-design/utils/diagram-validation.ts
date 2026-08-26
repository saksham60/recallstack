import {
  SYSTEM_DESIGN_NODE_DEFINITIONS,
  isSystemDesignBoundaryNodeType,
  isSystemDesignModuleNodeType,
} from "../constants/system-design-palette";
import { SYSTEM_DESIGN_TECHNOLOGY_REGISTRY } from "../constants/system-design-visual-registry";
import {
  SYSTEM_DESIGN_ARROWHEADS,
  SYSTEM_DESIGN_EDGE_ANIMATION_DIRECTIONS,
  SYSTEM_DESIGN_EDGE_ANIMATION_MODES,
  SYSTEM_DESIGN_EDGE_LABEL_ICONS,
  SYSTEM_DESIGN_EDGE_LINE_STYLES,
  SYSTEM_DESIGN_EDGE_ROUTINGS,
  SYSTEM_DESIGN_EDGE_SEMANTICS,
} from "../constants/system-design-edge-registry";
import {
  SYSTEM_DESIGN_LEGACY_SCHEMA_VERSION,
  SYSTEM_DESIGN_PREVIOUS_SCHEMA_VERSION,
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type SystemDesignDiagram,
  type SystemDesignDocument,
  type SystemDesignEdge,
  type SystemDesignArrowhead,
  type SystemDesignEdgeAnimationDirection,
  type SystemDesignEdgeAnimationMode,
  type SystemDesignEdgeLabelIcon,
  type SystemDesignEdgeLineStyle,
  type SystemDesignEdgeRouting,
  type SystemDesignEdgeType,
  type SystemDesignNode,
  type SystemDesignNodeType,
  type SystemDesignPort,
  type TechnologyCategory,
  type TechnologyIdentity,
  type TechnologyRegistryId,
} from "../types/system-design.types";
import {
  MAX_ZOOM,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  MIN_ZOOM,
  cloneSystemDesignDocument,
  migrateLegacyTechnologyIdentity,
} from "./system-design-defaults";
import {
  SystemDesignAssetError,
  parseSystemDesignNodeAsset,
} from "./system-design-assets";

const PORTS = [
  "top",
  "right",
  "bottom",
  "left",
] as const satisfies readonly SystemDesignPort[];

const NODE_TYPE_SET = new Set<string>(
  Object.keys(SYSTEM_DESIGN_NODE_DEFINITIONS),
);
const NODE_BORDER_STYLE_SET = new Set(["solid", "dashed", "dotted"]);
const TEXT_WEIGHT_SET = new Set(["normal", "bold"]);
const TEXT_FONT_STYLE_SET = new Set(["normal", "italic"]);
const TEXT_DECORATION_SET = new Set(["none", "underline", "line-through"]);
const TEXT_ALIGN_SET = new Set(["left", "center", "right"]);
const TEXT_VERTICAL_ALIGN_SET = new Set(["top", "middle", "bottom"]);
const EDGE_TYPE_SET = new Set<string>(
  Object.keys(SYSTEM_DESIGN_EDGE_SEMANTICS),
);
const PORT_SET = new Set<string>(PORTS);
const EDGE_ROUTING_SET = new Set<string>(SYSTEM_DESIGN_EDGE_ROUTINGS);
const EDGE_LINE_STYLE_SET = new Set<string>(SYSTEM_DESIGN_EDGE_LINE_STYLES);
const EDGE_ARROWHEAD_SET = new Set<string>(SYSTEM_DESIGN_ARROWHEADS);
const EDGE_LABEL_ICON_SET = new Set<string>(SYSTEM_DESIGN_EDGE_LABEL_ICONS);
const EDGE_ANIMATION_MODE_SET = new Set<string>(
  SYSTEM_DESIGN_EDGE_ANIMATION_MODES,
);
const EDGE_ANIMATION_DIRECTION_SET = new Set<string>(
  SYSTEM_DESIGN_EDGE_ANIMATION_DIRECTIONS,
);

export interface SystemDesignValidationIssue {
  path: string;
  message: string;
}

export type SystemDesignValidationResult =
  | {
      valid: true;
      document: SystemDesignDocument;
      issues: [];
      migrated: boolean;
    }
  | {
      valid: false;
      issues: SystemDesignValidationIssue[];
      migrated: false;
    };

export class SystemDesignValidationError extends Error {
  readonly issues: SystemDesignValidationIssue[];

  constructor(issues: SystemDesignValidationIssue[]) {
    const firstIssue = issues[0];
    super(
      firstIssue
        ? `Invalid system-design document at ${firstIssue.path}: ${firstIssue.message}`
        : "Invalid system-design document.",
    );
    this.name = "SystemDesignValidationError";
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeSystemDesignColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(
      value,
    ) ||
      /^var\(--[a-z0-9-]+\)$/i.test(value))
  );
}

function isIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function cloneStringMetadata(
  value: unknown,
): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function validateMetadata(
  value: unknown,
  path: string,
  issues: SystemDesignValidationIssue[],
): void {
  if (value === undefined) return;
  if (
    !isRecord(value) ||
    Object.values(value).some((entry) => typeof entry !== "string")
  ) {
    issues.push({
      path,
      message: "Metadata must contain only string keys and string values.",
    });
  }
}

function validateFreehandData(
  value: unknown,
  path: string,
  issues: SystemDesignValidationIssue[],
): SystemDesignNode["drawing"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected typed freehand drawing data." });
    return undefined;
  }
  const points = value.points;
  if (
    !Array.isArray(points) ||
    points.length < 4 ||
    points.length % 2 !== 0 ||
    points.some((coordinate) => !isFiniteNumber(coordinate))
  ) {
    issues.push({
      path: `${path}.points`,
      message: "Freehand points must be an even array of at least two finite coordinates.",
    });
  }
  if (!isSafeSystemDesignColor(value.stroke)) {
    issues.push({
      path: `${path}.stroke`,
      message: "Expected a safe hexadecimal or theme color.",
    });
  }
  if (
    !isFiniteNumber(value.strokeWidth) ||
    value.strokeWidth <= 0 ||
    value.strokeWidth > 32
  ) {
    issues.push({
      path: `${path}.strokeWidth`,
      message: "Stroke width must be greater than 0 and at most 32.",
    });
  }
  if (
    value.opacity !== undefined &&
    (!isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 1)
  ) {
    issues.push({
      path: `${path}.opacity`,
      message: "Opacity must be between 0 and 1.",
    });
  }
  if (
    !Array.isArray(points) ||
    typeof value.stroke !== "string" ||
    typeof value.strokeWidth !== "number"
  ) {
    return undefined;
  }
  return {
    points: [...points] as number[],
    stroke: value.stroke,
    strokeWidth: value.strokeWidth,
    ...(typeof value.opacity === "number" ? { opacity: value.opacity } : {}),
  };
}

function validateNodeStyle(
  value: unknown,
  path: string,
  issues: SystemDesignValidationIssue[],
): SystemDesignNode["style"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a node appearance object." });
    return undefined;
  }

  for (const field of ["fill", "stroke"] as const) {
    if (value[field] !== undefined && !isSafeSystemDesignColor(value[field])) {
      issues.push({
        path: `${path}.${field}`,
        message: "Expected a safe hexadecimal or theme color.",
      });
    }
  }
  if (
    value.strokeWidth !== undefined &&
    (!isFiniteNumber(value.strokeWidth) ||
      value.strokeWidth < 0 ||
      value.strokeWidth > 12)
  ) {
    issues.push({
      path: `${path}.strokeWidth`,
      message: "Stroke width must be between 0 and 12.",
    });
  }
  if (
    value.borderRadius !== undefined &&
    (!isFiniteNumber(value.borderRadius) ||
      value.borderRadius < 0 ||
      value.borderRadius > 100)
  ) {
    issues.push({
      path: `${path}.borderRadius`,
      message: "Border radius must be between 0 and 100.",
    });
  }
  if (
    value.borderStyle !== undefined &&
    (typeof value.borderStyle !== "string" ||
      !NODE_BORDER_STYLE_SET.has(value.borderStyle))
  ) {
    issues.push({
      path: `${path}.borderStyle`,
      message: "Unsupported node border style.",
    });
  }
  if (
    value.opacity !== undefined &&
    (!isFiniteNumber(value.opacity) || value.opacity < 0 || value.opacity > 1)
  ) {
    issues.push({
      path: `${path}.opacity`,
      message: "Node opacity must be between 0 and 1.",
    });
  }

  return {
    ...(typeof value.fill === "string" ? { fill: value.fill } : {}),
    ...(typeof value.stroke === "string" ? { stroke: value.stroke } : {}),
    ...(typeof value.strokeWidth === "number"
      ? { strokeWidth: value.strokeWidth }
      : {}),
    ...(typeof value.borderRadius === "number"
      ? { borderRadius: value.borderRadius }
      : {}),
    ...(typeof value.borderStyle === "string"
      ? {
          borderStyle:
            value.borderStyle as NonNullable<
              SystemDesignNode["style"]
            >["borderStyle"],
        }
      : {}),
    ...(typeof value.opacity === "number" ? { opacity: value.opacity } : {}),
  };
}

function validateNodeTextStyle(
  value: unknown,
  path: string,
  issues: SystemDesignValidationIssue[],
): SystemDesignNode["textStyle"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a node text-style object." });
    return undefined;
  }

  if (value.color !== undefined && !isSafeSystemDesignColor(value.color)) {
    issues.push({
      path: `${path}.color`,
      message: "Expected a safe hexadecimal or theme color.",
    });
  }
  if (
    value.fontFamily !== undefined &&
    (typeof value.fontFamily !== "string" ||
      value.fontFamily.trim().length === 0 ||
      value.fontFamily.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(value.fontFamily))
  ) {
    issues.push({
      path: `${path}.fontFamily`,
      message: "Font family must be a non-empty string of at most 100 characters.",
    });
  }
  for (const [field, minimum, maximum, message] of [
    ["fontSize", 8, 72, "Font size must be between 8 and 72."],
    ["lineHeight", 0.8, 3, "Line height must be between 0.8 and 3."],
    ["padding", 0, 64, "Text padding must be between 0 and 64."],
  ] as const) {
    if (
      value[field] !== undefined &&
      (!isFiniteNumber(value[field]) ||
        value[field] < minimum ||
        value[field] > maximum)
    ) {
      issues.push({ path: `${path}.${field}`, message });
    }
  }
  for (const [field, allowed, message] of [
    ["fontWeight", TEXT_WEIGHT_SET, "Unsupported text weight."],
    ["fontStyle", TEXT_FONT_STYLE_SET, "Unsupported font style."],
    ["textDecoration", TEXT_DECORATION_SET, "Unsupported text decoration."],
    ["align", TEXT_ALIGN_SET, "Unsupported horizontal text alignment."],
    [
      "verticalAlign",
      TEXT_VERTICAL_ALIGN_SET,
      "Unsupported vertical text alignment.",
    ],
  ] as const) {
    if (
      value[field] !== undefined &&
      (typeof value[field] !== "string" || !allowed.has(value[field] as never))
    ) {
      issues.push({ path: `${path}.${field}`, message });
    }
  }

  return {
    ...(typeof value.color === "string" ? { color: value.color } : {}),
    ...(typeof value.fontFamily === "string"
      ? { fontFamily: value.fontFamily }
      : {}),
    ...(typeof value.fontSize === "number" ? { fontSize: value.fontSize } : {}),
    ...(typeof value.lineHeight === "number"
      ? { lineHeight: value.lineHeight }
      : {}),
    ...(typeof value.padding === "number" ? { padding: value.padding } : {}),
    ...(typeof value.fontWeight === "string"
      ? {
          fontWeight:
            value.fontWeight as NonNullable<
              SystemDesignNode["textStyle"]
            >["fontWeight"],
        }
      : {}),
    ...(typeof value.fontStyle === "string"
      ? {
          fontStyle:
            value.fontStyle as NonNullable<
              SystemDesignNode["textStyle"]
            >["fontStyle"],
        }
      : {}),
    ...(typeof value.textDecoration === "string"
      ? {
          textDecoration:
            value.textDecoration as NonNullable<
              SystemDesignNode["textStyle"]
            >["textDecoration"],
        }
      : {}),
    ...(typeof value.align === "string"
      ? {
          align:
            value.align as NonNullable<
              SystemDesignNode["textStyle"]
            >["align"],
        }
      : {}),
    ...(typeof value.verticalAlign === "string"
      ? {
          verticalAlign:
            value.verticalAlign as NonNullable<
              SystemDesignNode["textStyle"]
            >["verticalAlign"],
        }
      : {}),
  };
}

function migrateLegacyNode(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const { technology: legacyTechnology, ...node } = value;
  const technology =
    typeof legacyTechnology === "string"
      ? migrateLegacyTechnologyIdentity(legacyTechnology)
      : legacyTechnology;
  return {
    ...node,
    ...(technology ? { technology } : {}),
  };
}

/**
 * Converts a schema-v1, single-diagram document to the canonical schema-v3
 * shape. Non-v1 values are returned unchanged and validated by the caller.
 */
export function migrateSystemDesignDocument(value: unknown): unknown {
  if (
    isRecord(value) &&
    value.schemaVersion === SYSTEM_DESIGN_PREVIOUS_SCHEMA_VERSION
  ) {
    return { ...value, schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION };
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== SYSTEM_DESIGN_LEGACY_SCHEMA_VERSION
  ) {
    return value;
  }

  const rootDiagramId = isNonEmptyString(value.id)
    ? value.id
    : "legacy-root-diagram";
  const rootDiagram = {
    id: rootDiagramId,
    name: isNonEmptyString(value.title) ? value.title : "System Design",
    nodes: Array.isArray(value.nodes)
      ? value.nodes.map(migrateLegacyNode)
      : value.nodes,
    edges: value.edges,
    viewport: value.viewport,
  };

  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: value.id,
    problemId: value.problemId,
    title: value.title,
    status: value.status,
    rootDiagramId,
    diagrams: { [rootDiagramId]: rootDiagram },
    ...(value.metadata !== undefined ? { metadata: value.metadata } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function validateTechnology(
  value: unknown,
  path: string,
  issues: SystemDesignValidationIssue[],
): TechnologyIdentity | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push({
      path,
      message: "Expected a controlled technology identity.",
    });
    return undefined;
  }

  const id = typeof value.id === "string" ? value.id : null;
  const isCustom = id === "custom";
  const isRegistered =
    id !== null &&
    Object.hasOwn(SYSTEM_DESIGN_TECHNOLOGY_REGISTRY, id);

  if (!isCustom && !isRegistered) {
    issues.push({
      path: `${path}.id`,
      message: "Unsupported technology registry ID.",
    });
  }

  if (!isNonEmptyString(value.name)) {
    issues.push({
      path: `${path}.name`,
      message: "A technology display name is required.",
    });
  }

  if (isCustom) {
    if (value.category !== "custom") {
      issues.push({
        path: `${path}.category`,
        message: 'A custom technology must use the "custom" category.',
      });
    }
  } else if (isRegistered) {
    const definition =
      SYSTEM_DESIGN_TECHNOLOGY_REGISTRY[
        id as Exclude<TechnologyRegistryId, "custom">
      ];
    if (value.name !== definition.name) {
      issues.push({
        path: `${path}.name`,
        message: `Registered technology "${id}" must use the canonical name "${definition.name}".`,
      });
    }
    if (value.category !== definition.category) {
      issues.push({
        path: `${path}.category`,
        message: `Registered technology "${id}" must use the canonical category "${definition.category}".`,
      });
    }
  } else if (typeof value.category !== "string") {
    issues.push({
      path: `${path}.category`,
      message: "A technology category is required.",
    });
  }

  return {
    id: value.id as TechnologyRegistryId,
    name: value.name as string,
    category: value.category as TechnologyCategory,
  };
}

interface DiagramValidationContext {
  issues: SystemDesignValidationIssue[];
  globalNodeIds: Set<string>;
  nodeLocations: Map<string, string>;
  pendingChildReferences: {
    diagramId: string;
    nodeId: string;
    childDiagramId: string;
    path: string;
  }[];
  pendingParentModuleReferences: {
    diagramId: string;
    parentModuleId: string;
    path: string;
  }[];
}

function validateDiagram(
  value: unknown,
  key: string,
  path: string,
  context: DiagramValidationContext,
): SystemDesignDiagram | null {
  const { issues } = context;
  const issue = (issuePath: string, message: string) => {
    issues.push({ path: issuePath, message });
  };
  if (!isRecord(value)) {
    issue(path, "Expected a diagram object.");
    return null;
  }
  if (!isNonEmptyString(value.id)) {
    issue(`${path}.id`, "A diagram ID is required.");
  } else if (value.id !== key) {
    issue(`${path}.id`, "The diagram ID must match its record key.");
  }
  if (!isNonEmptyString(value.name)) {
    issue(`${path}.name`, "A diagram name is required.");
  }
  if (!isOptionalString(value.parentNodeId)) {
    issue(`${path}.parentNodeId`, "Expected a string.");
  } else if (
    typeof value.parentNodeId === "string" &&
    !isNonEmptyString(value.parentNodeId)
  ) {
    issue(`${path}.parentNodeId`, "A parent node ID cannot be empty.");
  }

  const localNodeIds = new Set<string>();
  const nodes: SystemDesignNode[] = [];
  if (!Array.isArray(value.nodes)) {
    issue(`${path}.nodes`, "Expected an array of nodes.");
  } else {
    value.nodes.forEach((candidate, index) => {
      const nodePath = `${path}.nodes[${index}]`;
      if (!isRecord(candidate)) {
        issue(nodePath, "Expected a node object.");
        return;
      }
      if (!isNonEmptyString(candidate.id)) {
        issue(`${nodePath}.id`, "A node ID is required.");
      } else if (localNodeIds.has(candidate.id)) {
        issue(`${nodePath}.id`, "Node IDs must be unique in a diagram.");
      } else if (context.globalNodeIds.has(candidate.id)) {
        issue(
          `${nodePath}.id`,
          "Node IDs must be unique across the document.",
        );
      } else {
        localNodeIds.add(candidate.id);
        context.globalNodeIds.add(candidate.id);
        context.nodeLocations.set(candidate.id, key);
      }
      if (
        typeof candidate.type !== "string" ||
        !NODE_TYPE_SET.has(candidate.type)
      ) {
        issue(`${nodePath}.type`, "Unsupported node type.");
      }
      if (!isFiniteNumber(candidate.x)) {
        issue(`${nodePath}.x`, "Expected a finite number.");
      }
      if (!isFiniteNumber(candidate.y)) {
        issue(`${nodePath}.y`, "Expected a finite number.");
      }
      const minimumWidth = candidate.type === "freehand" ? 1 : MIN_NODE_WIDTH;
      const minimumHeight = candidate.type === "freehand" ? 1 : MIN_NODE_HEIGHT;
      if (!isFiniteNumber(candidate.width) || candidate.width < minimumWidth) {
        issue(
          `${nodePath}.width`,
          `Width must be at least ${minimumWidth} pixel${minimumWidth === 1 ? "" : "s"}.`,
        );
      }
      if (!isFiniteNumber(candidate.height) || candidate.height < minimumHeight) {
        issue(
          `${nodePath}.height`,
          `Height must be at least ${minimumHeight} pixel${minimumHeight === 1 ? "" : "s"}.`,
        );
      }
      if (typeof candidate.label !== "string") {
        issue(`${nodePath}.label`, "Expected a node label string.");
      }
      if (!isOptionalString(candidate.subtitle)) {
        issue(`${nodePath}.subtitle`, "Expected a string.");
      }
      const technology = validateTechnology(
        candidate.technology,
        `${nodePath}.technology`,
        issues,
      );
      let asset: SystemDesignNode["asset"];
      if (candidate.asset !== undefined) {
        try {
          asset = parseSystemDesignNodeAsset(candidate.asset);
        } catch (error) {
          issue(
            `${nodePath}.asset`,
            error instanceof SystemDesignAssetError
              ? error.message
              : "Expected a safe embedded image asset.",
          );
        }
      }
      if (candidate.type === "image" && !asset) {
        issue(`${nodePath}.asset`, "Image nodes require an embedded asset.");
      } else if (candidate.type !== "image" && asset) {
        issue(`${nodePath}.asset`, "Only image nodes can contain image assets.");
      }
      const drawing = validateFreehandData(
        candidate.drawing,
        `${nodePath}.drawing`,
        issues,
      );
      if (candidate.type === "freehand" && !drawing) {
        issue(`${nodePath}.drawing`, "Freehand nodes require drawing data.");
      } else if (candidate.type !== "freehand" && drawing) {
        issue(`${nodePath}.drawing`, "Only freehand nodes can contain drawing data.");
      }
      const style = validateNodeStyle(
        candidate.style,
        `${nodePath}.style`,
        issues,
      );
      const textStyle = validateNodeTextStyle(
        candidate.textStyle,
        `${nodePath}.textStyle`,
        issues,
      );
      if (!isOptionalString(candidate.description)) {
        issue(`${nodePath}.description`, "Expected a string.");
      }
      if (!isOptionalString(candidate.childDiagramId)) {
        issue(`${nodePath}.childDiagramId`, "Expected a string.");
      } else if (
        typeof candidate.childDiagramId === "string" &&
        !isNonEmptyString(candidate.childDiagramId)
      ) {
        issue(
          `${nodePath}.childDiagramId`,
          "A child diagram ID cannot be empty.",
        );
      }
      if (!isOptionalBoolean(candidate.isExpandable)) {
        issue(`${nodePath}.isExpandable`, "Expected a boolean.");
      }
      if (!isOptionalBoolean(candidate.isCollapsed)) {
        issue(`${nodePath}.isCollapsed`, "Expected a boolean.");
      }
      if (!isOptionalString(candidate.parentModuleId)) {
        issue(`${nodePath}.parentModuleId`, "Expected a string.");
      }
      if (!isOptionalString(candidate.groupId)) {
        issue(`${nodePath}.groupId`, "Expected a string.");
      } else if (
        typeof candidate.groupId === "string" &&
        !isNonEmptyString(candidate.groupId)
      ) {
        issue(`${nodePath}.groupId`, "A group ID cannot be empty.");
      }
      if (
        typeof candidate.layer !== "number" ||
        !Number.isInteger(candidate.layer) ||
        candidate.layer < 0
      ) {
        issue(`${nodePath}.layer`, "Expected a non-negative integer.");
      }
      if (typeof candidate.locked !== "boolean") {
        issue(`${nodePath}.locked`, "Expected a boolean.");
      }
      if (typeof candidate.visible !== "boolean") {
        issue(`${nodePath}.visible`, "Expected a boolean.");
      }
      validateMetadata(candidate.metadata, `${nodePath}.metadata`, issues);

      if (
        isNonEmptyString(candidate.childDiagramId) &&
        isNonEmptyString(candidate.id)
      ) {
        context.pendingChildReferences.push({
          diagramId: key,
          nodeId: candidate.id,
          childDiagramId: candidate.childDiagramId,
          path: `${nodePath}.childDiagramId`,
        });
        if (
          typeof candidate.type !== "string" ||
          !isSystemDesignModuleNodeType(
            candidate.type as SystemDesignNodeType,
          )
        ) {
          issue(
            `${nodePath}.childDiagramId`,
            "Only module nodes can reference child diagrams.",
          );
        }
        if (candidate.isExpandable === false) {
          issue(
            `${nodePath}.isExpandable`,
            "A node with a child diagram must be expandable.",
          );
        }
      }
      if (isNonEmptyString(candidate.parentModuleId)) {
        context.pendingParentModuleReferences.push({
          diagramId: key,
          parentModuleId: candidate.parentModuleId,
          path: `${nodePath}.parentModuleId`,
        });
      }

      nodes.push({
        id: candidate.id as string,
        type: candidate.type as SystemDesignNodeType,
        x: candidate.x as number,
        y: candidate.y as number,
        width: candidate.width as number,
        height: candidate.height as number,
        label: candidate.label as string,
        ...(typeof candidate.subtitle === "string"
          ? { subtitle: candidate.subtitle }
          : {}),
        ...(technology ? { technology } : {}),
        ...(asset ? { asset } : {}),
        ...(drawing ? { drawing } : {}),
        ...(style ? { style } : {}),
        ...(textStyle ? { textStyle } : {}),
        ...(typeof candidate.description === "string"
          ? { description: candidate.description }
          : {}),
        ...(typeof candidate.childDiagramId === "string"
          ? { childDiagramId: candidate.childDiagramId }
          : {}),
        ...(typeof candidate.isExpandable === "boolean"
          ? { isExpandable: candidate.isExpandable }
          : {}),
        ...(typeof candidate.isCollapsed === "boolean"
          ? { isCollapsed: candidate.isCollapsed }
          : {}),
        ...(typeof candidate.parentModuleId === "string"
          ? { parentModuleId: candidate.parentModuleId }
          : {}),
        ...(typeof candidate.groupId === "string"
          ? { groupId: candidate.groupId }
          : {}),
        layer: candidate.layer as number,
        locked: candidate.locked as boolean,
        visible: candidate.visible as boolean,
        ...(candidate.metadata !== undefined
          ? { metadata: cloneStringMetadata(candidate.metadata) }
          : {}),
      });
    });
  }

  const edgeIds = new Set<string>();
  const edgeSignatures = new Set<string>();
  const edges: SystemDesignEdge[] = [];
  if (!Array.isArray(value.edges)) {
    issue(`${path}.edges`, "Expected an array of connections.");
  } else {
    value.edges.forEach((candidate, index) => {
      const edgePath = `${path}.edges[${index}]`;
      if (!isRecord(candidate)) {
        issue(edgePath, "Expected a connection object.");
        return;
      }
      if (!isNonEmptyString(candidate.id)) {
        issue(`${edgePath}.id`, "A connection ID is required.");
      } else if (edgeIds.has(candidate.id)) {
        issue(`${edgePath}.id`, "Connection IDs must be unique.");
      } else {
        edgeIds.add(candidate.id);
      }

      const sourceNodeId = isNonEmptyString(candidate.sourceNodeId)
        ? candidate.sourceNodeId
        : null;
      const targetNodeId = isNonEmptyString(candidate.targetNodeId)
        ? candidate.targetNodeId
        : null;
      if (!sourceNodeId) {
        issue(`${edgePath}.sourceNodeId`, "A source node ID is required.");
      } else if (!localNodeIds.has(sourceNodeId)) {
        issue(
          `${edgePath}.sourceNodeId`,
          "The source node does not exist in this diagram.",
        );
      }
      if (!targetNodeId) {
        issue(`${edgePath}.targetNodeId`, "A target node ID is required.");
      } else if (!localNodeIds.has(targetNodeId)) {
        issue(
          `${edgePath}.targetNodeId`,
          "The target node does not exist in this diagram.",
        );
      }
      if (sourceNodeId && targetNodeId && sourceNodeId === targetNodeId) {
        issue(edgePath, "A node cannot connect to itself.");
      }

      if (
        typeof candidate.sourcePort !== "string" ||
        !PORT_SET.has(candidate.sourcePort)
      ) {
        issue(`${edgePath}.sourcePort`, "Unsupported source port.");
      }
      if (
        typeof candidate.targetPort !== "string" ||
        !PORT_SET.has(candidate.targetPort)
      ) {
        issue(`${edgePath}.targetPort`, "Unsupported target port.");
      }
      if (
        typeof candidate.type !== "string" ||
        !EDGE_TYPE_SET.has(candidate.type)
      ) {
        issue(`${edgePath}.type`, "Unsupported connection type.");
      }
      if (!isOptionalString(candidate.label)) {
        issue(`${edgePath}.label`, "Expected a string.");
      }
      if (!isOptionalString(candidate.protocol)) {
        issue(`${edgePath}.protocol`, "Expected a string.");
      }
      if (!isOptionalString(candidate.description)) {
        issue(`${edgePath}.description`, "Expected a string.");
      }
      if (
        candidate.routing !== undefined &&
        (typeof candidate.routing !== "string" ||
          !EDGE_ROUTING_SET.has(candidate.routing))
      ) {
        issue(`${edgePath}.routing`, "Unsupported connection routing.");
      }
      if (
        candidate.color !== undefined &&
        !isSafeSystemDesignColor(candidate.color)
      ) {
        issue(`${edgePath}.color`, "Expected a safe hexadecimal or theme color.");
      }
      if (
        candidate.opacity !== undefined &&
        (!isFiniteNumber(candidate.opacity) ||
          candidate.opacity < 0.1 ||
          candidate.opacity > 1)
      ) {
        issue(`${edgePath}.opacity`, "Opacity must be between 0.1 and 1.");
      }
      if (
        candidate.strokeWidth !== undefined &&
        (!isFiniteNumber(candidate.strokeWidth) ||
          candidate.strokeWidth < 1 ||
          candidate.strokeWidth > 12)
      ) {
        issue(`${edgePath}.strokeWidth`, "Thickness must be between 1 and 12.");
      }
      if (
        candidate.lineStyle !== undefined &&
        (typeof candidate.lineStyle !== "string" ||
          !EDGE_LINE_STYLE_SET.has(candidate.lineStyle))
      ) {
        issue(`${edgePath}.lineStyle`, "Unsupported connection line style.");
      }
      if (
        candidate.dashPattern !== undefined &&
        (!Array.isArray(candidate.dashPattern) ||
          candidate.dashPattern.length < 2 ||
          candidate.dashPattern.length > 12 ||
          candidate.dashPattern.some(
            (entry) => !isFiniteNumber(entry) || entry <= 0 || entry > 100,
          ))
      ) {
        issue(
          `${edgePath}.dashPattern`,
          "Dash patterns require 2 to 12 positive values no greater than 100.",
        );
      }
      for (const [field, value] of [
        ["startArrowhead", candidate.startArrowhead],
        ["endArrowhead", candidate.endArrowhead],
      ] as const) {
        if (
          value !== undefined &&
          (typeof value !== "string" || !EDGE_ARROWHEAD_SET.has(value))
        ) {
          issue(`${edgePath}.${field}`, "Unsupported arrowhead style.");
        }
      }
      if (
        candidate.labelIcon !== undefined &&
        (typeof candidate.labelIcon !== "string" ||
          !EDGE_LABEL_ICON_SET.has(candidate.labelIcon))
      ) {
        issue(`${edgePath}.labelIcon`, "Unsupported connection label icon.");
      }
      if (
        candidate.labelPosition !== undefined &&
        (!isFiniteNumber(candidate.labelPosition) ||
          candidate.labelPosition < 0 ||
          candidate.labelPosition > 1)
      ) {
        issue(`${edgePath}.labelPosition`, "Label position must be between 0 and 1.");
      }
      for (const [field, value] of [
        ["labelBackground", candidate.labelBackground],
        ["labelTextColor", candidate.labelTextColor],
      ] as const) {
        if (value !== undefined && !isSafeSystemDesignColor(value)) {
          issue(`${edgePath}.${field}`, "Expected a safe hexadecimal or theme color.");
        }
      }
      if (
        candidate.animationMode !== undefined &&
        (typeof candidate.animationMode !== "string" ||
          !EDGE_ANIMATION_MODE_SET.has(candidate.animationMode))
      ) {
        issue(`${edgePath}.animationMode`, "Unsupported connection animation mode.");
      }
      if (
        candidate.animationSpeed !== undefined &&
        (!isFiniteNumber(candidate.animationSpeed) ||
          candidate.animationSpeed < 0.1 ||
          candidate.animationSpeed > 5)
      ) {
        issue(`${edgePath}.animationSpeed`, "Animation speed must be between 0.1 and 5.");
      }
      if (
        candidate.animationDirection !== undefined &&
        (typeof candidate.animationDirection !== "string" ||
          !EDGE_ANIMATION_DIRECTION_SET.has(candidate.animationDirection))
      ) {
        issue(
          `${edgePath}.animationDirection`,
          "Unsupported connection animation direction.",
        );
      }

      if (
        sourceNodeId &&
        targetNodeId &&
        typeof candidate.sourcePort === "string" &&
        PORT_SET.has(candidate.sourcePort) &&
        typeof candidate.targetPort === "string" &&
        PORT_SET.has(candidate.targetPort) &&
        typeof candidate.type === "string" &&
        EDGE_TYPE_SET.has(candidate.type)
      ) {
        const signature = [
          sourceNodeId,
          candidate.sourcePort,
          targetNodeId,
          candidate.targetPort,
          candidate.type,
        ].join(":");
        if (edgeSignatures.has(signature)) {
          issue(edgePath, "An exact duplicate connection already exists.");
        } else {
          edgeSignatures.add(signature);
        }
      }

      edges.push({
        id: candidate.id as string,
        sourceNodeId: candidate.sourceNodeId as string,
        targetNodeId: candidate.targetNodeId as string,
        sourcePort: candidate.sourcePort as SystemDesignPort,
        targetPort: candidate.targetPort as SystemDesignPort,
        type: candidate.type as SystemDesignEdgeType,
        ...(typeof candidate.label === "string"
          ? { label: candidate.label }
          : {}),
        ...(typeof candidate.protocol === "string"
          ? { protocol: candidate.protocol }
          : {}),
        ...(typeof candidate.description === "string"
          ? { description: candidate.description }
          : {}),
        ...(typeof candidate.routing === "string"
          ? { routing: candidate.routing as SystemDesignEdgeRouting }
          : {}),
        ...(typeof candidate.color === "string"
          ? { color: candidate.color }
          : {}),
        ...(typeof candidate.opacity === "number"
          ? { opacity: candidate.opacity }
          : {}),
        ...(typeof candidate.strokeWidth === "number"
          ? { strokeWidth: candidate.strokeWidth }
          : {}),
        ...(typeof candidate.lineStyle === "string"
          ? { lineStyle: candidate.lineStyle as SystemDesignEdgeLineStyle }
          : {}),
        ...(Array.isArray(candidate.dashPattern)
          ? { dashPattern: candidate.dashPattern as number[] }
          : {}),
        ...(typeof candidate.startArrowhead === "string"
          ? { startArrowhead: candidate.startArrowhead as SystemDesignArrowhead }
          : {}),
        ...(typeof candidate.endArrowhead === "string"
          ? { endArrowhead: candidate.endArrowhead as SystemDesignArrowhead }
          : {}),
        ...(typeof candidate.labelIcon === "string"
          ? { labelIcon: candidate.labelIcon as SystemDesignEdgeLabelIcon }
          : {}),
        ...(typeof candidate.labelPosition === "number"
          ? { labelPosition: candidate.labelPosition }
          : {}),
        ...(typeof candidate.labelBackground === "string"
          ? { labelBackground: candidate.labelBackground }
          : {}),
        ...(typeof candidate.labelTextColor === "string"
          ? { labelTextColor: candidate.labelTextColor }
          : {}),
        ...(typeof candidate.animationMode === "string"
          ? {
              animationMode:
                candidate.animationMode as SystemDesignEdgeAnimationMode,
            }
          : {}),
        ...(typeof candidate.animationSpeed === "number"
          ? { animationSpeed: candidate.animationSpeed }
          : {}),
        ...(typeof candidate.animationDirection === "string"
          ? {
              animationDirection:
                candidate.animationDirection as SystemDesignEdgeAnimationDirection,
            }
          : {}),
      });
    });
  }

  if (!isRecord(value.viewport)) {
    issue(`${path}.viewport`, "Expected a viewport object.");
  } else {
    if (!isFiniteNumber(value.viewport.x)) {
      issue(`${path}.viewport.x`, "Expected a finite number.");
    }
    if (!isFiniteNumber(value.viewport.y)) {
      issue(`${path}.viewport.y`, "Expected a finite number.");
    }
    if (
      !isFiniteNumber(value.viewport.zoom) ||
      value.viewport.zoom < MIN_ZOOM ||
      value.viewport.zoom > MAX_ZOOM
    ) {
      issue(
        `${path}.viewport.zoom`,
        `Zoom must be between ${MIN_ZOOM} and ${MAX_ZOOM}.`,
      );
    }
  }

  return {
    id: value.id as string,
    name: value.name as string,
    ...(typeof value.parentNodeId === "string"
      ? { parentNodeId: value.parentNodeId }
      : {}),
    nodes,
    edges,
    viewport: isRecord(value.viewport)
      ? {
          x: value.viewport.x as number,
          y: value.viewport.y as number,
          zoom: value.viewport.zoom as number,
        }
      : { x: 0, y: 0, zoom: 1 },
  };
}

function validateDiagramHierarchy(
  diagrams: Record<string, SystemDesignDiagram>,
  rootDiagramId: string,
  context: DiagramValidationContext,
  issue: (path: string, message: string) => void,
): void {
  const validModuleReferences =
    context.pendingChildReferences.filter((reference) => {
      const parentNode = diagrams[reference.diagramId]?.nodes.find(
        (node) => node.id === reference.nodeId,
      );
      return (
        parentNode !== undefined &&
        isSystemDesignModuleNodeType(parentNode.type) &&
        Object.hasOwn(diagrams, reference.childDiagramId)
      );
    });
  const incomingReferences = new Map<
    string,
    typeof validModuleReferences
  >();
  const outgoingReferences = new Map<
    string,
    typeof validModuleReferences
  >();

  for (const reference of validModuleReferences) {
    const incoming = incomingReferences.get(reference.childDiagramId) ?? [];
    incoming.push(reference);
    incomingReferences.set(reference.childDiagramId, incoming);

    const outgoing = outgoingReferences.get(reference.diagramId) ?? [];
    outgoing.push(reference);
    outgoingReferences.set(reference.diagramId, outgoing);
  }

  for (const reference of context.pendingChildReferences) {
    const child = diagrams[reference.childDiagramId];
    if (!child) {
      issue(reference.path, "The referenced child diagram does not exist.");
    } else if (child.parentNodeId !== reference.nodeId) {
      issue(
        reference.path,
        "The child diagram must reference this node as its parent.",
      );
    }
  }

  for (const [diagramId, diagram] of Object.entries(diagrams)) {
    const parentPath = `$.diagrams.${diagramId}.parentNodeId`;
    const incoming = incomingReferences.get(diagramId) ?? [];

    if (diagramId === rootDiagramId) {
      for (const reference of incoming) {
        issue(
          reference.path,
          "The root diagram cannot be referenced as a child diagram.",
        );
      }
      continue;
    }

    if (incoming.length !== 1) {
      issue(
        parentPath,
        `Every non-root diagram must have exactly one parent module reference; found ${incoming.length}.`,
      );
    }
    if (!isNonEmptyString(diagram.parentNodeId)) {
      issue(parentPath, "A non-root diagram must identify its parent node.");
      continue;
    }

    const parentDiagramId = context.nodeLocations.get(diagram.parentNodeId);
    if (!parentDiagramId) {
      issue(parentPath, "The parent node does not exist.");
      continue;
    }

    const parentNode = diagrams[parentDiagramId]?.nodes.find(
      (node) => node.id === diagram.parentNodeId,
    );
    if (
      !parentNode ||
      !isSystemDesignModuleNodeType(parentNode.type)
    ) {
      issue(parentPath, "A child diagram must be owned by a module node.");
    } else if (parentNode.childDiagramId !== diagramId) {
      issue(
        parentPath,
        "The parent module must reference this child diagram.",
      );
    }

    if (
      incoming.length === 1 &&
      incoming[0].nodeId !== diagram.parentNodeId
    ) {
      issue(
        parentPath,
        "The diagram parent must match its sole parent module reference.",
      );
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visitForCycles = (diagramId: string): void => {
    if (visited.has(diagramId)) return;
    visiting.add(diagramId);

    for (const reference of outgoingReferences.get(diagramId) ?? []) {
      if (visiting.has(reference.childDiagramId)) {
        issue(
          reference.path,
          "Child-diagram references must not form a cycle.",
        );
      } else {
        visitForCycles(reference.childDiagramId);
      }
    }

    visiting.delete(diagramId);
    visited.add(diagramId);
  };

  for (const diagramId of Object.keys(diagrams)) {
    visitForCycles(diagramId);
  }

  if (!Object.hasOwn(diagrams, rootDiagramId)) return;

  const reachable = new Set<string>();
  const pending = [rootDiagramId];
  while (pending.length > 0) {
    const diagramId = pending.pop();
    if (!diagramId || reachable.has(diagramId)) continue;
    reachable.add(diagramId);
    for (const reference of outgoingReferences.get(diagramId) ?? []) {
      pending.push(reference.childDiagramId);
    }
  }

  for (const diagramId of Object.keys(diagrams)) {
    if (diagramId === rootDiagramId || reachable.has(diagramId)) continue;
    issue(
      `$.diagrams.${diagramId}`,
      "Diagram is orphaned; every non-root diagram must be reachable from the root through module child references.",
    );
  }
}

export function validateSystemDesignDocument(
  input: unknown,
): SystemDesignValidationResult {
  const migrated =
    isRecord(input) &&
    (input.schemaVersion === SYSTEM_DESIGN_LEGACY_SCHEMA_VERSION ||
      input.schemaVersion === SYSTEM_DESIGN_PREVIOUS_SCHEMA_VERSION);
  const value = migrateSystemDesignDocument(input);
  const issues: SystemDesignValidationIssue[] = [];
  const issue = (path: string, message: string) => {
    issues.push({ path, message });
  };

  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [{ path: "$", message: "Expected a JSON object." }],
      migrated: false,
    };
  }

  if (value.schemaVersion !== SYSTEM_DESIGN_SCHEMA_VERSION) {
    issue(
      "$.schemaVersion",
      `Expected schema version ${SYSTEM_DESIGN_SCHEMA_VERSION} (schema versions ${SYSTEM_DESIGN_LEGACY_SCHEMA_VERSION} and ${SYSTEM_DESIGN_PREVIOUS_SCHEMA_VERSION} are migrated automatically).`,
    );
  }
  if (!isNonEmptyString(value.id)) issue("$.id", "A document ID is required.");
  if (
    value.problemId !== undefined &&
    !isNonEmptyString(value.problemId)
  ) {
    issue("$.problemId", "A problem ID cannot be empty.");
  }
  if (!isNonEmptyString(value.title)) {
    issue("$.title", "A document title is required.");
  }
  if (value.status !== "in_progress" && value.status !== "completed") {
    issue("$.status", 'Expected "in_progress" or "completed".');
  }
  if (!isNonEmptyString(value.rootDiagramId)) {
    issue("$.rootDiagramId", "A root diagram ID is required.");
  }
  validateMetadata(value.metadata, "$.metadata", issues);
  if (!isIsoTimestamp(value.createdAt)) {
    issue("$.createdAt", "Expected a valid ISO timestamp.");
  }
  if (!isIsoTimestamp(value.updatedAt)) {
    issue("$.updatedAt", "Expected a valid ISO timestamp.");
  }

  const context: DiagramValidationContext = {
    issues,
    globalNodeIds: new Set<string>(),
    nodeLocations: new Map<string, string>(),
    pendingChildReferences: [],
    pendingParentModuleReferences: [],
  };
  const diagrams: Record<string, SystemDesignDiagram> = {};
  if (!isRecord(value.diagrams)) {
    issue("$.diagrams", "Expected a record of diagrams.");
  } else {
    for (const [diagramId, diagramValue] of Object.entries(value.diagrams)) {
      const diagram = validateDiagram(
        diagramValue,
        diagramId,
        `$.diagrams.${diagramId}`,
        context,
      );
      if (diagram) diagrams[diagramId] = diagram;
    }
  }

  if (
    isNonEmptyString(value.rootDiagramId) &&
    !Object.hasOwn(diagrams, value.rootDiagramId)
  ) {
    issue(
      "$.rootDiagramId",
      "The root diagram does not exist in the diagrams record.",
    );
  } else if (
    isNonEmptyString(value.rootDiagramId) &&
    diagrams[value.rootDiagramId]?.parentNodeId
  ) {
    issue(
      `$.diagrams.${value.rootDiagramId}.parentNodeId`,
      "The root diagram cannot have a parent node.",
    );
  }

  if (isNonEmptyString(value.rootDiagramId)) {
    validateDiagramHierarchy(
      diagrams,
      value.rootDiagramId,
      context,
      issue,
    );
  }

  for (const reference of context.pendingParentModuleReferences) {
    const diagram = diagrams[reference.diagramId];
    const localParent = diagram?.nodes.find(
      (node) => node.id === reference.parentModuleId,
    );
    const owningModuleDiagramId =
      diagram?.parentNodeId === reference.parentModuleId
        ? context.nodeLocations.get(reference.parentModuleId)
        : undefined;
    const owningModule = owningModuleDiagramId
      ? diagrams[owningModuleDiagramId]?.nodes.find(
          (node) => node.id === reference.parentModuleId,
        )
      : undefined;
    const parentNode = localParent ?? owningModule;

    if (!parentNode) {
      issue(
        reference.path,
        "The parent module must exist in this diagram or own this child diagram.",
      );
    } else if (
      !isSystemDesignModuleNodeType(parentNode.type) &&
      !isSystemDesignBoundaryNodeType(parentNode.type)
    ) {
      issue(
        reference.path,
        "The parent must be a module or structural boundary.",
      );
    }
  }

  const nodeCount = Object.values(diagrams).reduce(
    (count, diagram) => count + diagram.nodes.length,
    0,
  );
  if (value.status === "completed" && nodeCount === 0) {
    issue("$.status", "An empty document cannot be marked complete.");
  }

  if (issues.length > 0) {
    return { valid: false, issues, migrated: false };
  }

  const document: SystemDesignDocument = {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: value.id as string,
    ...(typeof value.problemId === "string"
      ? { problemId: value.problemId }
      : {}),
    title: value.title as string,
    status: value.status as SystemDesignDocument["status"],
    rootDiagramId: value.rootDiagramId as string,
    diagrams,
    ...(value.metadata !== undefined
      ? { metadata: cloneStringMetadata(value.metadata) }
      : {}),
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
  };

  return {
    valid: true,
    document: cloneSystemDesignDocument(document),
    issues: [],
    migrated,
  };
}

export function parseSystemDesignDocument(
  value: unknown,
): SystemDesignDocument {
  const result = validateSystemDesignDocument(value);
  if (!result.valid) throw new SystemDesignValidationError(result.issues);
  return result.document;
}
