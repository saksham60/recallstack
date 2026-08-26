import {
  getSystemDesignNodeDefinition,
  isSystemDesignModuleNodeType,
} from "../constants/system-design-palette";
import {
  SYSTEM_DESIGN_TECHNOLOGY_REGISTRY,
  resolveSystemDesignTechnology,
} from "../constants/system-design-visual-registry";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type ProblemStatus,
  type SystemDesignDiagram,
  type SystemDesignDocument,
  type SystemDesignDocumentSummary,
  type SystemDesignEdge,
  type SystemDesignEdgeType,
  type SystemDesignFreehandData,
  type SystemDesignNode,
  type SystemDesignNodeType,
  type SystemDesignPoint,
  type SystemDesignPort,
  type SystemDesignProblem,
  type SystemDesignViewport,
  type TechnologyIdentity,
  type TechnologyRegistryId,
} from "../types/system-design.types";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const MIN_NODE_WIDTH = 120;
export const MIN_NODE_HEIGHT = 72;
export const SYSTEM_DESIGN_HISTORY_LIMIT = 50;
export const SYSTEM_DESIGN_PASTE_OFFSET = 32;

export const DEFAULT_SYSTEM_DESIGN_VIEWPORT: Readonly<SystemDesignViewport> = {
  x: 0,
  y: 0,
  zoom: 1,
};

export function createTechnologyIdentity(
  id: TechnologyRegistryId,
  customName?: string,
): TechnologyIdentity {
  if (id === "custom") {
    return {
      id,
      name: customName?.trim() || "Custom technology",
      category: "custom",
    };
  }
  const definition = SYSTEM_DESIGN_TECHNOLOGY_REGISTRY[id];
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
  };
}

/**
 * Converts schema-v1 technology strings into safe registry identities.
 * Unknown labels retain their original name and use the bundled generic icon.
 */
export function migrateLegacyTechnologyIdentity(
  value: string | TechnologyIdentity | undefined,
): TechnologyIdentity | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return { ...value };
  const name = value.trim();
  if (!name) return undefined;
  const definition = resolveSystemDesignTechnology(name);
  return definition
    ? createTechnologyIdentity(definition.id)
    : createTechnologyIdentity("custom", name);
}

export function createNextSystemDesignTimestamp(
  previous: string,
  candidate = new Date().toISOString(),
): string {
  const previousTime = Date.parse(previous);
  const candidateTime = Date.parse(candidate);
  if (!Number.isFinite(previousTime)) return candidate;
  if (Number.isFinite(candidateTime) && candidateTime > previousTime) {
    return candidate;
  }
  return new Date(previousTime + 1).toISOString();
}

export function createSystemDesignId(prefix: string): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure random IDs are unavailable in this environment.");
  }
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

export function createEmptySystemDesignDocument(
  problem: Pick<SystemDesignProblem, "id" | "title">,
  now = new Date().toISOString(),
): SystemDesignDocument {
  const rootDiagram = createEmptySystemDesignDiagram(problem.title);
  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: createSystemDesignId("document"),
    problemId: problem.id,
    title: problem.title,
    status: "in_progress",
    rootDiagramId: rootDiagram.id,
    diagrams: { [rootDiagram.id]: rootDiagram },
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptyStandaloneSystemDesignDocument(
  title = "Canvas",
  now = new Date().toISOString(),
): SystemDesignDocument {
  const rootDiagram = createEmptySystemDesignDiagram(title);
  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: createSystemDesignId("document"),
    title,
    status: "in_progress",
    rootDiagramId: rootDiagram.id,
    diagrams: { [rootDiagram.id]: rootDiagram },
    createdAt: now,
    updatedAt: now,
  };
}

export function createEmptySystemDesignDiagram(
  name: string,
  overrides: Partial<
    Pick<SystemDesignDiagram, "id" | "parentNodeId" | "viewport">
  > = {},
): SystemDesignDiagram {
  return {
    id: overrides.id ?? createSystemDesignId("diagram"),
    name,
    parentNodeId: overrides.parentNodeId,
    nodes: [],
    edges: [],
    viewport: {
      ...(overrides.viewport ?? DEFAULT_SYSTEM_DESIGN_VIEWPORT),
    },
  };
}

type NodeOverrides = Partial<
  Omit<SystemDesignNode, "id" | "type" | "x" | "y">
> & {
  id?: string;
};

