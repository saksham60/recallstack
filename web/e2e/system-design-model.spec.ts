import { expect, test } from "@playwright/test";
import { LocalStorageSystemDesignRepository } from "../src/features/system-design/repository/LocalStorageSystemDesignRepository";
import {
  getSystemDesignNodeDefinition,
  isSystemDesignBoundaryNodeType,
  isSystemDesignModuleNodeType,
  SYSTEM_DESIGN_BOUNDARY_NODE_TYPES,
  SYSTEM_DESIGN_MODULE_NODE_TYPES,
  SYSTEM_DESIGN_NODE_DEFINITIONS,
  SYSTEM_DESIGN_NODE_TYPE_ORDER,
} from "../src/features/system-design/constants/system-design-palette";
import {
  createSystemDesignTechnologyIdentity,
  getSystemDesignNodeVisual,
  resolveSystemDesignTechnology,
  SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS,
  SYSTEM_DESIGN_TECHNOLOGY_IDS,
  SYSTEM_DESIGN_TECHNOLOGY_REGISTRY,
} from "../src/features/system-design/constants/system-design-visual-registry";
import { resolveSystemDesignEdgeStyle } from "../src/features/system-design/constants/system-design-edge-registry";
import { normalizeSystemDesignProblemTags } from "../src/features/system-design/components/SystemDesignProblemPanel";
import {
  APPLIED_SOLUTIONS_ARCHITECT_PROBLEMS,
  SYSTEM_DESIGN_PROBLEMS,
} from "../src/features/system-design/data/system-design-problems";
import {
  getSystemDesignProblemTags,
  matchesSystemDesignProblemFilters,
} from "../src/features/system-design/utils/problem-discovery";
import {
  SYSTEM_DESIGN_SCHEMA_VERSION,
  type SystemDesignDiagram,
  type SystemDesignDocument,
  type SystemDesignNode,
  type SystemDesignNodeType,
} from "../src/features/system-design/types/system-design.types";
import {
  parseSystemDesignDocumentJson,
  serializeSystemDesignDocument,
} from "../src/features/system-design/utils/diagram-import-export";
import {
  cloneSystemDesignDocument,
  createSystemDesignNode,
  createSystemDesignDocumentSummary,
  getSystemDesignDiagramBreadcrumbs,
} from "../src/features/system-design/utils/system-design-defaults";
import { validateSystemDesignDocument } from "../src/features/system-design/utils/diagram-validation";
import {
  alignSystemDesignNodes,
  distributeSystemDesignNodes,
  matchSystemDesignNodeSizes,
  snapSystemDesignNodeToObjects,
  spaceSystemDesignNodesEvenly,
} from "../src/features/system-design/utils/node-layout";

const now = "2026-07-30T00:00:00.000Z";

function createNode(
  id: string,
  overrides: Partial<SystemDesignNode> = {},
): SystemDesignNode {
  return {
    id,
    type: "service",
    label: id,
    x: 40,
    y: 60,
    width: 160,
    height: 88,
    layer: 0,
    locked: false,
    visible: true,
    ...overrides,
  };
}

