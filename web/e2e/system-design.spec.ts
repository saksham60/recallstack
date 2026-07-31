import { readFile } from "node:fs/promises";
import { test as base, expect, type Page } from "@playwright/test";
import { test } from "./fixtures/authenticated-test";
import { createProfile } from "./helpers/factories";
import { canAccessSystemDesign } from "../src/features/system-design/access";
import { LocalStorageSystemDesignRepository } from "../src/features/system-design/repository/LocalStorageSystemDesignRepository";
import type {
  SystemDesignDocument,
  SystemDesignEdge,
  SystemDesignNode,
} from "../src/features/system-design/types/system-design.types";
import { SYSTEM_DESIGN_SCHEMA_VERSION } from "../src/features/system-design/types/system-design.types";

async function mockProfile(page: Page, roles: string[] = ["admin"]) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: createProfile({ roles }) }),
  );
}

function createDocument({
  problemId,
  title,
  status,
  nodeCount,
  updatedAt,
  withEdge,
}: {
  problemId: string;
  title: string;
  status: SystemDesignDocument["status"];
  nodeCount: number;
  updatedAt: string;
  withEdge?: boolean;
}): SystemDesignDocument {
  const rootDiagramId = `${problemId}-diagram`;
  const nodes: SystemDesignNode[] = Array.from(
    { length: nodeCount },
    (_, index) => ({
      id: `${problemId}-node-${index + 1}`,
      type: index === 0 ? "user" : "service",
      x: 80 + index * 220,
      y: 100,
      width: index === 0 ? 140 : 160,
      height: index === 0 ? 80 : 88,
      label: index === 0 ? "User" : "Service",
      layer: index,
      locked: false,
      visible: true,
    }),
  );

  return {
    schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
    id: `${problemId}-document`,
    problemId,
    title,
    status,
    rootDiagramId,
    diagrams: {
      [rootDiagramId]: {
        id: rootDiagramId,
        name: title,
        nodes,
        edges:
          (withEdge ?? nodes.length > 1)
            ? [
                {
                  id: `${problemId}-edge-1`,
                  sourceNodeId: nodes[0].id,
                  targetNodeId: nodes[1].id,
                  sourcePort: "right",
                  targetPort: "left",
                  type: "request",
                  protocol: "HTTPS",
                  routing: "straight",
                },
              ]
            : [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    createdAt: "2026-07-20T08:00:00.000Z",
    updatedAt,
  };
}

function rootDiagram(document: SystemDesignDocument | null | undefined) {
  return document?.diagrams[document.rootDiagramId];
}

function createPerformanceFixture(): SystemDesignDocument {
  const document = createDocument({
    problemId: "url-shortener",
    title: "URL Shortener",
    status: "in_progress",
    nodeCount: 0,
    withEdge: false,
    updatedAt: "2026-07-29T08:00:00.000Z",
  });
  const nodeTypes: readonly SystemDesignNode["type"][] = [
    "user",
    "web_app",
    "cdn",
    "api_gateway",
    "service",
    "cache",
    "sql_database",
    "object_storage",
    "message_queue",
    "event_stream",
  ];
  const nodes: SystemDesignNode[] = Array.from(
    { length: 100 },
    (_, index) => ({
      id: `perf-node-${index}`,
      type: nodeTypes[index % nodeTypes.length],
      x: 64 + (index % 10) * 216,
      y: 64 + Math.floor(index / 10) * 132,
      width: 160,
      height: 88,
      label: `Component ${index + 1}`,
      layer: index,
      locked: false,
      visible: true,
    }),
  );
  const ringEdges: SystemDesignEdge[] = nodes.map((node, index) => ({
    id: `perf-ring-edge-${index}`,
    sourceNodeId: node.id,
    targetNodeId: nodes[(index + 1) % nodes.length].id,
    sourcePort: "right",
    targetPort: "left",
    type: "request",
    routing: "straight",
  }));
  const crossEdges: SystemDesignEdge[] = Array.from(
    { length: 50 },
    (_, index) => ({
      id: `perf-cross-edge-${index}`,
      sourceNodeId: nodes[index].id,
      targetNodeId: nodes[(index + 5) % nodes.length].id,
      sourcePort: "bottom",
      targetPort: "top",
      type: "async",
      routing: "curved",
    }),
  );
  const diagram = rootDiagram(document)!;
  return {
    ...document,
    diagrams: {
      ...document.diagrams,
      [document.rootDiagramId]: {
        ...diagram,
        nodes,
        edges: [...ringEdges, ...crossEdges],
      },
    },
  };
}

const savedDocuments = [
  createDocument({
    problemId: "url-shortener",
    title: "URL Shortener",
    status: "completed",
    nodeCount: 2,
    updatedAt: "2026-07-28T12:30:00.000Z",
  }),
  createDocument({
    problemId: "distributed-rate-limiter",
    title: "Distributed Rate Limiter",
    status: "in_progress",
    nodeCount: 1,
    updatedAt: "2026-07-27T10:15:00.000Z",
  }),
] satisfies readonly SystemDesignDocument[];

async function seedDocuments(
  page: Page,
  documents: readonly SystemDesignDocument[] = savedDocuments,
) {
  const entries = documents.map((document) => ({
    key: LocalStorageSystemDesignRepository.storageKey(document.problemId),
    value: JSON.stringify(document),
  }));

  await page.addInitScript((seedEntries) => {
    for (const entry of seedEntries) {
      window.localStorage.setItem(entry.key, entry.value);
    }
  }, entries);
}

async function openDashboard(page: Page, roles: string[] = ["admin"]) {
  await mockProfile(page, roles);
  await page.goto("/admin/system-design");
}

async function openEditor(
  page: Page,
  problemId = "url-shortener",
  roles: string[] = ["admin"],
) {
  await mockProfile(page, roles);
  await page.goto(`/admin/system-design/${problemId}`);
  await expect(page.getByTestId("system-design-canvas")).toBeVisible();
}

async function expectEditorCounts(
  page: Page,
  {
    nodes,
    connections,
    selected,
  }: { nodes: number; connections: number; selected: number },
) {
  const status = page.getByLabel("Diagram status");
  await expect(status).toContainText(new RegExp(`Nodes\\s+${nodes}`));
  await expect(status).toContainText(
    new RegExp(`Connections\\s+${connections}`),
  );
  await expect(status).toContainText(
    new RegExp(`Selected\\s+${selected}`),
  );
}

async function readStoredDocument(
  page: Page,
  problemId = "url-shortener",
): Promise<SystemDesignDocument | null> {
  const key = LocalStorageSystemDesignRepository.storageKey(problemId);
  return page.evaluate((storageKey) => {
    const serialized = window.localStorage.getItem(storageKey);
    return serialized
      ? (JSON.parse(serialized) as SystemDesignDocument)
      : null;
  }, key);
}

async function saveFromToolbar(page: Page) {
  const saveButton = page.getByRole("button", {
    name: /^(Save|Retry save)$/,
  });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
}

async function canvasPoint(
  page: Page,
  worldX: number,
  worldY: number,
): Promise<{ x: number; y: number }> {
  const bounds = await page.getByTestId("system-design-canvas").boundingBox();
  if (!bounds) throw new Error("The system-design canvas is not visible.");
  return { x: bounds.x + worldX, y: bounds.y + worldY };
}

function problemsRegion(page: Page) {
  return page.getByRole("region", { name: "System-design problems" });
}

function problemFilters(page: Page) {
  return page.getByRole("region", { name: "Problem filters" });
}

async function clearFilters(page: Page) {
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("Showing 15 of 15 problems")).toBeVisible();
}

test.describe("System Design access", () => {
  base("redirects unauthenticated visitors away from both feature routes", async ({
    page,
  }) => {
    await page.goto("/admin/system-design");
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
    await expect(
      page.getByRole("heading", { name: "System Design Problems" }),
    ).toHaveCount(0);

    await page.goto("/admin/system-design/url-shortener");
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
    await expect(page.getByTestId("system-design-canvas")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "URL Shortener" }),
    ).toHaveCount(0);
  });

  test("requires both an admin role and the enabled feature policy", () => {
    expect(canAccessSystemDesign(["admin"], true)).toBe(true);
    expect(canAccessSystemDesign(["admin"], false)).toBe(false);
    expect(canAccessSystemDesign([], true)).toBe(false);
    expect(canAccessSystemDesign(["learner"], true)).toBe(false);
    expect(canAccessSystemDesign(undefined, true)).toBe(false);
  });

  test("shows enabled navigation and dashboard to an admin", async ({
    authenticatedPage: page,
  }) => {
    await mockProfile(page);
    await page.goto("/dsa");
    const globalSystemDesignLink = page.getByRole("link", {
      name: "System Design",
      exact: true,
    });
    await expect(globalSystemDesignLink).toBeVisible();
    await expect(globalSystemDesignLink).toHaveAttribute(
      "href",
      "/admin/system-design",
    );

    await openDashboard(page);

    await expect(
      page.getByRole("heading", { name: "System Design Problems" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Admin navigation" })
        .getByRole("link", { name: "System Design", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Create and validate system-design exercises before releasing them to learners.",
      ),
    ).toBeVisible();
  });

  test("hides navigation and blocks both routes for a non-admin without rendering content", async ({
    authenticatedPage: page,
  }) => {
    await mockProfile(page, []);

    await page.goto("/dsa");
    await expect(
      page.getByRole("link", { name: "System Design", exact: true }),
    ).toHaveCount(0);

    await page.goto("/admin/system-design");
    await expect(
      page.getByRole("heading", {
        name: "Administrator access is required",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "System Design", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "System Design Problems" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Open Editor" }),
    ).toHaveCount(0);

    await page.goto("/admin/system-design/url-shortener");
    await expect(
      page.getByRole("heading", {
        name: "Administrator access is required",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "URL Shortener" }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("system-design-canvas"),
    ).toHaveCount(0);
  });
});

test.describe("System Design problems dashboard", () => {
  test("renders exactly fifteen problems and editor actions", async ({
    authenticatedPage: page,
  }) => {
    await openDashboard(page);

    const problems = problemsRegion(page);
    await expect(problems.getByRole("article")).toHaveCount(15);
    await expect(
      problems.getByRole("link", { name: "Open Editor" }),
    ).toHaveCount(15);
    await expect(page.getByText("Showing 15 of 15 problems")).toBeVisible();
  });

  test("filters by search, category, difficulty, and saved status", async ({
    authenticatedPage: page,
  }) => {
    await seedDocuments(page);
    await openDashboard(page);

    const filters = problemFilters(page);
    await filters
      .getByRole("textbox", { name: "Search", exact: true })
      .fill("autocomplete");
    await expect(page.getByText("Showing 1 of 15 problems")).toBeVisible();
    await expect(problemsRegion(page).getByRole("article")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Search Autocomplete" }),
    ).toBeVisible();

    await clearFilters(page);
    await filters.getByRole("combobox", { name: "Category" }).selectOption(
      "Infrastructure",
    );
    await expect(page.getByText("Showing 3 of 15 problems")).toBeVisible();
    await expect(problemsRegion(page).getByRole("article")).toHaveCount(3);
    await expect(
      page.getByRole("heading", { name: "Distributed Rate Limiter" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Distributed Cache" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Distributed Job Scheduler" }),
    ).toBeVisible();

    await clearFilters(page);
    await filters
      .getByRole("combobox", { name: "Difficulty" })
      .selectOption("medium");
    await expect(page.getByText("Showing 4 of 15 problems")).toBeVisible();
    await expect(problemsRegion(page).getByRole("article")).toHaveCount(4);

    await clearFilters(page);
    const statusFilter = filters.getByRole("combobox", { name: "Status" });
    await statusFilter.selectOption("completed");
    await expect(page.getByText("Showing 1 of 15 problems")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "URL Shortener" }),
    ).toBeVisible();

    await statusFilter.selectOption("in_progress");
    await expect(page.getByText("Showing 1 of 15 problems")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Distributed Rate Limiter" }),
    ).toBeVisible();

    await statusFilter.selectOption("not_started");
    await expect(page.getByText("Showing 13 of 15 problems")).toBeVisible();
    await expect(problemsRegion(page).getByRole("article")).toHaveCount(13);
  });

  test("derives metrics, statuses, and node counts from locally saved documents", async ({
    authenticatedPage: page,
  }) => {
    await seedDocuments(page);
    await openDashboard(page);

    const metrics = page.getByRole("region", {
      name: "System-design problem metrics",
    });
    await expect(
      metrics.getByText("Total problems", { exact: true }).locator(".."),
    ).toContainText("15");
    await expect(
      metrics.getByText("Draft problems", { exact: true }).locator(".."),
    ).toContainText("15");
    await expect(
      metrics.getByText("Diagrams started", { exact: true }).locator(".."),
    ).toContainText("2");
    await expect(
      metrics.getByText("Completed diagrams", { exact: true }).locator(".."),
    ).toContainText("1");

    const urlShortener = problemsRegion(page)
      .getByRole("article")
      .filter({ hasText: "URL Shortener" });
    await expect(
      urlShortener.getByText("Completed", { exact: true }),
    ).toBeVisible();
    await expect(
      urlShortener.getByText("Saved nodes", { exact: true }).locator(".."),
    ).toContainText("2");
    await expect(
      urlShortener.getByText("Not yet", { exact: true }),
    ).toHaveCount(0);

    const rateLimiter = problemsRegion(page)
      .getByRole("article")
      .filter({ hasText: "Distributed Rate Limiter" });
    await expect(
      rateLimiter.getByText("In progress", { exact: true }),
    ).toBeVisible();
    await expect(
      rateLimiter.getByText("Saved nodes", { exact: true }).locator(".."),
    ).toContainText("1");
  });

  test("opens the editor route for the selected problem", async ({
    authenticatedPage: page,
  }) => {
    await openDashboard(page);

    const urlShortener = problemsRegion(page)
      .getByRole("article")
      .filter({ hasText: "URL Shortener" });
    await urlShortener
      .getByRole("link", { name: "Open Editor" })
      .click();

    await expect(page).toHaveURL(/\/admin\/system-design\/url-shortener$/);
  });

  test("renders the normal 404 experience for an unknown problem", async ({
    authenticatedPage: page,
  }) => {
    await mockProfile(page);
    await page.goto("/admin/system-design/not-a-real-problem");

    await expect(
      page.getByText("This page could not be found.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("system-design-canvas"),
    ).toHaveCount(0);
  });
});

test.describe("System Design editor", () => {
  test("adds, selects, renames, duplicates, deletes, and supports undo and redo", async ({
    authenticatedPage: page,
  }) => {
    await openEditor(page);
    await expectEditorCounts(page, {
      nodes: 0,
      connections: 0,
      selected: 0,
    });

    await page.getByRole("button", { name: "Add Service" }).click();
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 1,
    });

    const label = page.getByLabel("Label", { exact: true });
    await label.fill("Catalog Service");
    await expect(label).toHaveValue("Catalog Service");

    await label.press("Backspace");
    await expect(label).toHaveValue("Catalog Servic");
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 1,
    });
    await label.fill("Catalog Service");

    await page.getByLabel("Diagram status").click();
    await page.keyboard.press("Control+d");
    await expectEditorCounts(page, {
      nodes: 2,
      connections: 0,
      selected: 1,
    });

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 0,
    });
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expectEditorCounts(page, {
      nodes: 2,
      connections: 0,
      selected: 0,
    });

    await page.getByRole("tab", { name: "Layers" }).click();
    await page
      .getByRole("button", { name: "Select Catalog Service" })
      .first()
      .click();
    await expectEditorCounts(page, {
      nodes: 2,
      connections: 0,
      selected: 1,
    });
    await page.keyboard.press("Delete");
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 0,
    });
  });

  test("moves and resizes a component and manually saves the final frame", async ({
    authenticatedPage: page,
  }) => {
    const document = createDocument({
      problemId: "url-shortener",
      title: "URL Shortener",
      status: "in_progress",
      nodeCount: 1,
      updatedAt: "2026-07-28T09:00:00.000Z",
    });
    await seedDocuments(page, [document]);
    await openEditor(page);

    const original = rootDiagram(document)!.nodes[0];
    const start = await canvasPoint(
      page,
      original.x + original.width / 2,
      original.y + original.height / 2,
    );
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 90, start.y + 60, { steps: 8 });
    await page.mouse.up();

    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 1,
    });
    await saveFromToolbar(page);
    await expect
      .poll(
        async () =>
          rootDiagram(await readStoredDocument(page))?.nodes[0].x,
      )
      .toBeGreaterThan(original.x + 60);
    await expect
      .poll(
        async () =>
          rootDiagram(await readStoredDocument(page))?.nodes[0].y,
      )
      .toBeGreaterThan(original.y + 30);

    await page.getByRole("tab", { name: "Layers" }).click();
    await page
      .getByRole("button", { name: "Select User", exact: true })
      .click();
    await page.getByRole("tab", { name: "Properties" }).click();
    const inspector = page.getByLabel("Diagram inspector");
    await inspector.getByRole("spinbutton", { name: "Width" }).fill("210");
    await inspector.getByRole("spinbutton", { name: "Height" }).fill("120");
    await saveFromToolbar(page);

    await expect
      .poll(async () => {
        const stored = await readStoredDocument(page);
        return {
          width: rootDiagram(stored)?.nodes[0].width,
          height: rootDiagram(stored)?.nodes[0].height,
        };
      })
      .toEqual({ width: 210, height: 120 });
  });

  test("connects two components and edits the selected connection", async ({
    authenticatedPage: page,
  }) => {
    const document = createDocument({
      problemId: "url-shortener",
      title: "URL Shortener",
      status: "in_progress",
      nodeCount: 2,
      withEdge: false,
      updatedAt: "2026-07-28T09:00:00.000Z",
    });
    await seedDocuments(page, [document]);
    await openEditor(page);

    const source = rootDiagram(document)!.nodes[0];
    const target = rootDiagram(document)!.nodes[1];
    const sourcePort = await canvasPoint(
      page,
      source.x + source.width,
      source.y + source.height / 2,
    );
    const targetPort = await canvasPoint(
      page,
      target.x,
      target.y + target.height / 2,
    );

    await page.mouse.move(sourcePort.x, sourcePort.y);
    await page.mouse.down();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          window.requestAnimationFrame(() => resolve()),
        ),
    );
    await page.mouse.move(targetPort.x, targetPort.y, { steps: 12 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          window.requestAnimationFrame(() => resolve()),
        ),
    );
    await page.mouse.up();

    await expectEditorCounts(page, {
      nodes: 2,
      connections: 1,
      selected: 1,
    });
    await page
      .getByLabel("Diagram inspector")
      .getByRole("combobox", { name: "Connection type" })
      .selectOption("async");
    await page.getByLabel("Label", { exact: true }).fill("Work queue");
    await page.getByLabel("Protocol", { exact: true }).fill("Kafka");
    await saveFromToolbar(page);

    await expect
      .poll(async () => {
        const edge = rootDiagram(await readStoredDocument(page))?.edges[0];
        return {
          type: edge?.type,
          label: edge?.label,
          protocol: edge?.protocol,
        };
      })
      .toEqual({
        type: "async",
        label: "Work queue",
        protocol: "Kafka",
      });
  });

  test("drills into a module, preserves its child diagram, and navigates with breadcrumbs", async ({
    authenticatedPage: page,
  }) => {
    const document = createDocument({
      problemId: "url-shortener",
      title: "URL Shortener",
      status: "in_progress",
      nodeCount: 0,
      withEdge: false,
      updatedAt: "2026-07-28T09:00:00.000Z",
    });
    const root = rootDiagram(document)!;
    const moduleNode: SystemDesignNode = {
      id: "analytics-module",
      type: "module",
      label: "Analytics Module",
      description: "Reporting and event processing",
      isExpandable: true,
      x: 120,
      y: 100,
      width: 220,
      height: 120,
      layer: 0,
      locked: false,
      visible: true,
    };
    document.diagrams[document.rootDiagramId] = {
      ...root,
      nodes: [moduleNode],
    };

    await seedDocuments(page, [document]);
    await openEditor(page);
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 0,
    });

    const moduleCenter = await canvasPoint(
      page,
      moduleNode.x + moduleNode.width / 2,
      moduleNode.y + moduleNode.height / 2,
    );
    await page.mouse.click(moduleCenter.x, moduleCenter.y);
    await expect(page.getByText("Module behavior", { exact: true })).toBeVisible();

    await page.mouse.dblclick(moduleCenter.x, moduleCenter.y);
    await expect(
      page
        .getByRole("navigation", { name: "Diagram breadcrumb" })
        .getByText("Analytics Module", { exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expectEditorCounts(page, {
      nodes: 0,
      connections: 0,
      selected: 0,
    });

    await page.getByRole("button", { name: "Add Service" }).click();
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 1,
    });
    await saveFromToolbar(page);

    await page
      .getByRole("navigation", { name: "Diagram breadcrumb" })
      .getByRole("button", { name: "URL Shortener", exact: true })
      .click();
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 0,
    });

    await page.mouse.dblclick(moduleCenter.x, moduleCenter.y);
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 0,
    });

    const stored = await readStoredDocument(page);
    const storedRoot = rootDiagram(stored);
    const storedModule = storedRoot?.nodes.find(
      (node) => node.id === moduleNode.id,
    );
    expect(storedModule?.childDiagramId).toBeTruthy();
    expect(
      stored?.diagrams[storedModule?.childDiagramId ?? ""]?.nodes,
    ).toHaveLength(1);
  });

  test("loads a 100-node, 150-edge architecture with development performance counters", async ({
    authenticatedPage: page,
  }) => {
    test.slow();
    const fixture = createPerformanceFixture();
    await seedDocuments(page, [fixture]);
    await mockProfile(page);
    await page.goto("/admin/system-design/url-shortener?sdPerf=1");
    await expect(page.getByTestId("system-design-canvas")).toBeVisible();

    await expectEditorCounts(page, {
      nodes: 100,
      connections: 150,
      selected: 0,
    });
    await expect(
      page.getByTestId("system-design-performance-panel"),
    ).toBeVisible();

    const beforeDrag = await page.evaluate(
      () => window.__RECALLSTACK_SYSTEM_DESIGN_PERF__!,
    );
    expect(beforeDrag).toEqual(
      expect.objectContaining({
        canvasRenders: expect.any(Number),
        nodeRenders: expect.any(Number),
        edgeRenders: expect.any(Number),
        dragFrames: expect.any(Number),
        edgeGeometryUpdates: expect.any(Number),
        documentCommits: expect.any(Number),
        persistenceWrites: expect.any(Number),
      }),
    );

    const firstNode = rootDiagram(fixture)!.nodes[0];
    const start = await canvasPoint(
      page,
      firstNode.x + firstNode.width / 2,
      firstNode.y + firstNode.height / 2,
    );
    await page.mouse.click(start.x, start.y);
    await expectEditorCounts(page, {
      nodes: 100,
      connections: 150,
      selected: 1,
    });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 72, start.y + 48, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            window.__RECALLSTACK_SYSTEM_DESIGN_PERF__
              ?.lastDragDocumentCommits,
        ),
      )
      .toBe(1);
    const afterDrag = await page.evaluate(
      () => window.__RECALLSTACK_SYSTEM_DESIGN_PERF__!,
    );
    expect(afterDrag.dragFrames).toBeGreaterThan(beforeDrag.dragFrames);
    expect(afterDrag.edgeGeometryUpdates).toBeGreaterThan(
      beforeDrag.edgeGeometryUpdates,
    );
    expect(afterDrag.maxEdgesUpdatedInFrame).toBe(3);
    expect(afterDrag.maxEdgesUpdatedInFrame).toBeLessThan(150);
    expect(afterDrag.lastDragCanvasRenders).toBe(0);
    expect(afterDrag.lastDragEdgeRenders).toBe(0);
    expect(afterDrag.lastDragNodeRenders).toBeLessThanOrEqual(1);
    expect(afterDrag.lastDragPersistenceWrites).toBe(0);
  });

  test("supports manual save, debounced autosave, and reload restoration", async ({
    authenticatedPage: page,
  }) => {
    test.slow();
    await openEditor(page);

    await page.getByRole("button", { name: "Add User" }).click();
    await saveFromToolbar(page);
    await expect
      .poll(
        async () =>
          rootDiagram(await readStoredDocument(page))?.nodes.length,
      )
      .toBe(1);

    await page
      .getByLabel("Label", { exact: true })
      .fill("Persistent User");
    await page.getByRole("button", { name: "Add Service" }).click();
    await expectEditorCounts(page, {
      nodes: 2,
      connections: 0,
      selected: 1,
    });

    await expect
      .poll(async () => {
        const stored = await readStoredDocument(page);
        const diagram = rootDiagram(stored);
        return {
          nodes: diagram?.nodes.length,
          firstLabel: diagram?.nodes[0].label,
        };
      })
      .toEqual({ nodes: 2, firstLabel: "Persistent User" });
    await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("system-design-canvas")).toBeVisible();
    await expectEditorCounts(page, {
      nodes: 2,
      connections: 0,
      selected: 0,
    });
    await page.getByRole("tab", { name: "Layers" }).click();
    await expect
      .poll(() =>
        page.getByLabel("Layer name").evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).value),
        ),
      )
      .toContain("Persistent User");
  });

  test("requires confirmation before resetting and persists the empty canvas", async ({
    authenticatedPage: page,
  }) => {
    const document = createDocument({
      problemId: "url-shortener",
      title: "URL Shortener",
      status: "in_progress",
      nodeCount: 2,
      updatedAt: "2026-07-28T09:00:00.000Z",
    });
    await seedDocuments(page, [document]);
    await openEditor(page);
    await expectEditorCounts(page, {
      nodes: 2,
      connections: 1,
      selected: 0,
    });

    await page
      .getByRole("button", { name: "Reset canvas", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Reset canvas?" });
    await expect(dialog).toBeVisible();
    await expectEditorCounts(page, {
      nodes: 2,
      connections: 1,
      selected: 0,
    });
    await dialog
      .getByRole("button", { name: "Reset canvas", exact: true })
      .click();

    await expectEditorCounts(page, {
      nodes: 0,
      connections: 0,
      selected: 0,
    });
    await expect
      .poll(async () => {
        const stored = await readStoredDocument(page);
        const diagram = rootDiagram(stored);
        return {
          nodes: diagram?.nodes.length,
          edges: diagram?.edges.length,
          status: stored?.status,
        };
      })
      .toEqual({ nodes: 0, edges: 0, status: "in_progress" });
  });

  test("exports valid JSON and reports an invalid import", async ({
    authenticatedPage: page,
  }) => {
    const document = createDocument({
      problemId: "url-shortener",
      title: "URL Shortener",
      status: "completed",
      nodeCount: 2,
      updatedAt: "2026-07-28T09:00:00.000Z",
    });
    await seedDocuments(page, [document]);
    await openEditor(page);

    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export JSON", exact: true })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      "url-shortener-system-design.json",
    );
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const exported = JSON.parse(
      await readFile(downloadPath as string, "utf8"),
    ) as SystemDesignDocument;
    expect(exported).toMatchObject({
      schemaVersion: SYSTEM_DESIGN_SCHEMA_VERSION,
      problemId: "url-shortener",
      title: "URL Shortener",
      status: "completed",
    });
    expect(rootDiagram(exported)?.nodes).toHaveLength(2);
    expect(rootDiagram(exported)?.edges).toHaveLength(1);

    await page.locator('input[type="file"][accept*="json"]').setInputFiles({
      name: "invalid-diagram.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ this is not valid JSON"),
    });
    await expect(
      page.getByText(
        "The selected file does not contain valid JSON.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Replace the current diagram?" }),
    ).toHaveCount(0);
  });

  test("keeps preview read-only and hides editing controls", async ({
    authenticatedPage: page,
  }) => {
    await openEditor(page);
    await page.getByRole("button", { name: "Add User" }).click();
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 1,
    });

    await page
      .getByRole("button", { name: "Preview diagram", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Exit preview", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Problem brief", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("System design component palette"),
    ).toHaveCount(0);
    await expect(page.getByLabel("Diagram inspector")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reset canvas", exact: true }),
    ).toHaveCount(0);

    await page.keyboard.press("Control+z");
    await page.keyboard.press("Delete");
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 0,
    });

    await page
      .getByRole("button", { name: "Exit preview", exact: true })
      .click();
    await expectEditorCounts(page, {
      nodes: 1,
      connections: 0,
      selected: 0,
    });
  });
});
