import { test, expect } from "./fixtures/authenticated-test";
import { createProfile } from "./helpers/factories";

const proposal = { summary: "Add a service with a Redis cache", operations: [
  { op: "add_node", ref: "new:service", type: "service", label: "URL Service", x: 100, y: 100 },
  { op: "add_node", ref: "new:redis", type: "cache", label: "Redis", technology: "redis", x: 400, y: 100 },
  { op: "add_edge", sourceNodeId: "new:service", targetNodeId: "new:redis", type: "database_read", label: "Lookup" },
] };
test.beforeEach(async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: createProfile({ roles: ["admin"] }) }));
  await page.goto("/system-design/canvas");
  await expect(page.getByTestId("system-design-canvas")).toBeVisible({ timeout: 30_000 });
});

test("empty canvas proposal stays private and unchanged through preview, then applies nodes and edges once", async ({ authenticatedPage: page }) => {
  await page.route("**/api/reasonai/chat", (route) => {
    const body = route.request().postDataJSON();
    expect(body.mode).toBe("chat");
    expect(body.context.nodes).toEqual([]);
    expect(body.context.edges).toEqual([]);
    expect(body.history).toEqual([]);
    return route.fulfill({ json: { text: "Use a cache for hot redirects.", proposal } });
  });
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "ReasonAI", exact: true });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Message ReasonAI").fill("Design a URL shortener for 100M users.");
  await page.getByRole("button", { name: "Send to ReasonAI" }).click();
  await expect(dialog.getByRole("heading", { name: "Proposed Changes" })).toBeVisible();
  const status = page.getByLabel("Diagram status");
  await expect(status).toContainText(/Nodes\s+0/);
  await dialog.getByText("Preview", { exact: true }).click();
  await expect(dialog.locator("pre").first()).toContainText("new:service");
  await expect(status).toContainText(/Connections\s+0/);
  await page.screenshot({ path: "test-results/reasonai-panel.png" });
  await dialog.getByRole("button", { name: "Apply Changes" }).click();
  await expect(status).toContainText(/Nodes\s+2/);
  await expect(status).toContainText(/Connections\s+1/);
  await expect(dialog.getByText("Applied to canvas")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply Changes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close ReasonAI" }).click();
  await expect(page.getByRole("tab", { name: "Properties", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Layers", exact: true })).toBeVisible();
  await page.unroute("**/api/reasonai/chat");
  await page.route("**/api/reasonai/chat", (route) => {
    const body = route.request().postDataJSON();
    expect(body.context.nodes).toHaveLength(2);
    expect(body.context.edges).toHaveLength(1);
    expect(body.context.selectedEdgeIds).toEqual([body.context.edges[0].id]);
    expect(body.context.nodes[0]).not.toHaveProperty("style");
    expect(body.history).toHaveLength(2);
    expect(body.message).toContain("selected");
    return route.fulfill({ json: { text: "This connection reads cached URL mappings." } });
  });
  await page.getByRole("button", { name: "Explain", exact: true }).click();
  await page.getByRole("button", { name: "Send to ReasonAI" }).click();
  await expect(dialog.getByText("This connection reads cached URL mappings.")).toBeVisible();
});

test("discard, errors, and malicious proposals never change the canvas", async ({ authenticatedPage: page }) => {
  let attempt = 0;
  await page.route("**/api/reasonai/chat", (route) => {
    attempt++;
    return attempt === 1 ? route.fulfill({ status: 429, json: { error: "ReasonAI is busy. Please try again shortly." } })
      : route.fulfill({ json: { text: "Suggested design", proposal: attempt === 2 ? { ...proposal, operations: [...proposal.operations, { op: "delete_node", nodeId: "missing" }] } : proposal } });
  });
  await page.getByRole("button", { name: "Improve", exact: true }).click();
  await page.getByRole("button", { name: "Send to ReasonAI" }).click();
  await expect(page.getByRole("dialog", { name: "ReasonAI", exact: true }).getByRole("alert")).toContainText("ReasonAI is busy");
  await page.getByRole("button", { name: "Send to ReasonAI" }).click();
  await expect(page.getByRole("dialog", { name: "ReasonAI", exact: true }).getByRole("alert")).toContainText("missing");
  await page.getByRole("button", { name: "Send to ReasonAI" }).click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByText("Proposal discarded")).toBeVisible();
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+0/);
});

for (const [label, mode] of [["Chat", "chat"], ["Review", "review"], ["Fix", "fix"], ["Eagle View", "eagle"]]) {
  test(`${label} sends its mode and renders a textual response`, async ({ authenticatedPage: page }) => {
    await page.route("**/api/reasonai/chat", (route) => {
      expect(route.request().postDataJSON().mode).toBe(mode);
      return route.fulfill({ json: { text: "Assess requirements before adding infrastructure." } });
    });
    await page.getByRole("button", { name: "Open ReasonAI" }).click();
    const dialog = page.getByRole("dialog", { name: "ReasonAI", exact: true });
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await page.getByLabel("Message ReasonAI").fill("Analyze this design");
    await page.getByRole("button", { name: "Send to ReasonAI" }).click();
    await expect(dialog.getByText("Assess requirements before adding infrastructure.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Apply Changes" })).toHaveCount(0);
  });
}

test("API rejects oversized or invalid requests without calling the provider", async ({ authenticatedPage: page }) => {
  const response = await page.request.post("/api/reasonai/chat", { data: { mode: "chat", message: "x".repeat(4001), history: [], context: { title: "Canvas", nodes: [], edges: [] } } });
  expect(response.status()).toBe(400);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
