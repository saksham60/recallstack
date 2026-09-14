import { test, expect } from "./fixtures/authenticated-test";
import { createProfile } from "./helpers/factories";
import { analysisDocument, analysisResponse } from "./helpers/reasonai-analysis";
import { LocalStorageSystemDesignRepository } from "../src/features/system-design/repository/LocalStorageSystemDesignRepository";

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

test("ReasonAI floats above the canvas, can be moved, resized, and preserves drafts", async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const canvas = page.getByTestId("system-design-canvas");
  const closedCanvas = (await canvas.boundingBox())!;
  await page.getByRole("button", { name: "Open ReasonAI" }).click();

  const dialog = page.getByRole("dialog", { name: "ReasonAI", exact: true });
  const handle = dialog.getByRole("button", { name: "Move ReasonAI" });
  const initial = (await dialog.boundingBox())!;
  const openCanvas = (await canvas.boundingBox())!;
  expect(initial.width).toBeCloseTo(380, 0);
  expect(openCanvas.width).toBeCloseTo(closedCanvas.width, 0);

  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + 80, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(initial.x - 240, initial.y + 110, { steps: 8 });
  await page.mouse.up();
  const moved = (await dialog.boundingBox())!;
  expect(moved.x).toBeLessThan(initial.x - 100);
  expect(moved.y).toBeGreaterThan(initial.y + 50);

  await page.mouse.move(moved.x + moved.width - 2, moved.y + moved.height - 2);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width + 94, moved.y + moved.height + 62, {
    steps: 8,
  });
  await page.mouse.up();
  const resized = (await dialog.boundingBox())!;
  expect(resized.width).toBeGreaterThan(moved.width + 50);

  await page.getByLabel("Message ReasonAI").fill("Keep my draft");
  await dialog.getByRole("button", { name: "Close ReasonAI" }).click();
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  await expect(page.getByLabel("Message ReasonAI")).toHaveValue("Keep my draft");
  expect((await dialog.boundingBox())!.width).toBeCloseTo(resized.width, 0);

  await handle.focus();
  const reopened = (await dialog.boundingBox())!;
  await page.keyboard.press("ArrowRight");
  expect((await dialog.boundingBox())!.x).toBeCloseTo(reopened.x + 16, 0);

  await page.setViewportSize({ width: 1100, height: 720 });
  const withinEditor = () =>
    dialog.evaluate((element) => {
      const panel = element.getBoundingClientRect();
      const bounds = element.parentElement!.getBoundingClientRect();
      return (
        panel.left >= bounds.left &&
        panel.top >= bounds.top &&
        panel.right <= bounds.right + 1 &&
        panel.bottom <= bounds.bottom + 1
      );
    });
  await expect.poll(withinEditor).toBe(true);

  await page.route("**/api/reasonai/chat", (route) =>
    route.fulfill({ json: { text: "Observed: The canvas is empty.\n\n".repeat(40) } }),
  );
  await page.getByLabel("Message ReasonAI").press("Enter");
  await expect(dialog.getByRole("log")).toContainText("Observed: The canvas is empty.");
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+0/);
});