function createNestedDocument(): SystemDesignDocument {
  const moduleNode = createNode("analytics-module", {
    type: "module",
    label: "Analytics",
    isExpandable: true,
    childDiagramId: "analytics-diagram",
  });
  const root: SystemDesignDiagram = {
    id: "root-diagram",
    name: "URL Shortener",
    nodes: [moduleNode],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const child: SystemDesignDiagram = {
    id: "analytics-diagram",
    name: "Analytics Module",
    parentNodeId: moduleNode.id,
    nodes: [
      createNode("event-consumer", {
        type: "worker",
        parentModuleId: moduleNode.id,
        technology: {
          id: "kafka",
          name: "Apache Kafka",
          category: "messaging",
        },
      }),
      createNode("analytics-store", {
        type: "data_warehouse",
        layer: 1,
      }),
    ],
    edges: [
      {
        id: "analytics-stream",
        sourceNodeId: "event-consumer",
        targetNodeId: "analytics-store",
        sourcePort: "right",
        targetPort: "left",
        type: "stream",
      },
    ],
    viewport: { x: -20, y: 10, zoom: 1.1 },
  };
  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: "url-shortener-document",
    problemId: "url-shortener",
    title: "URL Shortener",
    status: "in_progress",
    rootDiagramId: root.id,
    diagrams: {
      [root.id]: root,
      [child.id]: child,
    },
    metadata: { owner: "admin", source: "practice" },
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test.describe("system-design schema v3", () => {
  test("discovers and filters the complete Applied Solutions Architect set generically", () => {
    expect(APPLIED_SOLUTIONS_ARCHITECT_PROBLEMS).toHaveLength(15);
    expect(
      new Set(SYSTEM_DESIGN_PROBLEMS.map((problem) => problem.id)).size,
    ).toBe(SYSTEM_DESIGN_PROBLEMS.length);
    expect(
      new Set(SYSTEM_DESIGN_PROBLEMS.map((problem) => problem.slug)).size,
    ).toBe(SYSTEM_DESIGN_PROBLEMS.length);
    expect(
      APPLIED_SOLUTIONS_ARCHITECT_PROBLEMS.every(
        (problem) => problem.tags.includes("agentic"),
      ),
    ).toBe(true);
    expect(getSystemDesignProblemTags(SYSTEM_DESIGN_PROBLEMS)).toContain(
      "agentic",
    );
    expect(
      SYSTEM_DESIGN_PROBLEMS.filter((problem) =>
        matchesSystemDesignProblemFilters(problem, { tag: "agentic" }),
      ),
    ).toHaveLength(15);
  });

  test("searches rich problem text, concepts, and tags", () => {
    const searches = [
      "RAG",
      "Agentic",
      "Spanner",
      "Pub/Sub",
      "Financial",
      "LLM",
      "Security",
      "Multi Tenant",
      "Hybrid Cloud",
      "Distributed Systems",
    ];
    for (const search of searches) {
      expect(
        SYSTEM_DESIGN_PROBLEMS.some((problem) =>
          matchesSystemDesignProblemFilters(problem, { search }),
        ),
        `Expected search results for ${search}`,
      ).toBe(true);
    }
  });

  test("treats problem tags as open data and normalizes authoring noise", () => {
    expect(
      normalizeSystemDesignProblemTags([
        " caching ",
        "NOVEL-TOPIC",
        "novel-topic",
        "",
        "new-unknown-tag",
      ]),
    ).toEqual(["caching", "NOVEL-TOPIC", "new-unknown-tag"]);
  });

  test("keeps component and technology registries controlled and complete", () => {
    for (const type of Object.keys(
      SYSTEM_DESIGN_NODE_DEFINITIONS,
    ) as SystemDesignNodeType[]) {
      expect(getSystemDesignNodeDefinition(type).type).toBe(type);
      expect(getSystemDesignNodeDefinition(type).iconKey).toBeTruthy();
      expect(getSystemDesignNodeVisual(type).chrome).toBeTruthy();
    }

    expect(new Set(SYSTEM_DESIGN_TECHNOLOGY_IDS).size).toBe(
      SYSTEM_DESIGN_TECHNOLOGY_IDS.length,
    );
    for (const id of SYSTEM_DESIGN_TECHNOLOGY_IDS) {
      const definition = SYSTEM_DESIGN_TECHNOLOGY_REGISTRY[id];
      expect(SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS[id].path).toBeTruthy();
      expect(createSystemDesignTechnologyIdentity(id)).toEqual({
        id,
        name: definition.name,
        category: definition.category,
      });
    }

    expect(SYSTEM_DESIGN_TECHNOLOGY_REGISTRY.opensearch).toMatchObject({
      name: "OpenSearch",
      category: "search",
    });
    expect(SYSTEM_DESIGN_TECHNOLOGY_REGISTRY.azure_functions).toMatchObject({
      name: "Azure Functions",
      category: "compute",
    });
  });

  test("classifies semantic modules and structural boundaries exhaustively", () => {
    expect(SYSTEM_DESIGN_MODULE_NODE_TYPES).toEqual([
      "module",
      "logical_module",
      "feature_module",
      "domain_module",
    ]);
    expect(SYSTEM_DESIGN_BOUNDARY_NODE_TYPES).toEqual(
      expect.arrayContaining([
        "system_boundary",
        "module_boundary",
        "vpc_boundary",
        "region_boundary",
        "availability_zone_boundary",
        "kubernetes_cluster_boundary",
        "deployment_group_boundary",
        "swimlane_boundary",
        "container",
      ]),
    );
    for (const type of SYSTEM_DESIGN_MODULE_NODE_TYPES) {
      expect(isSystemDesignModuleNodeType(type)).toBe(true);
      expect(getSystemDesignNodeDefinition(type).category).toBe("modules");
      expect(
        createSystemDesignNode(type, { x: 0, y: 0 }, { id: `node-${type}` })
          .isExpandable,
      ).toBe(true);
    }
    for (const type of SYSTEM_DESIGN_BOUNDARY_NODE_TYPES) {
      expect(isSystemDesignBoundaryNodeType(type)).toBe(true);
      expect(getSystemDesignNodeDefinition(type).category).toBe("boundaries");
    }
    expect(SYSTEM_DESIGN_NODE_TYPE_ORDER).not.toContain("image");
    expect(SYSTEM_DESIGN_NODE_DEFINITIONS.image.type).toBe("image");
    for (const type of [
      "email_provider",
      "sms_provider",
      "identity_provider",
    ] as const) {
      expect(SYSTEM_DESIGN_NODE_TYPE_ORDER).toContain(type);
      expect(getSystemDesignNodeDefinition(type).category).toBe("external");
      expect(getSystemDesignNodeVisual(type).chrome).toBe("external");
    }
  });

  test("resolves logos by a structured registry ID without name spoofing", () => {
    expect(resolveSystemDesignTechnology("Redis")?.id).toBe("redis");
    expect(
      resolveSystemDesignTechnology({
        id: "custom",
        name: "Redis",
        category: "custom",
      }),
    ).toBeNull();
    expect(
      resolveSystemDesignTechnology({
        id: "unregistered",
        name: "PostgreSQL",
        category: "database",
      }),
    ).toBeNull();
    expect(
      resolveSystemDesignTechnology({
        id: "opensearch",
        name: "OpenSearch",
        category: "search",
      })?.id,
    ).toBe("opensearch");
    expect(
      resolveSystemDesignTechnology({
        id: "opensearch",
        name: "ignored display text",
        category: "custom",
      }),
    ).toBeNull();
  });

  test("validates nested diagrams and preserves hierarchy through cloning", () => {
    const document = createNestedDocument();
    const result = validateSystemDesignDocument(document);

    expect(result.valid).toBe(true);
    expect(result.valid && result.migrated).toBe(false);
    const clone = cloneSystemDesignDocument(document);
    expect(clone).toEqual(document);
    expect(clone.diagrams).not.toBe(document.diagrams);
    expect(clone.diagrams["analytics-diagram"].nodes).not.toBe(
      document.diagrams["analytics-diagram"].nodes,
    );
    expect(
      getSystemDesignDiagramBreadcrumbs(document, "analytics-diagram").map(
        (diagram) => diagram.name,
      ),
    ).toEqual(["URL Shortener", "Analytics Module"]);
    expect(createSystemDesignDocumentSummary(document)).toMatchObject({
      nodeCount: 3,
      edgeCount: 1,
      status: "in_progress",
    });
  });

  test("allows every semantic module variant to own a child diagram", () => {
    for (const type of SYSTEM_DESIGN_MODULE_NODE_TYPES) {
      const document = createNestedDocument();
      document.diagrams[document.rootDiagramId].nodes[0].type = type;
      expect(validateSystemDesignDocument(document).valid).toBe(true);
    }
  });

  test("round-trips serializable node appearance and text style", () => {
    const document = createNestedDocument();
    const node = document.diagrams["analytics-diagram"].nodes[0];
    node.style = {
      fill: "#10233f",
      stroke: "#38bdf8",
      strokeWidth: 3,
      borderRadius: 18,
      borderStyle: "dashed",
      opacity: 0.72,
    };
    node.textStyle = {
      color: "#ecfeff",
      fontFamily: "Inter",
      fontSize: 18,
      lineHeight: 1.45,
      padding: 12,
      fontWeight: "bold",
      fontStyle: "italic",
      textDecoration: "underline",
      align: "center",
      verticalAlign: "middle",
    };

    const validation = validateSystemDesignDocument(document);
    expect(validation.valid).toBe(true);
    const parsed = parseSystemDesignDocumentJson(
      serializeSystemDesignDocument(document),
    );
    const parsedNode = parsed.diagrams["analytics-diagram"].nodes[0];
    expect(parsedNode.style).toEqual(node.style);
    expect(parsedNode.textStyle).toEqual(node.textStyle);
    expect(parsedNode.style).not.toBe(node.style);
    expect(parsedNode.textStyle).not.toBe(node.textStyle);
  });

  test("rejects unsafe or out-of-range node presentation", () => {
    const document = createNestedDocument();
    const node = document.diagrams["analytics-diagram"].nodes[0];
    Object.assign(node, {
      style: {
        fill: "url(https://example.com/tracker.png)",
        strokeWidth: 13,
        borderRadius: -1,
        borderStyle: "double",
        opacity: 2,
      },
      textStyle: {
        color: "javascript:alert(1)",
        fontFamily: "",
        fontSize: 100,
        lineHeight: 0.2,
        padding: 80,
        fontWeight: "heavy",
        fontStyle: "oblique",
        textDecoration: "blink",
        align: "justify",
        verticalAlign: "baseline",
      },
    });

    const validation = validateSystemDesignDocument(document);
    expect(validation.valid).toBe(false);
    const paths = validation.valid
      ? []
      : validation.issues.map((validationIssue) => validationIssue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "$.diagrams.analytics-diagram.nodes[0].style.fill",
        "$.diagrams.analytics-diagram.nodes[0].style.strokeWidth",
        "$.diagrams.analytics-diagram.nodes[0].style.borderRadius",
        "$.diagrams.analytics-diagram.nodes[0].style.borderStyle",
        "$.diagrams.analytics-diagram.nodes[0].style.opacity",
        "$.diagrams.analytics-diagram.nodes[0].textStyle.color",
        "$.diagrams.analytics-diagram.nodes[0].textStyle.fontFamily",
        "$.diagrams.analytics-diagram.nodes[0].textStyle.fontSize",
        "$.diagrams.analytics-diagram.nodes[0].textStyle.lineHeight",
        "$.diagrams.analytics-diagram.nodes[0].textStyle.padding",
        "$.diagrams.analytics-diagram.nodes[0].textStyle.fontWeight",
        "$.diagrams.analytics-diagram.nodes[0].textStyle.fontStyle",
        "$.diagrams.analytics-diagram.nodes[0].textStyle.textDecoration",
        "$.diagrams.analytics-diagram.nodes[0].textStyle.align",
        "$.diagrams.analytics-diagram.nodes[0].textStyle.verticalAlign",
      ]),
    );
  });

  test("round-trips semantic connection styling and animation", () => {
    const document = createNestedDocument();
    const edge = document.diagrams["analytics-diagram"].edges[0];
    Object.assign(edge, {
      type: "event_stream",
      routing: "orthogonal",
      color: "#22d3ee",
      opacity: 0.75,
      strokeWidth: 4,
      lineStyle: "dash_dot",
      dashPattern: [8, 4, 2, 4],
      startArrowhead: "diamond",
      endArrowhead: "filled_triangle",
      label: "analytics.events",
      labelIcon: "stream",
      labelPosition: 0.35,
      labelBackground: "#111827",
      labelTextColor: "#ecfeff",
      animationMode: "direction_pulse",
      animationSpeed: 1.8,
      animationDirection: "alternate",
    });

    const validation = validateSystemDesignDocument(document);
    expect(validation.valid).toBe(true);
    const parsed = parseSystemDesignDocumentJson(
      serializeSystemDesignDocument(document),
    );
    const parsedEdge = parsed.diagrams["analytics-diagram"].edges[0];
    expect(parsedEdge).toEqual(edge);
    expect(resolveSystemDesignEdgeStyle(parsedEdge)).toMatchObject({
      routing: "orthogonal",
      lineStyle: "dash_dot",
      startArrowhead: "diamond",
      endArrowhead: "filled_triangle",
      animationMode: "direction_pulse",
      animationSpeed: 1.8,
      animationDirection: "alternate",
    });
    expect(parsedEdge.dashPattern).toEqual([8, 4, 2, 4]);
    expect(parsedEdge.dashPattern).not.toBe(edge.dashPattern);
  });

  test("rejects unsafe or out-of-range connection presentation", () => {
    const document = createNestedDocument();
    Object.assign(document.diagrams["analytics-diagram"].edges[0], {
      color: "url(https://example.com/tracker.png)",
      opacity: 2,
      strokeWidth: 0,
      lineStyle: "scribble",
      routing: "maze",
      animationMode: "always",
      animationSpeed: 9,
    });

    const validation = validateSystemDesignDocument(document);
    expect(validation.valid).toBe(false);
    const paths = validation.valid
      ? []
      : validation.issues.map((validationIssue) => validationIssue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "$.diagrams.analytics-diagram.edges[0].color",
        "$.diagrams.analytics-diagram.edges[0].opacity",
        "$.diagrams.analytics-diagram.edges[0].strokeWidth",
        "$.diagrams.analytics-diagram.edges[0].lineStyle",
        "$.diagrams.analytics-diagram.edges[0].routing",
        "$.diagrams.analytics-diagram.edges[0].animationMode",
        "$.diagrams.analytics-diagram.edges[0].animationSpeed",
      ]),
    );
  });

  test("round-trips serializable node groups and rejects empty group IDs", () => {
    const document = createNestedDocument();
    const childNodes = document.diagrams["analytics-diagram"].nodes;
    childNodes[0].groupId = "group-analytics";
    childNodes[1].groupId = "group-analytics";

    const parsed = parseSystemDesignDocumentJson(
      serializeSystemDesignDocument(document),
    );
    expect(
      parsed.diagrams["analytics-diagram"].nodes.map(
        (node) => node.groupId,
      ),
    ).toEqual(["group-analytics", "group-analytics"]);

    childNodes[0].groupId = "";
    const invalid = validateSystemDesignDocument(document);
    expect(invalid.valid).toBe(false);
    expect(
      invalid.valid
        ? []
        : invalid.issues.map((validationIssue) => validationIssue.path),
    ).toContain("$.diagrams.analytics-diagram.nodes[0].groupId");
  });

  test("migrates schema v1 without root-level compatibility fields", () => {
    const legacy = {
      schemaVersion: 1,
      id: "legacy-diagram",
      problemId: "url-shortener",
      title: "Legacy URL Shortener",
      status: "completed",
      nodes: [
        {
          ...createNode("cache", { type: "cache" }),
          technology: "Redis",
        },
        {
          ...createNode("legacy-vendor", { layer: 1 }),
          technology: "Internal KV Store",
        },
      ],
      edges: [
        {
          id: "cache-read",
          sourceNodeId: "cache",
          targetNodeId: "legacy-vendor",
          sourcePort: "right",
          targetPort: "left",
          type: "data",
        },
      ],
      viewport: { x: 12, y: -8, zoom: 1.25 },
      metadata: { owner: "admin", release: "legacy" },
      createdAt: now,
      updatedAt: now,
    };

    const document = parseSystemDesignDocumentJson(JSON.stringify(legacy));
    const root = document.diagrams[document.rootDiagramId];

    expect(document).toMatchObject({
      schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
      id: legacy.id,
      problemId: legacy.problemId,
      title: legacy.title,
      status: legacy.status,
      metadata: legacy.metadata,
    });
    expect(root).toMatchObject({
      id: legacy.id,
      name: legacy.title,
      edges: legacy.edges,
      viewport: legacy.viewport,
    });
    expect(root.nodes[0].technology).toEqual({
      id: "redis",
      name: "Redis",
      category: "cache",
    });
    expect(root.nodes[1].technology).toEqual({
      id: "custom",
      name: "Internal KV Store",
      category: "custom",
    });

    const serialized = serializeSystemDesignDocument(document);
    const serializedValue = JSON.parse(serialized) as Record<string, unknown>;
    expect(serializedValue.schemaVersion).toBe(SYSTEM_DESIGN_SCHEMA_VERSION);
    expect(serializedValue).not.toHaveProperty("nodes");
    expect(serializedValue).not.toHaveProperty("edges");
    expect(serializedValue).not.toHaveProperty("viewport");
  });

  test("rejects broken child-diagram references", () => {
    const document = createNestedDocument();
    document.diagrams["root-diagram"].nodes[0].childDiagramId =
      "missing-diagram";
    const result = validateSystemDesignDocument(document);

    expect(result.valid).toBe(false);
    expect(
      result.valid
        ? []
        : result.issues.map((validationIssue) => validationIssue.path),
    ).toContain(
      "$.diagrams.root-diagram.nodes[0].childDiagramId",
    );
  });

  test("rejects child diagrams referenced by non-module nodes", () => {
    const document = createNestedDocument();
    document.diagrams["root-diagram"].nodes[0].type = "service";
    const result = validateSystemDesignDocument(document);

    expect(result.valid).toBe(false);
    expect(
      result.valid
        ? []
        : result.issues.map((validationIssue) => validationIssue.message),
    ).toContain("Only module nodes can reference child diagrams.");
  });

  test("requires exactly one parent module reference per child diagram", () => {
    const document = createNestedDocument();
    document.diagrams["root-diagram"].nodes.push(
      createNode("duplicate-parent", {
        type: "module",
        isExpandable: true,
        childDiagramId: "analytics-diagram",
      }),
    );
    const result = validateSystemDesignDocument(document);

    expect(result.valid).toBe(false);
    expect(
      result.valid
        ? []
        : result.issues.find(
            (validationIssue) =>
              validationIssue.path ===
              "$.diagrams.analytics-diagram.parentNodeId",
          )?.message,
    ).toContain("exactly one parent module reference; found 2");
  });

  test("rejects orphan diagrams", () => {
    const document = createNestedDocument();
    document.diagrams["orphan-diagram"] = {
      id: "orphan-diagram",
      name: "Detached subsystem",
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const result = validateSystemDesignDocument(document);

    expect(result.valid).toBe(false);
    expect(
      result.valid
        ? []
        : result.issues.find(
            (validationIssue) =>
              validationIssue.path === "$.diagrams.orphan-diagram",
          )?.message,
    ).toContain("Diagram is orphaned");
  });

  test("rejects cycles across multiple diagrams", () => {
    const document = createNestedDocument();
    document.diagrams["orphan-a"] = {
      id: "orphan-a",
      name: "Orphan A",
      parentNodeId: "orphan-b-module",
      nodes: [
        createNode("orphan-a-module", {
          type: "module",
          isExpandable: true,
          childDiagramId: "orphan-b",
        }),
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    document.diagrams["orphan-b"] = {
      id: "orphan-b",
      name: "Orphan B",
      parentNodeId: "orphan-a-module",
      nodes: [
        createNode("orphan-b-module", {
          type: "module",
          isExpandable: true,
          childDiagramId: "orphan-a",
        }),
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const result = validateSystemDesignDocument(document);
    const messages = result.valid
      ? []
      : result.issues.map((validationIssue) => validationIssue.message);

    expect(result.valid).toBe(false);
    expect(messages).toContain(
      "Child-diagram references must not form a cycle.",
    );
    expect(
      messages.filter((message) => message.startsWith("Diagram is orphaned")),
    ).toHaveLength(2);
  });

  test("rejects spoofed registered technology identities", () => {
    const document = createNestedDocument();
    document.diagrams["analytics-diagram"].nodes[0].technology = {
      id: "kafka",
      name: "Kafka-compatible proxy",
      category: "compute",
    };
    const result = validateSystemDesignDocument(document);
    const issuePaths = result.valid
      ? []
      : result.issues.map((validationIssue) => validationIssue.path);

    expect(result.valid).toBe(false);
    expect(issuePaths).toContain(
      "$.diagrams.analytics-diagram.nodes[0].technology.name",
    );
    expect(issuePaths).toContain(
      "$.diagrams.analytics-diagram.nodes[0].technology.category",
    );
  });

  test("aligns and distributes movable nodes without shifting endpoints", () => {
    const nodes = [
      createNode("left", { x: 0, width: 40 }),
      createNode("middle", { x: 85, width: 40 }),
      createNode("right", { x: 300, width: 40 }),
      createNode("locked", { x: -500, width: 40, locked: true }),
    ];

    const aligned = alignSystemDesignNodes(nodes, "left");
    expect(aligned).toMatchObject({
      left: { x: 0 },
      middle: { x: 0 },
      right: { x: 0 },
    });
    expect(aligned).not.toHaveProperty("locked");

    const distributed = distributeSystemDesignNodes(nodes, "horizontal");
    expect(distributed.left.x).toBe(0);
    expect(distributed.middle.x).toBe(150);
    expect(distributed.right.x).toBe(300);
    expect(distributed).not.toHaveProperty("locked");

    const spaced = spaceSystemDesignNodesEvenly(nodes, "horizontal");
    expect(spaced.middle.x).toBe(150);
    const matched = matchSystemDesignNodeSizes(
      [nodes[0], { ...nodes[1], width: 90 }],
      "width",
    );
    expect(matched.middle.width).toBe(40);

    const snapped = snapSystemDesignNodeToObjects(
      nodes[1],
      { x: 254, y: 54 },
      nodes,
      { threshold: 7, ignoredNodeIds: new Set(["middle", "locked"]) },
    );
    expect(snapped).toEqual({ x: 260, y: 60 });
  });

  test("upgrades a persisted schema-v1 document on read", async () => {
    const storage = new MemoryStorage();
    const key = LocalStorageSystemDesignRepository.storageKey("url-shortener");
    storage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        id: "legacy-diagram",
        problemId: "url-shortener",
        title: "URL Shortener",
        status: "in_progress",
        nodes: [createNode("api")],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: now,
        updatedAt: now,
      }),
    );
    const repository = new LocalStorageSystemDesignRepository(storage);

    const document = await repository.getDocument("url-shortener");
    expect(document?.schemaVersion).toBe(SYSTEM_DESIGN_SCHEMA_VERSION);
    expect(document?.diagrams[document.rootDiagramId].nodes).toHaveLength(1);

    const persisted = JSON.parse(storage.getItem(key) ?? "{}") as Record<
      string,
      unknown
    >;
    expect(persisted.schemaVersion).toBe(SYSTEM_DESIGN_SCHEMA_VERSION);
    expect(persisted).not.toHaveProperty("nodes");
  });
});
