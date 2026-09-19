import { expect, test } from "./fixtures/authenticated-test";
import { createPagination, createProfile, createStudyNoteResponse } from "./helpers/factories";
import type { DSATutorRequest } from "../src/features/dsa/reasonai/contract";
import { visualLesson, visualStep } from "./helpers/dsa-visual";
import type { Page } from "@playwright/test";

const problem = createStudyNoteResponse({
  title: "3Sum", slug: "3sum", difficulty: "medium", topics: [], primary_topic: null,
  categories: [{ id: "arrays", name: "Arrays", slug: "arrays", sort_order: 0 }],
  summary: "Practice problem from the Ultimate DSA sheet in Arrays.",
  practice_resources: [{ id: "p1", provider_name: "LeetCode", provider_slug: "leetcode", url: "https://leetcode.com/problems/3sum/", external_key: "3sum", title: "3Sum", is_primary: true, sort_order: 0 }],
});
test.beforeEach(async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: createProfile() }));
  await page.route("**/api/v1/content/*", (route) => route.fulfill({ json: problem }));
  await page.route("**/api/v1/me/content/*/notes", (route) => route.fulfill({ json: { items: [], pagination: createPagination() } }));
});

test("3Sum workspace sends approach, code, notes and progressive hints through the DSA API", async ({ authenticatedPage: page }) => {
  const requests: DSATutorRequest[] = [];
  await page.route("**/api/v1/me/content/*/notes", (route) => route.fulfill({ json: { items: [{ id: "n1", body: "Remember to check assumptions", kind: "note", created_at: "2026-09-13T00:00:00Z" }], pagination: createPagination(1) } }));
  await page.route("**/api/reasonai/dsa/chat", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { text: `Tutor response ${requests.length}`, sources: [], webStatus: "off" } });
  });
  await page.goto("/dsa/problem/3sum");
  await expect(page.getByRole("heading", { name: "3Sum", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open on LeetCode" })).toHaveAttribute("href", problem.practice_resources[0].url);
  await expect(page.getByRole("tab", { name: "Workspace", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Problem Statement", { exact: true })).toHaveCount(0);
  await page.getByLabel("My approach", { exact: true }).fill("I think I'll sort the array and loop over each value...");
  await page.getByRole("button", { name: "Review with ReasonAI" }).click();
  await expect(page.getByText("Tutor response 1", { exact: true })).toBeVisible();
  expect(requests[0]).toMatchObject({ action: "review", searchWeb: false, context: { title: "3Sum", category: "Arrays", userApproach: "I think I'll sort the array and loop over each value...", userNotes: "Remember to check assumptions" } });
  expect(requests[0].context).not.toHaveProperty("studyText");
  await page.getByText("Learning actions", { exact: true }).click();
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(page.getByText("Tutor response 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(page.getByText("Tutor response 3", { exact: true })).toBeVisible();
  expect(requests[1].hintLevel).toBe(1); expect(requests[2].hintLevel).toBe(2);
  expect(requests[2].history).toHaveLength(4);
  await page.getByText("My code", { exact: true }).click();
  await page.getByPlaceholder("Paste or type your code here...").fill("def solve(nums):\n    nums.sort()");
  await page.getByRole("button", { name: "Review my code" }).click();
  await expect(page.getByText("Tutor response 4", { exact: true })).toBeVisible();
  expect(requests[3].context.userCode).toContain("nums.sort()");
});

test("V2 renders multiple chunks before EOF and text.final replaces provisional text", async ({ authenticatedPage: page }) => {
  await installControlledV2Stream(page);
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Explain the pattern", exact: true }).click();
  await expect(page.getByText("First streamed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop response" })).toBeVisible();
  await page.evaluate(() => (window as typeof window & { __finishReasonAIStream?: () => void }).__finishReasonAIStream?.());
  await expect(page.getByText("Final authoritative answer.", { exact: true })).toBeVisible();
  await expect(page.getByText("First streamed answer", { exact: true })).toHaveCount(0);
});

test("V2 Stop preserves partial text and retry and clear remain functional", async ({ authenticatedPage: page }) => {
  await installControlledV2Stream(page, true);
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Explain the pattern", exact: true }).click();
  await expect(page.getByText("Partial answer remains", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop response" }).click();
  await expect(page.getByText("Partial answer remains", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Response stopped" })).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Retry completed.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear chat" }).click();
  await expect(page.getByText("Retry completed.", { exact: true })).toHaveCount(0);
});

test("V2 persists a first conversation, replays idempotently and restores it after reload", async ({ authenticatedPage: page }) => {
  const idempotencyKey = crypto.randomUUID();
  const body: DSATutorRequest = {
    action: "chat",
    message: "What exactly is this problem asking?",
    searchWeb: false,
    hintLevel: 0,
    history: [],
    idempotencyKey,
    context: {
      contentId: problem.content_item_id,
      slug: problem.slug,
      title: problem.title,
      userApproach: "",
      userNotes: "",
      userCode: "",
    },
  };
  const first = await page.request.post("/api/reasonai/dsa/chat", {
    headers: { Accept: "application/x-ndjson" },
    data: body,
  });
  expect(first.status()).toBe(200);
  const conversationId = first.headers()["x-reasonai-conversation-id"];
  expect(conversationId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(await first.text()).toContain('"type":"text.final"');

  const replay = await page.request.post("/api/reasonai/dsa/chat", {
    headers: { Accept: "application/x-ndjson" },
    data: { ...body, conversationId },
  });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({ conversationId, status: "completed", replayed: true });

  const second = await page.request.post("/api/reasonai/dsa/chat", {
    headers: { Accept: "application/x-ndjson" },
    data: { ...body, conversationId, idempotencyKey: crypto.randomUUID() },
  });
  expect(second.status()).toBe(200);
  expect(second.headers()["x-reasonai-conversation-id"]).toBe(conversationId);
  expect(await second.text()).toContain('"type":"run.completed"');

  const persisted = await page.request.get(`/api/reasonai/conversations/${conversationId}`);
  expect(persisted.status()).toBe(200);
  const transcript = (await persisted.json()).conversation;
  expect(transcript.messages).toHaveLength(4);
  expect(transcript.messages.map((message: { role: string }) => message.role)).toEqual(["user", "assistant", "user", "assistant"]);
  expect(transcript.messages[3].parts.find((part: { type: string }) => part.type === "text")).toMatchObject({ finalized: true });

  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: `reasonai:dsa:conversation:${problem.content_item_id}`,
    value: conversationId,
  });
  await page.goto("/dsa/problem/3sum");
  await expect(page.getByText(/not the original requirements/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Clear chat" }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), `reasonai:dsa:conversation:${problem.content_item_id}`)).toBeNull();
});

test("conversation APIs create, list, read and delete only bounded authenticated records", async ({ authenticatedPage: page }) => {
  expect((await page.request.post("/api/reasonai/conversations", { data: { surface: "dsa", userId: crypto.randomUUID() } })).status()).toBe(400);
  const created = await page.request.post("/api/reasonai/conversations", { data: { surface: "dsa", contextId: "api-context", title: "API conversation" } });
  expect(created.status()).toBe(201);
  const { conversationId } = await created.json();
  const listed = await page.request.get("/api/reasonai/conversations?surface=dsa&contextId=api-context&limit=5");
  expect(listed.status()).toBe(200);
  expect((await listed.json()).conversations).toContainEqual(expect.objectContaining({ id: conversationId, title: "API conversation" }));
  expect((await page.request.get(`/api/reasonai/conversations/${conversationId}`)).status()).toBe(200);
  expect((await page.request.delete(`/api/reasonai/conversations/${conversationId}`)).status()).toBe(204);
  expect((await page.request.get(`/api/reasonai/conversations/${conversationId}`)).status()).toBe(404);
});

test("web search toggle and compact sources, with no raw retrieved content", async ({ authenticatedPage: page }) => {
  let sent: DSATutorRequest | undefined;
  await page.route("**/api/reasonai/dsa/chat", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { text: "Here is the source-grounded explanation [1].", webStatus: "used", sources: [{ title: "3Sum", url: problem.practice_resources[0].url }] } });
  });
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Search web", exact: true }).click();
  await page.getByLabel("Ask ReasonAI", { exact: true }).fill("What exactly is this problem asking?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Here is the source-grounded explanation [1].")).toBeVisible();
  expect(sent?.searchWeb).toBe(true);
  await expect(page.getByText("Powered by Tavily", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /1\. leetcode.com/ })).toHaveAttribute("rel", "noopener noreferrer");
});

test("empty editors, errors, retry, collapse and draft preservation", async ({ authenticatedPage: page }) => {
  let attempts = 0;
  await page.route("**/api/reasonai/dsa/chat", (route) => {
    attempts++;
    return route.fulfill(attempts === 1 ? { status: 504, json: { error: "ReasonAI timed out. Please try again." } } : { json: { text: "Try a small first step.", sources: [], webStatus: "off" } });
  });
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Review with ReasonAI" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Write your approach first" })).toBeVisible();
  expect(attempts).toBe(0);
  await page.getByText("My code", { exact: true }).click();
  await page.getByRole("button", { name: "Review my code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Write your code first" })).toBeVisible();
  await page.getByLabel("My approach", { exact: true }).fill("My working idea");
  await page.getByRole("button", { name: "Review with ReasonAI" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "timed out" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open on LeetCode" })).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Try a small first step.")).toBeVisible();
  await page.getByLabel("Ask ReasonAI", { exact: true }).fill("My next question");
  await page.getByRole("button", { name: "Collapse ReasonAI" }).click();
  await page.getByRole("button", { name: "ReasonAI", exact: true }).first().click();
  await expect(page.getByLabel("Ask ReasonAI", { exact: true })).toHaveValue("My next question");
  await expect(page.getByLabel("My approach", { exact: true })).toHaveValue("My working idea");
  await expect(page.getByText("Try a small first step.")).toBeVisible();
});