test("independent generated cards use native canvas drops, dependencies, private refs and history", async ({ authenticatedPage: page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  let latestContext: { nodes: { id: string; label: string; x: number; y: number }[]; edges: { sourceNodeId: string; targetNodeId: string }[] } | undefined;
  await page.route("**/api/reasonai/chat", (route) => {
    const body = route.request().postDataJSON();
    latestContext = body.context;
    return route.fulfill({ json: { text: "Use a cache for hot redirects.", proposal: { ...proposal, operations: [...proposal.operations, { op: "add_node", ref: "new:kafka", type: "message_queue", label: "Kafka", x: 999, y: 999 }] } } });
  });
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  const dialog = page.getByRole("dialog", { name: "ReasonAI", exact: true });
  const canvas = page.getByTestId("system-design-canvas");
  await page.getByLabel("Message ReasonAI").fill("Design a URL shortener");
  await page.getByLabel("Message ReasonAI").press("Enter");
  const service = dialog.getByRole("region", { name: "Suggestion: URL Service", exact: true });
  const redis = dialog.getByRole("region", { name: "Suggestion: Redis", exact: true });
  const kafka = dialog.getByRole("region", { name: "Suggestion: Kafka", exact: true });
  const connection = dialog.getByRole("region", { name: "Suggestion: URL Service → Redis", exact: true });
  await expect(redis).toBeVisible();
  await expect(dialog.locator("pre")).toHaveCount(0);
  await expect(dialog).not.toContainText(/new:redis|new:service|propose_canvas_changes/);
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+0/);
  await expect(connection.getByRole("button", { name: "Connect", exact: true })).toBeDisabled();
  await service.getByRole("button", { name: "Drag URL Service to canvas" }).dragTo(canvas, { targetPosition: { x: 100, y: 150 } });
  await expect(service).toHaveAttribute("data-suggestion-status", "added");
  await expect(connection.getByRole("button", { name: "Connect", exact: true })).toBeDisabled();
  await redis.getByRole("button", { name: "Drag Redis to canvas" }).dragTo(canvas, { targetPosition: { x: 300, y: 300 } });
  await expect(redis).toHaveAttribute("data-suggestion-status", "added");
  await expect(redis.getByRole("button", { name: "Drag Redis to canvas" })).toBeDisabled();
  await expect(kafka).toHaveAttribute("data-suggestion-status", "pending");
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+2/);
  await expect(connection.getByRole("button", { name: "Connect", exact: true })).toBeEnabled();
  await connection.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByLabel("Diagram status")).toContainText(/Connections\s+1/);
  await connection.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(connection).toHaveAttribute("data-suggestion-status", "undone");
  await expect(page.getByLabel("Diagram status")).toContainText(/Connections\s+0/);
  await redis.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(redis).toHaveAttribute("data-suggestion-status", "undone");
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+1/);
  await expect(connection.getByRole("button", { name: "Connect", exact: true })).toBeDisabled();
  await redis.getByRole("button", { name: "Drag Redis to canvas" }).dragTo(canvas, { targetPosition: { x: 300, y: 300 } });
  await kafka.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByLabel("Message ReasonAI").fill("Explain this design");
  await page.getByLabel("Message ReasonAI").press("Enter");
  await expect.poll(() => latestContext?.nodes.length).toBe(2);
  const cache = latestContext!.nodes.find((node) => node.label === "Redis")!;
  expect(cache.id).toMatch(/^node_[a-f0-9-]{36}$/);
  expect(cache.x).not.toBe(400);
  const zoom = Number(await canvas.getAttribute("data-viewport-zoom"));
  const viewportX = Number(await canvas.getAttribute("data-viewport-x"));
  // Cache default width is 150; coordinates are centered using the palette path.
  expect(cache.x).toBeCloseTo(Math.round(((300 - viewportX) / zoom) / 24) * 24 - 75, 0);
  await page.getByRole("button", { name: "Close ReasonAI" }).click();
  await canvas.focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+1/);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+2/);
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  await expect(redis.first()).toHaveAttribute("data-suggestion-status", "added");
  await page.screenshot({ path: "test-results/reasonai-conversation.png" });
});

test("discard, errors, and malicious proposals never change the canvas", async ({ authenticatedPage: page }) => {
  let attempt = 0;
  await page.route("**/api/reasonai/chat", (route) => {
    attempt++;
    if (attempt === 3) return route.fulfill({ contentType: "application/json", body: '{"private":"USER_SECRET",' });
    return attempt === 1 ? route.fulfill({ status: 429, json: { error: "ReasonAI is busy. Please try again shortly." } })
      : route.fulfill({ json: { text: "Suggested design", proposal: attempt === 2 ? { ...proposal, operations: [...proposal.operations, { op: "delete_node", nodeId: "missing" }] } : proposal } });
  });
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  await page.getByRole("button", { name: "Improve", exact: true }).click();
  await page.getByRole("button", { name: "Send to ReasonAI" }).click();
  await expect(page.getByRole("dialog", { name: "ReasonAI", exact: true }).getByRole("alert")).toContainText("ReasonAI is busy");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "ReasonAI", exact: true }).getByRole("alert")).toHaveText("ReasonAI returned an invalid canvas proposal. No changes were applied.");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "ReasonAI", exact: true }).getByRole("alert")).toHaveText("ReasonAI could not complete that response. Please try again.");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
  await expect(page.getByText("Dismissed", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+0/);
});

