import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures/authenticated-test";
import { createProfile } from "./helpers/factories";

async function mockAdmin(page: Page) {
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: createProfile({ roles: ["admin"] }) }));
  await page.route("**/api/v1/diagrams**", (route) => route.abort());
}

test.describe("generic Diagram Studio", () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockAdmin(page);
    await page.addInitScript(() => localStorage.removeItem("recallstack:diagram:e2e-studio"));
    await page.goto("/admin/diagrams/e2e-studio");
    await expect(page.getByTestId("diagram-workspace")).toBeVisible();
  });

  test("renders independent packs and pack-owned inspector controls", async ({ authenticatedPage: page }) => {
    await expect(page.getByRole("tab", { name: "General" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Flowchart" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "System Design" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "ER Diagram" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Cloud" })).toBeVisible();
    await expect(page.getByText(/0 objects · 0 connectors/)).toBeVisible();

    await page.getByRole("tab", { name: "Flowchart" }).click();
    await page.getByRole("button", { name: "Process" }).click();
    await expect(page.getByText(/1 objects · 0 connectors/)).toBeVisible();

    await page.getByRole("tab", { name: "System Design" }).click();
    await page.getByLabel("Search shapes").fill("postgresql");
    await page.getByRole("button", { name: "SQL Database" }).click();
    await page.getByLabel("Technology").selectOption("postgresql");
    await expect(page.getByLabel("PostgreSQL", { exact: true })).toBeVisible();
  });

  test("supports text, frames, layers, and nested page navigation", async ({ authenticatedPage: page }) => {
    await page.locator('button[title^="Text ·"]').click();
    await page.getByTestId("diagram-canvas").click({ position: { x: 380, y: 180 } });
    const editor = page.getByLabel("Edit element text");
    await editor.fill("Architecture notes\nSecond line");
    await editor.press("Control+Enter");
    await expect(page.getByText(/1 objects/)).toBeVisible();

    await page.locator('button[title^="Frame ·"]').click();
    await page.getByTestId("diagram-canvas").click({ position: { x: 520, y: 260 } });
    await expect(page.getByText(/2 objects/)).toBeVisible();
    await page.getByRole("button", { name: "Open layers panel" }).click();
    await expect(page.getByLabel("Layers panel", { exact: true })).toContainText("Frame");

    await page.getByRole("tab", { name: "System Design" }).click();
    await page.getByLabel("Search shapes").fill("service");
    await page.getByRole("button", { name: "Service", exact: true }).click();
    await page.getByRole("tab", { name: "Properties" }).click();
    await page.getByRole("button", { name: "Create child page" }).click();
    await expect(page.getByText("Service detail")).toBeVisible();
    await page.getByRole("button", { name: "Page 1" }).first().click();
    await expect(page.getByText(/3 objects/)).toBeVisible();
  });

  test("exposes production export formats", async ({ authenticatedPage: page }) => {
    await page.getByRole("tab", { name: "Flowchart" }).click();
    await page.getByRole("button", { name: "Process" }).click();
    await page.getByRole("button", { name: "Export diagram" }).click();
    await expect(page.getByRole("menu", { name: "Export diagram" })).toContainText("PNG");
    await expect(page.getByRole("menu", { name: "Export diagram" })).toContainText("SVG");
    await expect(page.getByRole("menu", { name: "Export diagram" })).toContainText("PDF");
    await expect(page.getByRole("menu", { name: "Export diagram" })).toContainText("JSON");
    await expect(page.getByRole("menu", { name: "Export diagram" })).toContainText("diagrams.net subset");
  });
});

test("creates, reopens, renames, duplicates, and deletes library documents", async ({ authenticatedPage: page }) => {
  await mockAdmin(page);
  await page.goto("/admin/diagrams/new");
  await page.getByLabel("Diagram title").fill("Payment Platform");
  await page.getByRole("button", { name: /Blank Diagram/ }).click();
  await expect(page).toHaveURL(/\/admin\/diagrams\/[0-9a-f-]+$/);
  await expect(page.getByTestId("diagram-workspace")).toBeVisible();
  await page.goto("/admin/diagrams");
  await expect(page.getByRole("link", { name: "Payment Platform" })).toBeVisible();
  await page.getByRole("button", { name: "Rename Payment Platform" }).click();
  const rename = page.getByRole("textbox", { name: "Rename Payment Platform" });
  await rename.fill("Payment Platform v2");
  await rename.press("Enter");
  await expect(page.getByRole("link", { name: "Payment Platform v2" })).toBeVisible();
  await page.getByRole("button", { name: "Duplicate Payment Platform v2" }).click();
  await expect(page.getByRole("link", { name: "Payment Platform v2 Copy" })).toBeVisible();
  await page.getByRole("button", { name: "Delete Payment Platform v2 Copy" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("link", { name: "Payment Platform v2 Copy" })).toHaveCount(0);
});

test("keeps the generic canvas interactive with 100 nodes and 150 connectors", async ({ authenticatedPage: page }) => {
  await mockAdmin(page);
  const now = "2026-08-15T00:00:00.000Z";
  const nodes = Array.from({ length: 100 }, (_, index) => ({ id: `node-${index}`, kind: "shape", shapeDefinitionId: index % 2 ? "flowchart.process" : "generic.rectangle", label: `Node ${index}`, x: 40 + index % 10 * 190, y: 40 + Math.floor(index / 10) * 120, width: 160, height: 88, rotation: 0, style: { fill: "#18181b", stroke: "#a78bfa", strokeWidth: 1.5 }, layer: index, visible: true, locked: false }));
  const connectors = Array.from({ length: 150 }, (_, index) => ({ id: `edge-${index}`, kind: "connector", source: { elementId: `node-${index % 100}`, portId: "right" }, target: { elementId: `node-${(index * 7 + 1) % 100}`, portId: "left" }, routing: index % 3 === 0 ? "orthogonal" : index % 3 === 1 ? "curved" : "straight", waypoints: [], labels: [], style: { stroke: "#71717a", strokeWidth: 1.5, endArrowhead: "standard" }, layer: 100 + index, visible: true, locked: false }));
  const document = { schemaVersion: 1, id: "perf-id", title: "Performance", enabledPackIds: ["generic", "flowchart", "system-design"], rootPageId: "root", pages: { root: { id: "root", name: "Page 1", elements: [...nodes, ...connectors], viewport: { x: 0, y: 0, zoom: 0.65 } } }, createdAt: now, updatedAt: now };
  await page.addInitScript((payload) => localStorage.setItem("recallstack:diagram:perf-id", JSON.stringify(payload)), document);
  const started = Date.now();
  await page.goto("/admin/diagrams/perf-id");
  await expect(page.getByTestId("diagram-canvas")).toBeVisible();
  await expect(page.getByText(/100 objects · 150 connectors/)).toBeVisible();
  expect(Date.now() - started).toBeLessThan(30_000);
  await page.getByTestId("diagram-canvas").click({ position: { x: 90, y: 80 } });
  await expect(page.getByLabel("Properties inspector")).toBeVisible();
});