export function createSystemDesignNode(
  type: SystemDesignNodeType,
  position: SystemDesignPoint,
  overrides: NodeOverrides = {},
): SystemDesignNode {
  const definition = getSystemDesignNodeDefinition(type);
  return {
    id: overrides.id ?? createSystemDesignId("node"),
    type,
    x: position.x,
    y: position.y,
    width: overrides.width ?? definition.defaultWidth,
    height: overrides.height ?? definition.defaultHeight,
    label: overrides.label ?? definition.label,
    subtitle: overrides.subtitle,
    technology: overrides.technology
      ? { ...overrides.technology }
      : undefined,
    description: overrides.description,
    childDiagramId: overrides.childDiagramId,
    isExpandable:
      overrides.isExpandable ??
      (isSystemDesignModuleNodeType(type) ? true : undefined),
    isCollapsed: overrides.isCollapsed,
    parentModuleId: overrides.parentModuleId,
    groupId: overrides.groupId,
    layer: overrides.layer ?? 0,
    locked: overrides.locked ?? false,
    visible: overrides.visible ?? true,
    asset: overrides.asset ? { ...overrides.asset } : undefined,
    drawing: overrides.drawing
      ? {
          ...overrides.drawing,
          points: [...overrides.drawing.points],
          dashPattern: overrides.drawing.dashPattern
            ? [...overrides.drawing.dashPattern]
            : undefined,
        }
      : undefined,
    style: overrides.style ? { ...overrides.style } : undefined,
    textStyle: overrides.textStyle ? { ...overrides.textStyle } : undefined,
    metadata: overrides.metadata ? { ...overrides.metadata } : undefined,
  };
}

export function createSystemDesignFreehandNode(
  points: readonly SystemDesignPoint[],
  options: {
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    parentModuleId?: string;
  } = {},
): SystemDesignNode | null {
  if (points.length < 2) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const strokeWidth = options.strokeWidth ?? 3;
  const padding = Math.max(2, strokeWidth);
  const left = Math.min(...xs) - padding;
  const top = Math.min(...ys) - padding;
  const right = Math.max(...xs) + padding;
  const bottom = Math.max(...ys) + padding;
  const drawing: SystemDesignFreehandData = {
    points: points.flatMap((point) => [point.x - left, point.y - top]),
    stroke: options.stroke ?? "#fafafa",
    strokeWidth,
    lineStyle: "solid",
    animationMode: "moving_dash",
    animationSpeed: 1,
    animationDirection: "forward",
    ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
  };
  return createSystemDesignNode("freehand", { x: left, y: top }, {
    label: "Freehand drawing",
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    parentModuleId: options.parentModuleId,
    drawing,
  });
}

type EdgeOverrides = Partial<
  Omit<
    SystemDesignEdge,
    | "id"
    | "sourceNodeId"
    | "targetNodeId"
    | "sourcePort"
    | "targetPort"
  >
> & {
  id?: string;
};

export function createSystemDesignEdge(
  sourceNodeId: string,
  targetNodeId: string,
  sourcePort: SystemDesignPort,
  targetPort: SystemDesignPort,
  overrides: EdgeOverrides = {},
): SystemDesignEdge {
  return {
    id: overrides.id ?? createSystemDesignId("edge"),
    sourceNodeId,
    targetNodeId,
    sourcePort,
    targetPort,
    type: overrides.type ?? ("http_request" satisfies SystemDesignEdgeType),
    label: overrides.label,
    protocol: overrides.protocol,
    description: overrides.description,
    routing: overrides.routing ?? "straight",
    color: overrides.color,
    opacity: overrides.opacity,
    strokeWidth: overrides.strokeWidth,
    lineStyle: overrides.lineStyle,
    dashPattern: overrides.dashPattern
      ? [...overrides.dashPattern]
      : undefined,
    startArrowhead: overrides.startArrowhead,
    endArrowhead: overrides.endArrowhead,
    labelIcon: overrides.labelIcon,
    labelPosition: overrides.labelPosition,
    labelBackground: overrides.labelBackground,
    labelTextColor: overrides.labelTextColor,
    animationMode: overrides.animationMode,
    animationSpeed: overrides.animationSpeed,
    animationDirection: overrides.animationDirection,
  };
}