test("mobile tutor works as a tab and keeps workspace edits", async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dsa/problem/3sum");
  await page.getByLabel("My approach", { exact: true }).fill("A mobile idea");
  await page.getByRole("button", { name: "ReasonAI", exact: true }).click();
  await expect(page.getByLabel("Ask ReasonAI", { exact: true })).toBeVisible();
  await expect(page.getByLabel("My approach", { exact: true })).not.toBeVisible();
  await page.getByLabel("Ask ReasonAI", { exact: true }).fill("Keep this draft");
  await page.getByRole("button", { name: "Learning workspace", exact: true }).click();
  await expect(page.getByLabel("My approach", { exact: true })).toHaveValue("A mobile idea");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("missing URL and arbitrary providers render safely on legacy URLs", async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/content/missing", (route) => route.fulfill({ json: { ...problem, slug: "missing", practice_resources: [] } }));
  await page.goto("/content/missing");
  await expect(page.getByText("No practice link available", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("My approach", { exact: true })).toBeVisible();
  await page.route("**/api/v1/content/custom", (route) => route.fulfill({ json: { ...problem, slug: "custom", practice_resources: [{ ...problem.practice_resources[0], provider_name: "InterviewBit", url: "https://www.interviewbit.com/problems/3-sum/" }] } }));
  await page.goto("/content/custom");
  await expect(page.getByRole("link", { name: "Open on InterviewBit" })).toBeVisible();
});

test("expired chat session retains the external link and offers login", async ({ authenticatedPage: page }) => {
  await page.route("**/api/reasonai/dsa/chat", (route) => route.fulfill({ status: 401, json: { error: "Your session has expired. Sign in to use ReasonAI." } }));
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Help me start" }).click();
  await expect(page.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", /\/login\?next=/);
  await expect(page.getByRole("link", { name: "Open on LeetCode" })).toBeVisible();
});

async function installControlledV2Stream(page: Page, retryMode = false) {
  await page.addInitScript(({ retryMode }) => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    let attempt = 0;
    const event = (seq: number, type: string, fields: Record<string, unknown> = {}) => `${JSON.stringify({ protocolVersion: 1, runId: `run-${attempt}`, seq, type, ...fields })}\n`;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/api/reasonai/dsa/chat")) return nativeFetch(input, init);
      attempt += 1;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const push = (value: string) => controller.enqueue(encoder.encode(value));
          push(event(1, "run.started") + event(2, "text.delta", { messageId: "message-1", partId: "text-1", delta: retryMode ? "Partial answer remains" : "First streamed " }));
          const finish = () => {
            if (retryMode && attempt === 1) return;
            push(event(3, "text.delta", { messageId: "message-1", partId: "text-1", delta: "answer" }));
            push(event(4, "text.final", { messageId: "message-1", partId: "text-1", text: retryMode ? "Retry completed." : "Final authoritative answer." }));
            push(event(5, "sources.ready", { messageId: "message-1", partId: "sources-1", sources: [], retrievalStatus: "off" }));
            push(event(6, "run.completed"));
            controller.close();
          };
          if (retryMode && attempt > 1) finish();
          else (window as typeof window & { __finishReasonAIStream?: () => void }).__finishReasonAIStream = finish;
          init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
        },
      });
      return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
    };
  }, { retryMode });
}

