import { SYSTEM_DESIGN_NODE_TYPE_ORDER } from "../constants/system-design-palette";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type SystemDesignDocument,
  type SystemDesignEdgeRouting,
  type SystemDesignEdgeType,
  type SystemDesignPort,
} from "../types/system-design.types";
import {
  MAX_ZOOM,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  MIN_ZOOM,
  cloneSystemDesignDocument,
} from "./system-design-defaults";

const EDGE_TYPES = [
  "request",
  "response",
  "async",
  "event",
  "data",
  "replication",
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

const NODE_TYPE_SET = new Set<string>(SYSTEM_DESIGN_NODE_TYPE_ORDER);
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
    }
  | {
      valid: false;
      issues: SystemDesignValidationIssue[];
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
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

export function validateSystemDesignDocument(
  value: unknown,
): SystemDesignValidationResult {
  const issues: SystemDesignValidationIssue[] = [];
  const issue = (path: string, message: string) => {
    issues.push({ path, message });
  };

  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [{ path: "$", message: "Expected a JSON object." }],
    };
  }

  if (value.schemaVersion !== SYSTEM_DESIGN_SCHEMA_VERSION) {
    issue(
      "$.schemaVersion",
      `Expected schema version ${SYSTEM_DESIGN_SCHEMA_VERSION}.`,
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
  if (!isIsoTimestamp(value.createdAt)) {
    issue("$.createdAt", "Expected a valid ISO timestamp.");
  }
  if (!isIsoTimestamp(value.updatedAt)) {
    issue("$.updatedAt", "Expected a valid ISO timestamp.");
  }

  const nodeIds = new Set<string>();
  if (!Array.isArray(value.nodes)) {
    issue("$.nodes", "Expected an array of nodes.");
  } else {
    value.nodes.forEach((candidate, index) => {
      const path = `$.nodes[${index}]`;
      if (!isRecord(candidate)) {
        issue(path, "Expected a node object.");
        return;
      }
      if (!isNonEmptyString(candidate.id)) {
        issue(`${path}.id`, "A node ID is required.");
      } else if (nodeIds.has(candidate.id)) {
        issue(`${path}.id`, "Node IDs must be unique.");
      } else {
        nodeIds.add(candidate.id);
      }
      if (
        typeof candidate.type !== "string" ||
        !NODE_TYPE_SET.has(candidate.type)
      ) {
        issue(`${path}.type`, "Unsupported node type.");
      }
      if (!isFiniteNumber(candidate.x)) {
        issue(`${path}.x`, "Expected a finite number.");
      }
      if (!isFiniteNumber(candidate.y)) {
        issue(`${path}.y`, "Expected a finite number.");
      }
      if (
        !isFiniteNumber(candidate.width) ||
        candidate.width < MIN_NODE_WIDTH
      ) {
        issue(
          `${path}.width`,
          `Width must be at least ${MIN_NODE_WIDTH} pixels.`,
        );
      }
      if (
        !isFiniteNumber(candidate.height) ||
        candidate.height < MIN_NODE_HEIGHT
      ) {
        issue(
          `${path}.height`,
          `Height must be at least ${MIN_NODE_HEIGHT} pixels.`,
        );
      }
      if (typeof candidate.label !== "string") {
        issue(`${path}.label`, "Expected a node label string.");
      }
      if (!isOptionalString(candidate.subtitle)) {
        issue(`${path}.subtitle`, "Expected a string.");
      }
      if (!isOptionalString(candidate.technology)) {
        issue(`${path}.technology`, "Expected a string.");
      }
      if (!isOptionalString(candidate.description)) {
        issue(`${path}.description`, "Expected a string.");
      }
      if (
        typeof candidate.layer !== "number" ||
        !Number.isInteger(candidate.layer) ||
        candidate.layer < 0
      ) {
        issue(`${path}.layer`, "Expected a non-negative integer.");
      }
      if (typeof candidate.locked !== "boolean") {
        issue(`${path}.locked`, "Expected a boolean.");
      }
      if (typeof candidate.visible !== "boolean") {
        issue(`${path}.visible`, "Expected a boolean.");
      }
      validateMetadata(candidate.metadata, `${path}.metadata`, issues);
    });
  }

  const edgeIds = new Set<string>();
  const edgeSignatures = new Set<string>();
  if (!Array.isArray(value.edges)) {
    issue("$.edges", "Expected an array of connections.");
  } else {
    value.edges.forEach((candidate, index) => {
      const path = `$.edges[${index}]`;
      if (!isRecord(candidate)) {
        issue(path, "Expected a connection object.");
        return;
      }
      if (!isNonEmptyString(candidate.id)) {
        issue(`${path}.id`, "A connection ID is required.");
      } else if (edgeIds.has(candidate.id)) {
        issue(`${path}.id`, "Connection IDs must be unique.");
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
        issue(`${path}.sourceNodeId`, "A source node ID is required.");
      } else if (!nodeIds.has(sourceNodeId)) {
        issue(`${path}.sourceNodeId`, "The source node does not exist.");
      }
      if (!targetNodeId) {
        issue(`${path}.targetNodeId`, "A target node ID is required.");
      } else if (!nodeIds.has(targetNodeId)) {
        issue(`${path}.targetNodeId`, "The target node does not exist.");
      }
      if (
        sourceNodeId &&
        targetNodeId &&
        sourceNodeId === targetNodeId
      ) {
        issue(path, "A node cannot connect to itself.");
      }

      if (
        typeof candidate.sourcePort !== "string" ||
        !PORT_SET.has(candidate.sourcePort)
      ) {
        issue(`${path}.sourcePort`, "Unsupported source port.");
      }
      if (
        typeof candidate.targetPort !== "string" ||
        !PORT_SET.has(candidate.targetPort)
      ) {
        issue(`${path}.targetPort`, "Unsupported target port.");
      }
      if (
        typeof candidate.type !== "string" ||
        !EDGE_TYPE_SET.has(candidate.type)
      ) {
        issue(`${path}.type`, "Unsupported connection type.");
      }
      if (!isOptionalString(candidate.label)) {
        issue(`${path}.label`, "Expected a string.");
      }
      if (!isOptionalString(candidate.protocol)) {
        issue(`${path}.protocol`, "Expected a string.");
      }
      if (!isOptionalString(candidate.description)) {
        issue(`${path}.description`, "Expected a string.");
      }
      if (
        candidate.routing !== undefined &&
        (typeof candidate.routing !== "string" ||
          !EDGE_ROUTING_SET.has(candidate.routing))
      ) {
        issue(`${path}.routing`, "Unsupported connection routing.");
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
          issue(path, "An exact duplicate connection already exists.");
        } else {
          edgeSignatures.add(signature);
        }
      }
    });
  }

  if (!isRecord(value.viewport)) {
    issue("$.viewport", "Expected a viewport object.");
  } else {
    if (!isFiniteNumber(value.viewport.x)) {
      issue("$.viewport.x", "Expected a finite number.");
    }
    if (!isFiniteNumber(value.viewport.y)) {
      issue("$.viewport.y", "Expected a finite number.");
    }
    if (
      !isFiniteNumber(value.viewport.zoom) ||
      value.viewport.zoom < MIN_ZOOM ||
      value.viewport.zoom > MAX_ZOOM
    ) {
      issue(
        "$.viewport.zoom",
        `Zoom must be between ${MIN_ZOOM} and ${MAX_ZOOM}.`,
      );
    }
  }

  if (
    value.status === "completed" &&
    Array.isArray(value.nodes) &&
    value.nodes.length === 0
  ) {
    issue("$.status", "An empty diagram cannot be marked complete.");
  }

  if (issues.length > 0) return { valid: false, issues };

  return {
    valid: true,
    document: cloneSystemDesignDocument(value as unknown as SystemDesignDocument),
    issues: [],
  };
}

export function parseSystemDesignDocument(
  value: unknown,
): SystemDesignDocument {
  const result = validateSystemDesignDocument(value);
  if (!result.valid) throw new SystemDesignValidationError(result.issues);
  return result.document;
}
