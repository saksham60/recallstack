import { getSystemDesignNodeDefinition } from "../constants/system-design-palette";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type ProblemStatus,
  type SystemDesignDiagram,
  type SystemDesignDocument,
  type SystemDesignDocumentSummary,
  type SystemDesignEdge,
  type SystemDesignEdgeType,
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

const TECHNOLOGY_IDENTITIES: Readonly<
  Record<
    Exclude<TechnologyRegistryId, "custom">,
    Omit<TechnologyIdentity, "id">
  >
> = {
  postgresql: { name: "PostgreSQL", category: "database" },
  mysql: { name: "MySQL", category: "database" },
  mongodb: { name: "MongoDB", category: "database" },
  redis: { name: "Redis", category: "cache" },
  kafka: { name: "Apache Kafka", category: "messaging" },
  rabbitmq: { name: "RabbitMQ", category: "messaging" },
  elasticsearch: { name: "Elasticsearch", category: "search" },
  kubernetes: { name: "Kubernetes", category: "container" },
  docker: { name: "Docker", category: "container" },
  aws_lambda: { name: "AWS Lambda", category: "compute" },
  aws_s3: { name: "Amazon S3", category: "storage" },
  aws_cloudfront: { name: "Amazon CloudFront", category: "networking" },
  nginx: { name: "NGINX", category: "networking" },
  kong: { name: "Kong Gateway", category: "networking" },
  firebase: { name: "Firebase", category: "platform" },
  supabase: { name: "Supabase", category: "platform" },
  gcp_pubsub: {
    name: "Google Cloud Pub/Sub",
    category: "messaging",
  },
};

const TECHNOLOGY_NAME_TO_ID = new Map<string, TechnologyRegistryId>(
  Object.entries(TECHNOLOGY_IDENTITIES).flatMap(([id, identity]) => {
    const aliases = [identity.name, id.replaceAll("_", " ")];
    if (id === "aws_s3") aliases.push("S3");
    if (id === "aws_cloudfront") aliases.push("CloudFront");
    if (id === "gcp_pubsub") aliases.push("Google Cloud Pub/Sub");
    return aliases.map((name) => [
      normalizeTechnologyLookupName(name),
      id as TechnologyRegistryId,
    ]);
  }),
);

function normalizeTechnologyLookupName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

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
  return { id, ...TECHNOLOGY_IDENTITIES[id] };
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
  const id = TECHNOLOGY_NAME_TO_ID.get(normalizeTechnologyLookupName(name));
  return id ? createTechnologyIdentity(id) : createTechnologyIdentity("custom", name);
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
    isExpandable: overrides.isExpandable,
    isCollapsed: overrides.isCollapsed,
    parentModuleId: overrides.parentModuleId,
    layer: overrides.layer ?? 0,
    locked: overrides.locked ?? false,
    visible: overrides.visible ?? true,
    metadata: overrides.metadata ? { ...overrides.metadata } : undefined,
  };
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
    type: overrides.type ?? ("request" satisfies SystemDesignEdgeType),
    label: overrides.label,
    protocol: overrides.protocol,
    description: overrides.description,
    routing: overrides.routing ?? "straight",
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
      metadata: node.metadata ? { ...node.metadata } : undefined,
    })),
    edges: diagram.edges.map((edge) => ({ ...edge })),
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
    problemId: document.problemId,
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