test("Explain cleans accidental Markdown and entities without changing the canvas", async ({ authenticatedPage: page }) => {
  await page.route("**/api/reasonai/chat", (route) => route.fulfill({ json: {
    text: "```markdown\n### **URL Shortener**&#x20;\n\nObserved\n- The canvas is empty.\n\n| Component | Recommendation |\n| --- | --- |\n| Redirect Service | Add only when needed |\n\n**Assumptions**\n• Read traffic dominates.\nDo not assume node_internal_unknown or edge_internal_unknown exists.\n```",
  } }));
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  await page.getByRole("button", { name: "Explain", exact: true }).click();
  await page.getByRole("button", { name: "Send to ReasonAI" }).click();
  const dialog = page.getByRole("dialog", { name: "ReasonAI", exact: true });
  const answer = dialog.getByRole("log").locator("article").last().locator("p").nth(1);
  await expect(answer).toContainText("URL Shortener");
  await expect(answer).toContainText("• The canvas is empty.");
  await expect(answer).toContainText("Component: Redirect Service; Recommendation: Add only when needed");
  await expect(answer).not.toContainText(/\*\*|###|&#x20;|\| Component|node_internal|edge_internal|```/);
  await expect(answer).toHaveCSS("white-space", "pre-wrap");
  expect(await answer.textContent()).toContain("\n\nObserved\n");
  expect(await answer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+0/);
  await expect(dialog.getByRole("button", { name: "Apply Changes" })).toHaveCount(0);
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

test("conversation supports multiline input, immediate user turns, regenerate, stop and clear", async ({ authenticatedPage: page }) => {
  test.setTimeout(60_000);
  let attempts = 0;
  let release: () => void = () => {};
  const slow = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/reasonai/chat", async (route) => {
    attempts++;
    if (attempts >= 3) await slow;
    await route.fulfill({ json: { text: `Answer ${attempts}` } }).catch(() => {});
  });
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  const dialog = page.getByRole("dialog", { name: "ReasonAI", exact: true });
  const input = page.getByLabel("Message ReasonAI");
  await input.fill("Explain");
  await input.press("Shift+Enter");
  await input.pressSequentially("the read path");
  await expect(input).toHaveValue("Explain\nthe read path");
  await input.press("Enter");
  await expect(dialog.getByRole("log")).toContainText("Explain\nthe read path");
  await expect(dialog.getByText("Answer 1", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Regenerate" }).click();
  await expect(dialog.getByText("Answer 2", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Answer 1", { exact: true })).toHaveCount(0);
  await input.fill("A slower question");
  await input.press("Enter");
  await expect(dialog.getByText("A slower question", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Stop generating" })).toBeVisible();
  await expect(input).toBeVisible();
  await dialog.getByRole("button", { name: "Stop generating" }).click();
  await expect(dialog.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Clear conversation" }).click();
  release();
  await expect(dialog.getByRole("log").locator("article")).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(input).toHaveValue("");
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+0/);
});

test("a connection suggestion becomes unavailable when an endpoint is deleted", async ({ authenticatedPage: page }) => {
  let attempt = 0;
  await page.route("**/api/reasonai/chat", (route) => {
    attempt++;
    const context = route.request().postDataJSON().context;
    return route.fulfill({ json: { text: "Connect the request path", proposal: attempt === 1 ? proposal : {
      summary: "Connect to the cache", operations: [{ op: "add_edge", sourceNodeId: context.nodes[0].id, targetNodeId: context.nodes[1].id, type: "database_read" }],
    } } });
  });
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  const input = page.getByLabel("Message ReasonAI");
  await input.fill("Suggest components");
  await input.press("Enter");
  await page.getByRole("region", { name: "Suggestion: URL Service", exact: true }).getByRole("button", { name: "Add to canvas", exact: true }).click();
  await page.getByRole("region", { name: "Suggestion: Redis", exact: true }).getByRole("button", { name: "Add to canvas", exact: true }).click();
  await input.fill("Connect them");
  await input.press("Enter");
  await expect(page.getByRole("region", { name: "Suggestion: URL Service → Redis", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Close ReasonAI" }).click();
  await page.getByTestId("system-design-canvas").focus();
  await page.keyboard.press("Delete");
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+1/);
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  const last = page.getByRole("log").locator("article").last();
  await expect(last.getByRole("button", { name: "Connect", exact: true })).toBeDisabled();
  await expect(last).toContainText("Unavailable");
  await expect(page.getByLabel("Diagram status")).toContainText(/Connections\s+0/);
});

test("analysis highlights the existing canvas, clears safely, and stays out of persistence and undo", async ({ authenticatedPage: page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const document = analysisDocument();
  const key = LocalStorageSystemDesignRepository.storageKey("url-shortener");
  await page.evaluate(({ key, document }) => localStorage.setItem(key, JSON.stringify(document)), { key, document });
  await page.goto("/system-design/url-shortener");
  const canvas = page.getByTestId("system-design-canvas");
  await expect(canvas).toBeVisible();
  const before = await page.evaluate((key) => localStorage.getItem(key), key);
  const layerCount = await canvas.locator("canvas").count();
  const canvasBounds = (await canvas.boundingBox())!;
  const ringClip = { x: canvasBounds.x + 453, y: canvasBounds.y + 380, width: 8, height: 30 };
  const beforeRing = await page.screenshot({ clip: ringClip });
  await page.route("**/api/reasonai/chat", (route) => route.fulfill({ json: { text: analysisResponse.summary, visualization: analysisResponse, sources: [{ id: 1, title: "Postgres availability", url: "https://www.postgresql.org/docs/current/high-availability.html" }] } }));
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  await page.getByLabel("Message ReasonAI").fill("What happens if Postgres fails?");
  await page.getByLabel("Message ReasonAI").press("Enter");
  const overlay = page.getByRole("region", { name: "ReasonAI analysis", exact: true });
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Hypothetical");
  await expect(canvas.locator("canvas")).toHaveCount(layerCount);
  expect(await page.screenshot({ clip: ringClip })).not.toEqual(beforeRing);
  await page.screenshot({ path: "test-results/reasonai-analysis.png" });
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: /Postgres availability/ })).toHaveAttribute("rel", "noopener noreferrer");
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(before);
  await page.getByRole("button", { name: "Close ReasonAI" }).click();
  // The overlay layer must not intercept canvas selection or dragging.
  const bounds = (await canvas.boundingBox())!;
  const api = document.diagrams[document.rootDiagramId].nodes[0];
  await page.mouse.click(bounds.x + api.x + api.width / 2, bounds.y + api.y + api.height / 2);
  await expect(page.getByLabel("Diagram status")).toContainText(/Selected\s+1/);
  await expect(overlay).toContainText("Reads depend on Postgres");
  await page.mouse.move(bounds.x + api.x + api.width / 2, bounds.y + api.y + api.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + api.x + api.width / 2 + 60, bounds.y + api.y + api.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await expect(overlay).toBeVisible();
  await page.getByRole("button", { name: "Clear analysis" }).click();
  await expect(overlay).toHaveCount(0);
  await expect(canvas.locator("canvas")).toHaveCount(layerCount);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  // Undo reverses the actual drag; analysis never becomes a history item.
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+3/);
  await page.getByRole("button", { name: /^(Save|Saved locally)$/ }).click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).diagrams, key)).toEqual(document.diagrams);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).not.toContain("Hypothetical");
});

test("late analysis is discarded after a topology change and never follows into nested diagrams", async ({ authenticatedPage: page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const document = analysisDocument();
  const key = LocalStorageSystemDesignRepository.storageKey("url-shortener");
  await page.evaluate(({ key, document }) => localStorage.setItem(key, JSON.stringify(document)), { key, document });
  await page.goto("/system-design/url-shortener");
  const canvas = page.getByTestId("system-design-canvas");
  await expect(canvas).toBeVisible();
  let release = () => {};
  let requested = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/reasonai/chat", async (route) => { requested = true; await gate; await route.fulfill({ json: { text: analysisResponse.summary, visualization: analysisResponse } }); });
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  await page.getByLabel("Message ReasonAI").fill("Show failure impact");
  await page.getByLabel("Message ReasonAI").press("Enter");
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: "Close ReasonAI" }).click();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + 220, bounds.y + 390);
  await canvas.focus();
  await page.keyboard.press("Delete");
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+2/);
  release();
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  await expect(page.getByRole("log")).toContainText("Hypothetical");
  await expect(page.getByRole("region", { name: "ReasonAI analysis", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close ReasonAI" }).click();
  await canvas.focus(); await page.keyboard.press("Control+z");
  await page.getByRole("button", { name: "Open ReasonAI" }).click();
  await page.getByLabel("Message ReasonAI").fill("Show failure impact again");
  await page.getByLabel("Message ReasonAI").press("Enter");
  await expect(page.getByRole("region", { name: "ReasonAI analysis", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close ReasonAI" }).click();
  await page.mouse.dblclick(bounds.x + 540, bounds.y + 145);
  await expect(page.getByRole("navigation", { name: "Diagram breadcrumb" }).getByText("Analytics", { exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "ReasonAI analysis", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Diagram status")).toContainText(/Nodes\s+1/);
});
