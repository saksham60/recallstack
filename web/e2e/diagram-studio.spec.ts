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

  test("uses a compact shape drag preview instead of ghosting the palette", async ({ authenticatedPage: page }) => {
    await page.evaluate(() => {
      const original = DataTransfer.prototype.setDragImage;
      DataTransfer.prototype.setDragImage = function setDragImage(image, x, y) {
        document.documentElement.dataset.diagramDragPreview = JSON.stringify({
          width: image.getBoundingClientRect().width,
          text: image.textContent?.trim() ?? "",
          x,
          y,
        });
        original.call(this, image, x, y);
      };
    });

    await page.getByRole("button", { name: "Rectangle", exact: true }).dragTo(page.getByTestId("diagram-canvas"), {
      targetPosition: { x: 420, y: 240 },
    });

    const preview = await page.evaluate(() => JSON.parse(document.documentElement.dataset.diagramDragPreview ?? "{}") as { width?: number; text?: string });
    expect(preview.width).toBeLessThanOrEqual(172);
    expect(preview.text).toBe("Rectangle");
    await expect(page.getByText(/1 objects · 0 connectors/)).toBeVisible();
  });

  test("connects general rectangles by dragging between their ports", async ({ authenticatedPage: page }) => {
    const canvas = page.getByTestId("diagram-canvas");
    const rectangle = page.getByRole("button", { name: "Rectangle", exact: true });
    await rectangle.dragTo(canvas, { targetPosition: { x: 220, y: 180 } });
    await rectangle.first().dragTo(canvas, { targetPosition: { x: 540, y: 180 } });
    await expect(page.getByText(/2 objects · 0 connectors/)).toBeVisible();

    await expect.poll(async () => page.evaluate(() => {
      const raw = localStorage.getItem("recallstack:diagram:e2e-studio");
      if (!raw) return 0;
      const document = JSON.parse(raw) as { rootPageId: string; pages: Record<string, { elements: unknown[] }> };
      return document.pages[document.rootPageId]?.elements.length ?? 0;
    })).toBe(2);
    const shapes = await page.evaluate(() => {
      const document = JSON.parse(localStorage.getItem("recallstack:diagram:e2e-studio") ?? "{}") as { rootPageId: string; pages: Record<string, { elements: Array<{ kind: string; x: number; y: number; width: number; height: number }> }> };
      return document.pages[document.rootPageId].elements.filter((element) => element.kind === "shape");
    });
    expect(shapes[0]).toMatchObject({ x: 220, y: 180 });
    expect(shapes[1]).toMatchObject({ x: 540, y: 180 });

    await page.getByRole("button", { name: "Connect" }).click();
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) return;
    await page.mouse.move(bounds.x + shapes[0].x + shapes[0].width, bounds.y + shapes[0].y + shapes[0].height / 2);
    await page.mouse.down();
    await expect(page.getByText(/Drag to a highlighted port/)).toBeVisible();
    await page.mouse.move(bounds.x + shapes[1].x, bounds.y + shapes[1].y + shapes[1].height / 2, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByText(/2 objects · 1 connectors/)).toBeVisible();
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
