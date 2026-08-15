import { expect } from "@playwright/test";
import { test } from "./fixtures/authenticated-test";
import { createProfile } from "./helpers/factories";

test.describe("generic Diagram Studio", () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route("**/api/v1/me", (route) => route.fulfill({ json: createProfile({ roles: ["admin"] }) }));
    await page.goto("/admin/diagrams");
    await expect(page.getByTestId("diagram-workspace")).toBeVisible();
  });

  test("renders independent packs on one canvas and adds a flowchart shape", async ({ authenticatedPage: page }) => {
    await expect(page.getByRole("tab", { name: "General" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Flowchart" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "System Design" })).toBeVisible();
    await expect(page.getByText(/4 objects · 0 connectors/)).toBeVisible();

    await page.getByRole("tab", { name: "Flowchart" }).click();
    await expect(page.getByRole("button", { name: "Decision" })).toBeVisible();
    await page.getByRole("button", { name: "Process" }).click();
    await expect(page.getByText(/5 objects · 0 connectors/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Process" }).first().locator("svg")).toHaveCount(1);

    await page.getByRole("tab", { name: "System Design" }).click();
    await page.getByLabel("Search shapes").fill("postgresql");
    await expect(page.getByRole("button", { name: "SQL Database" })).toBeVisible();
    await page.getByRole("button", { name: "SQL Database" }).click();
    await page.getByLabel("Technology").selectOption("postgresql");
    await expect(page.getByLabel("PostgreSQL", { exact: true })).toBeVisible();
  });

  test("uses the schema inspector for rotation and nested page navigation", async ({ authenticatedPage: page }) => {
    const canvas = page.getByTestId("diagram-canvas");
    await canvas.click({ position: { x: 160, y: 215 } });
    await expect(page.getByRole("complementary", { name: "Properties inspector" })).toContainText("Web App");
    const rotation = page.getByLabel("Rotation");
    await rotation.fill("30");
    await expect(rotation).toHaveValue("30");
    await page.getByRole("button", { name: "Create child page" }).click();
    await expect(page.getByText("Customer App detail")).toBeVisible();
    await page.getByRole("button", { name: "Page 1" }).click();
    await expect(page.getByText(/4 objects/)).toBeVisible();
  });
});

test("keeps the generic canvas interactive with 100 nodes and 150 connectors", async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: createProfile({ roles: ["admin"] }) }));
  const now = "2026-08-15T00:00:00.000Z";
  const nodes = Array.from({ length: 100 }, (_, index) => ({
    id: `node-${index}`,
    kind: "shape",
    shapeDefinitionId: index % 2 ? "flowchart.process" : "generic.rectangle",
    label: `Node ${index}`,
    x: 40 + index % 10 * 190,
    y: 40 + Math.floor(index / 10) * 120,
    width: 160,
    height: 88,
    rotation: 0,
    style: { fill: "#18181b", stroke: "#a78bfa", strokeWidth: 1.5 },
    layer: index,
    visible: true,
    locked: false,
  }));
  const connectors = Array.from({ length: 150 }, (_, index) => ({
    id: `edge-${index}`,
    kind: "connector",
    source: { elementId: `node-${index % 100}`, portId: "right" },
    target: { elementId: `node-${(index * 7 + 1) % 100}`, portId: "left" },
    routing: index % 3 === 0 ? "orthogonal" : index % 3 === 1 ? "curved" : "straight",
    waypoints: [],
    labels: [],
    style: { stroke: "#71717a", strokeWidth: 1.5, endArrowhead: "standard" },
    layer: 100 + index,
    visible: true,
    locked: false,
  }));
  const document = { schemaVersion: 1, id: "admin-diagram-studio", title: "Performance", enabledPackIds: ["generic", "flowchart", "system-design"], rootPageId: "root", pages: { root: { id: "root", name: "Page 1", elements: [...nodes, ...connectors], viewport: { x: 0, y: 0, zoom: 0.65 } } }, createdAt: now, updatedAt: now };
  await page.addInitScript((payload) => localStorage.setItem("recallstack:diagram:admin-diagram-studio", JSON.stringify(payload)), document);
  const started = Date.now();
  await page.goto("/admin/diagrams");
  await expect(page.getByTestId("diagram-canvas")).toBeVisible();
  await expect(page.getByText(/100 objects · 150 connectors/)).toBeVisible();
  expect(Date.now() - started).toBeLessThan(30_000);
  await page.getByTestId("diagram-canvas").click({ position: { x: 90, y: 80 } });
  await expect(page.getByRole("complementary", { name: "Properties inspector" })).toBeVisible();
});