test("category Practice opens the dedicated workspace", async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/categories/*/content*", (route) => route.fulfill({ json: {
    items: [{ content_item_id: problem.content_item_id, title: problem.title, slug: problem.slug, difficulty: problem.difficulty, primary_topic: null, user_progress: problem.user_progress, is_bookmarked: false }],
    pagination: createPagination(1),
  } }));
  await page.goto("/dsa/arrays");
  const link = page.getByRole("link", { name: /Practice/ });
  await expect(link).toHaveAttribute("href", "/dsa/problem/3sum");
  await link.click();
  await expect(page.getByLabel("My approach", { exact: true })).toBeVisible();
});

test("workbook attribution, related links and practice tracking remain available", async ({ authenticatedPage: page }) => {
  await page.route("**/api/v1/content/*", (route) => route.fulfill({ json: { ...problem,
    blocks: [{ id: "b1", type: "recognize", position: 0, heading: "Source", payload: { source: { companies: "Workbook Company", remarks: "Original workbook remark" } } }],
    related_content: [{ content_item_id: "c2", slug: "related", title: "Related catalog entry", relation_type: "related", sort_order: 0, difficulty: "easy", summary: null, type: "problem" }],
  } }));
  await page.goto("/dsa/problem/3sum");
  await page.getByText("Problem info", { exact: true }).click();
  await expect(page.getByText("Workbook Company", { exact: true })).toBeVisible();
  await expect(page.getByText("Original workbook remark", { exact: true })).toBeVisible();
  await page.getByText("Track practice & revision", { exact: true }).click();
  await page.getByRole("button", { name: "Update Progress" }).click();
  await expect(page.getByRole("heading", { name: "Log Practice Attempt" })).toBeVisible();
  await page.getByRole("tab", { name: "Similar", exact: true }).click();
  await expect(page.getByRole("link", { name: "Related catalog entry" })).toHaveAttribute("href", "/content/related");
});

test("DSA route validates requests and guards unknown requirements without a provider call", async ({ authenticatedPage: page }) => {
  const request = { action: "chat", message: "What exactly is this problem asking?", searchWeb: false, hintLevel: 0, history: [], context: { contentId: "c1", slug: "3sum", title: "3Sum", userApproach: "", userCode: "", userNotes: "" } };
  const response = await page.request.post("/api/reasonai/dsa/chat", { data: request });
  expect(response.status()).toBe(200);
  expect((await response.json()).text).toContain("not the original requirements");
  const invalid = await page.request.post("/api/reasonai/dsa/chat", { data: { ...request, context: { ...request.context, studyText: "fake" } } });
  expect(invalid.status()).toBe(400);
  const crossOrigin = await page.request.post("/api/reasonai/dsa/chat", { headers: { origin: "https://untrusted.example" }, data: request });
  expect(crossOrigin.status()).toBe(403);
});

test("unauthenticated DSA requests return JSON 401 instead of a login redirect", async ({ request }) => {
  const response = await request.post("/api/reasonai/dsa/chat", { data: {} });
  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain("application/json");
});

test("desktop workspace visual and metadata integrity", async ({ authenticatedPage: page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dsa/problem/3sum");
  await page.getByLabel("My approach", { exact: true }).fill("I think I'll sort the array and loop over each value.\n\nHow can I make use of the sorted order for the remaining elements?");
  await expect(page.getByRole("region", { name: "ReasonAI AI Tutor" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("dsa-desktop.png"), fullPage: true });
  await page.getByText("Problem info", { exact: true }).click();
  await expect(page.getByText("Companies", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Remarks", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "ReasonAI", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("dsa-mobile.png"), fullPage: true });
});

test("resize, focus and Escape preserve the workspace, draft and conversation", async ({ authenticatedPage: page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/reasonai/dsa/chat", (route) => route.fulfill({ json: { text: "## A useful observation\n\n**Sorted order** lets us predict which way a value changes.\n\n| Move | Effect |\n| --- | --- |\n| Left pointer forward | Value increases |\n| Right pointer backward | Value decreases |\n\nKeep this invariant in mind.", sources: [], webStatus: "off" } }));
  await page.goto("/dsa/problem/3sum");
  await page.getByLabel("My approach", { exact: true }).fill("Keep this idea while I focus.");
  const panel = page.getByRole("region", { name: "ReasonAI AI Tutor", exact: true });
  const original = await panel.boundingBox();
  const divider = page.getByRole("separator", { name: "Resize learning workspace" });
  await divider.focus(); await page.keyboard.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "30");
  expect((await panel.boundingBox())!.width).toBeGreaterThan(original!.width + 200);
  const handle = (await divider.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 70); await page.mouse.down();
  await page.mouse.move(handle.x + 150, handle.y + 70); await page.mouse.up();
  expect(Number(await divider.getAttribute("aria-valuenow"))).toBeGreaterThan(35);
  await page.getByRole("button", { name: "Explain the pattern", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A useful observation" })).toBeVisible();
  await expect(panel.locator("table th")).toHaveCount(2);
  await expect(panel.locator("strong")).toHaveText("Sorted order");
  await page.getByLabel("Ask ReasonAI", { exact: true }).fill("Keep this draft too");
  await page.getByRole("button", { name: "Focus on tutor", exact: true }).click();
  expect((await panel.boundingBox())!.width).toBe(1440);
  expect(await page.locator("#dsa-approach").evaluate((element) => Boolean(element.closest("[inert]")))).toBe(true);
  await expect(page.getByRole("link", { name: "LeetCode", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Larger text" }).click();
  await expect(page.getByRole("button", { name: "Larger text" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("dsa-focus-reading.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Ask ReasonAI", { exact: true })).toHaveValue("Keep this draft too");
  await expect(page.getByLabel("My approach", { exact: true })).toHaveValue("Keep this idea while I focus.");
  expect((await panel.boundingBox())!.width).toBeLessThan(1440);
});

test("visual walkthrough expands the stage, steps through state and reuses source context", async ({ authenticatedPage: page }, testInfo) => {
  const sent: DSATutorRequest[] = [];
  await page.route("**/api/reasonai/dsa/chat", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { text: visualLesson.summary, visual: visualLesson, sources: [{ title: "3Sum", url: problem.practice_resources[0].url }], webStatus: sent.length === 1 ? "used" : "cached", webContextToken: "signed-memory-context" } });
  });
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Visual walkthrough", exact: true }).click();
  await expect(page.getByRole("button", { name: "Return to split view" })).toBeVisible();
  const visual = page.getByRole("region", { name: "Visual walkthrough: Reading sorted order" });
  await expect(visual).toBeVisible();
  expect(sent[0].action).toBe("visualize");
  await expect(visual.getByText("Illustrative example · not an official test case")).toBeVisible();
  await expect(visual.getByText("Compare the endpoints", { exact: true })).toBeVisible();
  await visual.getByRole("button", { name: "Next step" }).click();
  await expect(visual.getByText("Move one position", { exact: true })).toBeVisible();
  await expect(visual.getByRole("slider", { name: "Walkthrough step" })).toHaveValue("2");
  const diagram = await visual.locator("header").boundingBox();
  const controls = await visual.getByRole("button", { name: "Next step" }).boundingBox();
  expect(diagram!.y).toBeGreaterThan(150);
  expect(controls!.y + controls!.height).toBeLessThan(720);
  await page.screenshot({ path: testInfo.outputPath("dsa-visual-focus.png") });
  await page.getByRole("button", { name: "Return to split view" }).click();
  await page.getByRole("button", { name: "Focus on tutor", exact: true }).click();
  await expect(visual.getByRole("slider", { name: "Walkthrough step" })).toHaveValue("2");
  await visual.getByRole("button", { name: "Play walkthrough" }).click();
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  await page.getByRole("button", { name: "Walkthrough", exact: true }).click();
  await expect(visual.getByRole("button", { name: "Play walkthrough" })).toBeVisible();
  await visual.getByRole("button", { name: "Play walkthrough" }).click();
  await expect(visual.getByText("Notice the invariant", { exact: true })).toBeVisible();
  await expect(visual.getByRole("button", { name: "Replay walkthrough" })).toBeVisible();
  await page.getByRole("button", { name: "Ask about this step" }).click();
  await page.getByLabel("Ask ReasonAI", { exact: true }).fill("Why did that pointer move?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Sources · Retrieved earlier", { exact: true })).toBeVisible();
  expect(sent[1].webContextToken).toBe("signed-memory-context");
  expect(sent[1].history[1].content).toContain("Move one position");
  expect(sent[1].visualFocus).toMatchObject({ stepNumber: 3, stepTitle: "Notice the invariant" });
  await page.getByRole("button", { name: "Clear chat" }).click();
  await page.getByRole("button", { name: "Help me start", exact: true }).click();
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2].webContextToken).toBeUndefined();
});