export function cloneSystemDesignDocument(
  document: SystemDesignDocument,
): SystemDesignDocument {
  const diagrams = Object.fromEntries(
    Object.entries(document.diagrams).map(([diagramId, diagram]) => [
      diagramId,
      cloneSystemDesignDiagram(diagram),
    ]),
  );
  return {
    ...document,
    diagrams,
    metadata: document.metadata ? { ...document.metadata } : undefined,
  };
}

export function cloneSystemDesignDiagram(
  diagram: SystemDesignDiagram,
): SystemDesignDiagram {
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => ({
      ...node,
      technology: node.technology ? { ...node.technology } : undefined,
      asset: node.asset ? { ...node.asset } : undefined,
      drawing: node.drawing
        ? {
            ...node.drawing,
            points: [...node.drawing.points],
            dashPattern: node.drawing.dashPattern
              ? [...node.drawing.dashPattern]
              : undefined,
          }
        : undefined,
      style: node.style ? { ...node.style } : undefined,
      textStyle: node.textStyle ? { ...node.textStyle } : undefined,
      metadata: node.metadata ? { ...node.metadata } : undefined,
    })),
    edges: diagram.edges.map((edge) => ({
      ...edge,
      dashPattern: edge.dashPattern ? [...edge.dashPattern] : undefined,
    })),
    viewport: { ...diagram.viewport },
  };
}

export function getSystemDesignDiagram(
  document: SystemDesignDocument,
  diagramId: string,
): SystemDesignDiagram | undefined {
  return document.diagrams[diagramId];
}

export function getRootSystemDesignDiagram(
  document: SystemDesignDocument,
): SystemDesignDiagram {
  const diagram = getSystemDesignDiagram(document, document.rootDiagramId);
  if (!diagram) {
    throw new Error(
      `System-design root diagram "${document.rootDiagramId}" does not exist.`,
    );
  }
  return diagram;
}

export function findParentSystemDesignDiagram(
  document: SystemDesignDocument,
  diagramId: string,
): SystemDesignDiagram | undefined {
  const diagram = getSystemDesignDiagram(document, diagramId);
  if (!diagram?.parentNodeId) return undefined;
  const parentNodeId = diagram.parentNodeId;
  return Object.values(document.diagrams).find((candidate) =>
    candidate.nodes.some((node) => node.id === parentNodeId),
  );
}

export function getSystemDesignDiagramBreadcrumbs(
  document: SystemDesignDocument,
  diagramId: string,
): SystemDesignDiagram[] {
  const breadcrumbs: SystemDesignDiagram[] = [];
  const visited = new Set<string>();
  let current = getSystemDesignDiagram(document, diagramId);

  while (current && !visited.has(current.id)) {
    breadcrumbs.unshift(current);
    visited.add(current.id);
    current = findParentSystemDesignDiagram(document, current.id);
  }

  return breadcrumbs;
}

export function replaceSystemDesignDiagram(
  document: SystemDesignDocument,
  diagram: SystemDesignDiagram,
): SystemDesignDocument {
  return {
    ...document,
    diagrams: {
      ...document.diagrams,
      [diagram.id]: cloneSystemDesignDiagram(diagram),
    },
  };
}

export function countSystemDesignElements(
  document: SystemDesignDocument,
): { nodeCount: number; edgeCount: number } {
  return Object.values(document.diagrams).reduce(
    (counts, diagram) => ({
      nodeCount: counts.nodeCount + diagram.nodes.length,
      edgeCount: counts.edgeCount + diagram.edges.length,
    }),
    { nodeCount: 0, edgeCount: 0 },
  );
}

export function normalizeSystemDesignLayers(
  nodes: readonly SystemDesignNode[],
): SystemDesignNode[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort(
      (left, right) =>
        left.node.layer - right.node.layer || left.index - right.index,
    )
    .map(({ node }, layer) => ({ ...node, layer }));
}

export function createSystemDesignDocumentSummary(
  document: SystemDesignDocument,
): SystemDesignDocumentSummary {
  const { nodeCount, edgeCount } = countSystemDesignElements(document);
  return {
    problemId: document.problemId ?? document.id,
    title: document.title,
    status: deriveSystemDesignProblemStatus(document),
    nodeCount,
    edgeCount,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export function deriveSystemDesignProblemStatus(
  document: SystemDesignDocument | null | undefined,
): ProblemStatus {
  if (!document) return "not_started";
  if (document.status === "completed") return "completed";
  return countSystemDesignElements(document).nodeCount > 0
    ? "in_progress"
    : "not_started";
}
