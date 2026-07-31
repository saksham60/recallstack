import { SYSTEM_DESIGN_NODE_TYPE_ORDER } from "../constants/system-design-palette";
import { SYSTEM_DESIGN_TECHNOLOGY_REGISTRY } from "../constants/system-design-visual-registry";
import {
  SYSTEM_DESIGN_LEGACY_SCHEMA_VERSION,
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type SystemDesignDiagram,
  type SystemDesignDocument,
  type SystemDesignEdge,
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

const ARCHITECTURE_NODE_TYPES = [
  "module",
  "system_boundary",
  "container",
  "text",
  "note",
] as const satisfies readonly SystemDesignNodeType[];

const EDGE_TYPES = [
  "request",
  "response",
  "async",
  "event",
  "data",
  "replication",
  "read",
  "write",
  "stream",
] as const satisfies readonly SystemDesignEdgeType[];

const PORTS = [
  "top",
  "right",
  "bottom",
  "left",
] as const satisfies readonly SystemDesignPort[];

const EDGE_ROUTING = [
  "straight",
  "curved",
] as const satisfies readonly SystemDesignEdgeRouting[];

const NODE_TYPE_SET = new Set<string>([
  ...SYSTEM_DESIGN_NODE_TYPE_ORDER,
  ...ARCHITECTURE_NODE_TYPES,
]);
const EDGE_TYPE_SET = new Set<string>(EDGE_TYPES);
const PORT_SET = new Set<string>(PORTS);
const EDGE_ROUTING_SET = new Set<string>(EDGE_ROUTING);

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
 * Converts a schema-v1, single-diagram document to the canonical schema-v2
 * shape. Non-v1 values are returned unchanged and validated by the caller.
 */
export function migrateSystemDesignDocument(value: unknown): unknown {
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
      if (
        !isFiniteNumber(candidate.width) ||
        candidate.width < MIN_NODE_WIDTH
      ) {
        issue(
          `${nodePath}.width`,
          `Width must be at least ${MIN_NODE_WIDTH} pixels.`,
        );
      }
      if (
        !isFiniteNumber(candidate.height) ||
        candidate.height < MIN_NODE_HEIGHT
      ) {
        issue(
          `${nodePath}.height`,
          `Height must be at least ${MIN_NODE_HEIGHT} pixels.`,
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
        if (candidate.type !== "module") {
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
        parentNode?.type === "module" &&
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
    if (parentNode?.type !== "module") {
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
    input.schemaVersion === SYSTEM_DESIGN_LEGACY_SCHEMA_VERSION;
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
      `Expected schema version ${SYSTEM_DESIGN_SCHEMA_VERSION} (schema version ${SYSTEM_DESIGN_LEGACY_SCHEMA_VERSION} is migrated automatically).`,
    );
  }
  if (!isNonEmptyString(value.id)) issue("$.id", "A document ID is required.");
  if (!isNonEmptyString(value.problemId)) {
    issue("$.problemId", "A problem ID is required.");
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
      parentNode.type !== "module" &&
      parentNode.type !== "container" &&
      parentNode.type !== "system_boundary"
    ) {
      issue(
        reference.path,
        "The parent must be a module, container, or system boundary.",
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
    problemId: value.problemId as string,
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