test("tutor Markdown treats HTML and unsafe URLs as inert text", async ({ authenticatedPage: page }) => {
  await page.route("**/api/reasonai/dsa/chat", (route) => route.fulfill({ json: { text: "## Read safely\n\n<script>window.pwned=true</script>\n\n[bad](javascript:alert(1)) ![tracking](https://tracker.invalid/pixel.png)\n\n[Good resource](https://example.com/lesson)\n\n```python\nx = 2**3**2\n```", sources: [], webStatus: "off" } }));
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Explain the pattern" }).click();
  const panel = page.getByRole("region", { name: "ReasonAI AI Tutor", exact: true });
  await expect(panel.getByRole("heading", { name: "Read safely" })).toBeVisible();
  await expect(panel.locator("script, img, a[href^='javascript:']")).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Good resource" })).toHaveAttribute("rel", "noopener noreferrer");
  await expect(panel.locator("pre code")).toHaveText("x = 2**3**2\n");
});

test("graph and grid scenes remain usable in the mobile teaching stage", async ({ authenticatedPage: page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let graph = true;
  await page.route("**/api/reasonai/dsa/chat", (route) => route.fulfill({ json: { text: "An illustrative state transition.", sources: [], webStatus: "off", visual: { ...visualLesson, title: graph ? "Explore a tree" : "Read a DP table", kind: graph ? "graph" : "grid", steps: [{ ...visualStep, values: [], highlights: [], pointers: [], nodes: graph ? [{ id: "a", label: "A", x: 50, y: 10, state: "active" }, { id: "b", label: "B", x: 20, y: 80, state: "default" } ] : [], edges: graph ? [{ from: "a", to: "b", label: "visit" }] : [], rows: graph ? [] : [["0", "1"], ["1", "2"]], activeCells: graph ? [] : [{ row: 1, column: 1 }] }] } } }));
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "ReasonAI", exact: true }).click();
  await page.getByRole("button", { name: "Visual walkthrough", exact: true }).click();
  await expect(page.getByRole("region", { name: "Visual walkthrough: Explore a tree" }).getByRole("img")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("dsa-mobile-graph.png") });
  graph = false;
  await page.getByRole("button", { name: "Clear chat" }).click();
  await page.getByRole("button", { name: "Visual walkthrough", exact: true }).click();
  await expect(page.getByRole("table", { name: "Algorithm grid" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Return to split view" }).click();
  await page.getByRole("button", { name: "Learning workspace", exact: true }).click();
  await expect(page.getByLabel("My approach", { exact: true })).toBeVisible();
});
