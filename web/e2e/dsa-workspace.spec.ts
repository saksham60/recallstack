import { expect, test } from "./fixtures/authenticated-test";
import { createPagination, createStudyNoteResponse } from "./helpers/factories";
import { installV3API, baseProblem, ID, VERSION } from "./helpers/dsa-v3";
import type { DSATutorRequest } from "../src/features/dsa/reasonai/contract";
import { visualLesson, visualStep } from "./helpers/dsa-visual";
import type { Page } from "@playwright/test";

const problem = createStudyNoteResponse({
  content_item_id: ID,
  title: "3Sum",
  slug: "3sum",
  difficulty: "medium",
  topics: [],
  primary_topic: null,
  categories: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      name: "Arrays",
      slug: "arrays",
      sort_order: 0,
    },
  ],
  summary: "Practice problem from the Ultimate DSA sheet in Arrays.",
  practice_resources: [
    {
      id: "p1",
      provider_name: "LeetCode",
      provider_slug: "leetcode",
      url: "https://leetcode.com/problems/3sum/",
      external_key: "3sum",
      title: "3Sum",
      is_primary: true,
      sort_order: 0,
    },
  ],
});
test.beforeEach(async ({ authenticatedPage: page }) => {
  await installV3API(page);
  await page.route(`**/api/v1/dsa/problems/${ID}?**`, (r) =>
    r.fulfill({
      json: {
        ...baseProblem,
        slug: "3sum",
        title: "3Sum",
        difficulty: "medium",
      },
    }),
  );
  await page.route("**/api/v1/content/*", (r) => r.fulfill({ json: problem }));
});

async function enterCode(page: Page, code: string) {
  const editor = page.getByRole("textbox", {
    name: "Solution code",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(code);
}

test("canonical workspace sends approach, code, notes and progressive hints", async ({
  authenticatedPage: page,
}) => {
  const sent: DSATutorRequest[] = [];
  await page.route(`**/api/v1/dsa/me/problems/${ID}/notes?**`, (r) =>
    r.fulfill({
      json: {
        items: [
          {
            id: "n1",
            content_item_id: ID,
            body: "Remember assumptions",
            kind: "note",
            title: null,
            row_version: 1,
            created_at: "2026-10-16T00:00:00Z",
            updated_at: "2026-10-16T00:00:00Z",
          },
        ],
        pagination: createPagination(1),
      },
    }),
  );
  await page.route("**/api/reasonai/dsa/chat", (r) => {
    sent.push(r.request().postDataJSON());
    return r.fulfill({
      json: {
        text: `Tutor response ${sent.length}`,
        sources: [],
        webStatus: "off",
      },
    });
  });
  await page.goto("/dsa/problem/3sum");
  await page
    .getByLabel("My approach", { exact: true })
    .fill("Sort the array and scan two pointers.");
  await enterCode(page, "def solve(nums):\n    return nums\n");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(
    page.getByText("Tutor response 1", { exact: true }),
  ).toBeVisible();
  expect(sent[0].context).toMatchObject({
    contentId: ID,
    problemVersionId: VERSION,
    title: "3Sum",
    userApproach: "Sort the array and scan two pointers.",
    userNotes: "Remember assumptions",
  });
  expect(sent[0].context.userCode).toContain("return nums");
  await page.getByText("Learning actions", { exact: true }).click();
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(
    page.getByText("Tutor response 2", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(
    page.getByText("Tutor response 3", { exact: true }),
  ).toBeVisible();
  expect(sent[1].hintLevel).toBe(1);
  expect(sent[2].hintLevel).toBe(2);
});

test("V2 renders chunks before EOF and authoritative final text replaces provisional text", async ({
  authenticatedPage: page,
}) => {
  await installControlledV2Stream(page);
  await page.goto("/dsa/problem/3sum");
  await page
    .getByRole("button", { name: "Explain the problem", exact: true })
    .click();
  await expect(page.getByText("First streamed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as typeof window & { __finishReasonAIStream?: () => void }
    ).__finishReasonAIStream?.(),
  );
  await expect(
    page.getByText("Final authoritative answer.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("First streamed answer", { exact: true }),
  ).toHaveCount(0);
});

test("Stop retains partial text and retry and clear remain functional", async ({
  authenticatedPage: page,
}) => {
  await installControlledV2Stream(page, true);
  await page.goto("/dsa/problem/3sum");
  await page
    .getByRole("button", { name: "Explain the problem", exact: true })
    .click();
  await expect(
    page.getByText("Partial answer remains", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop response" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Response stopped" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("Retry completed.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear chat" }).click();
  await expect(page.getByText("Retry completed.", { exact: true })).toHaveCount(
    0,
  );
});

test("published attribution, related links and practice tracking survive migration", async ({
  authenticatedPage: page,
}) => {
  await page.route("**/api/v1/content/*", (r) =>
    r.fulfill({
      json: {
        ...problem,
        blocks: [
          {
            id: "b1",
            type: "recognize",
            position: 0,
            heading: "Source",
            payload: {
              source: {
                companies: "Workbook Company",
                remarks: "Original workbook remark",
              },
            },
          },
        ],
        related_content: [
          {
            content_item_id: "c2",
            slug: "related",
            title: "Related catalog entry",
            relation_type: "related",
            sort_order: 0,
            difficulty: "easy",
            summary: null,
            type: "problem",
          },
        ],
      },
    }),
  );
  await page.goto("/dsa/problem/3sum");
  await page
    .getByText("Sources, related resources & practice", { exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open on LeetCode" }),
  ).toHaveAttribute("href", problem.practice_resources[0].url);
  await expect(
    page.getByText("Original workbook remark", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Related catalog entry" }),
  ).toHaveAttribute("href", "/content/related");
  await page.getByRole("button", { name: "Update Progress" }).click();
  await expect(
    page.getByRole("heading", { name: "Log Practice Attempt" }),
  ).toBeVisible();
});

test("generic content deep links forward to the sole canonical workspace", async ({
  authenticatedPage: page,
}) => {
  await page.goto("/content/3sum");
  await expect(page).toHaveURL(/\/dsa\/problem\/3sum$/);
  await expect(page.locator(".studio-title h1")).toHaveText("3Sum");
  await expect(
    page.getByRole("textbox", { name: "Solution code", exact: true }),
  ).toBeVisible();
});

test("mobile tutor and code panels preserve approach and edits", async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await enterCode(page, "def solve(nums):\n    return []\n");
  await page.getByRole("button", { name: "AI Tutor", exact: true }).click();
  await expect(page.getByLabel("Ask ReasonAI", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "return []",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("visual walkthrough steps, focus, Markdown and source context remain functional", async ({
  authenticatedPage: page,
}) => {
  const sent: DSATutorRequest[] = [];
  await page.route("**/api/reasonai/dsa/chat", (r) => {
    sent.push(r.request().postDataJSON());
    return r.fulfill({
      json: {
        text: "## A useful observation\n\n**Sorted order** preserves a useful invariant.",
        visual: visualLesson,
        sources: [{ title: "3Sum", url: problem.practice_resources[0].url }],
        webStatus: sent.length === 1 ? "used" : "cached",
        webContextToken: "signed-memory-context",
      },
    });
  });
  await page.goto("/dsa/problem/3sum");
  await page
    .getByRole("button", { name: "Visual walkthrough", exact: true })
    .click();
  const visual = page.getByRole("region", {
    name: "Visual walkthrough: Reading sorted order",
  });
  await expect(visual).toBeVisible();
  await visual.getByRole("button", { name: "Next step" }).click();
  await expect(
    visual.getByText("Move one position", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ask about this step" }).click();
  await page
    .getByLabel("Ask ReasonAI", { exact: true })
    .fill("Why did that pointer move?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].webContextToken).toBe("signed-memory-context");
  expect(sent[1].visualFocus?.stepNumber).toBe(2);
  await page.getByRole("button", { name: "Return to split view" }).click();
});

test("tutor Markdown keeps HTML, tracking images and unsafe URLs inert", async ({
  authenticatedPage: page,
}) => {
  await page.route("**/api/reasonai/dsa/chat", (r) =>
    r.fulfill({
      json: {
        text: "## Read safely\n\n<script>window.pwned=true</script>\n\n[bad](javascript:alert(1)) ![tracking](https://tracker.invalid/pixel.png)\n\n[Good resource](https://example.com/lesson)\n\n```python\nx = 2**3**2\n```",
        sources: [],
        webStatus: "off",
      },
    }),
  );
  await page.goto("/dsa/problem/3sum");
  await page
    .getByRole("button", { name: "Explain the problem", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "ReasonAI AI Tutor",
    exact: true,
  });
  await expect(
    panel.getByRole("heading", { name: "Read safely" }),
  ).toBeVisible();
  await expect(
    panel.locator("script, img, a[href^='javascript:']"),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("link", { name: "Good resource" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await expect(panel.locator("pre code")).toHaveText("x = 2**3**2\n");
});

test("graph and grid visuals remain usable on a narrow browser", async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let graph = true;
  await page.route("**/api/reasonai/dsa/chat", (r) =>
    r.fulfill({
      json: {
        text: "An illustrative transition.",
        sources: [],
        webStatus: "off",
        visual: {
          ...visualLesson,
          title: graph ? "Explore a tree" : "Read a DP table",
          kind: graph ? "graph" : "grid",
          steps: [
            {
              ...visualStep,
              values: [],
              highlights: [],
              pointers: [],
              nodes: graph
                ? [
                    { id: "a", label: "A", x: 50, y: 10, state: "active" },
                    { id: "b", label: "B", x: 20, y: 80, state: "default" },
                  ]
                : [],
              edges: graph ? [{ from: "a", to: "b", label: "visit" }] : [],
              rows: graph
                ? []
                : [
                    ["0", "1"],
                    ["1", "2"],
                  ],
              activeCells: graph ? [] : [{ row: 1, column: 1 }],
            },
          ],
        },
      },
    }),
  );
  await page.goto("/dsa/problem/3sum");
  await page.getByRole("button", { name: "AI Tutor", exact: true }).click();
  await page
    .getByRole("button", { name: "Visual walkthrough", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Visual walkthrough: Explore a tree" })
      .getByRole("img"),
  ).toBeVisible();
  graph = false;
  await page.getByRole("button", { name: "Clear chat" }).click();
  await page
    .getByRole("button", { name: "Visual walkthrough", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Algorithm grid" }),
  ).toBeVisible();
});

test("conversation API persists turns and replays the original idempotency key", async ({
  authenticatedPage: page,
}) => {
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
  expect(await replay.json()).toMatchObject({
    conversationId,
    status: "completed",
    replayed: true,
  });

  const second = await page.request.post("/api/reasonai/dsa/chat", {
    headers: { Accept: "application/x-ndjson" },
    data: { ...body, conversationId, idempotencyKey: crypto.randomUUID() },
  });
  expect(second.status()).toBe(200);
  expect(second.headers()["x-reasonai-conversation-id"]).toBe(conversationId);
  expect(await second.text()).toContain('"type":"run.completed"');

  const persisted = await page.request.get(
    `/api/reasonai/conversations/${conversationId}`,
  );
  expect(persisted.status()).toBe(200);
  const transcript = (await persisted.json()).conversation;
  expect(transcript.messages).toHaveLength(4);
  expect(
    transcript.messages.map((message: { role: string }) => message.role),
  ).toEqual(["user", "assistant", "user", "assistant"]);
  expect(
    transcript.messages[3].parts.find(
      (part: { type: string }) => part.type === "text",
    ),
  ).toMatchObject({ finalized: true });
});

test("conversation APIs create, list, read and delete only bounded authenticated records", async ({
  authenticatedPage: page,
}) => {
  expect(
    (
      await page.request.post("/api/reasonai/conversations", {
        data: { surface: "dsa", userId: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(400);
  const created = await page.request.post("/api/reasonai/conversations", {
    data: {
      surface: "dsa",
      contextId: "api-context",
      title: "API conversation",
    },
  });
  expect(created.status()).toBe(201);
  const { conversationId } = await created.json();
  const listed = await page.request.get(
    "/api/reasonai/conversations?surface=dsa&contextId=api-context&limit=5",
  );
  expect(listed.status()).toBe(200);
  expect((await listed.json()).conversations).toContainEqual(
    expect.objectContaining({ id: conversationId, title: "API conversation" }),
  );
  expect(
    (
      await page.request.get(`/api/reasonai/conversations/${conversationId}`)
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.delete(`/api/reasonai/conversations/${conversationId}`)
    ).status(),
  ).toBe(204);
  expect(
    (
      await page.request.get(`/api/reasonai/conversations/${conversationId}`)
    ).status(),
  ).toBe(404);
});

test("DSA route validates requests and guards unknown requirements without a provider call", async ({
  authenticatedPage: page,
}) => {
  const request = {
    action: "chat",
    message: "What exactly is this problem asking?",
    searchWeb: false,
    hintLevel: 0,
    history: [],
    context: {
      contentId: "c1",
      slug: "3sum",
      title: "3Sum",
      userApproach: "",
      userCode: "",
      userNotes: "",
    },
  };
  const response = await page.request.post("/api/reasonai/dsa/chat", {
    data: request,
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).text).toContain(
    "not the original requirements",
  );
  const invalid = await page.request.post("/api/reasonai/dsa/chat", {
    data: { ...request, context: { ...request.context, studyText: "fake" } },
  });
  expect(invalid.status()).toBe(400);
  const crossOrigin = await page.request.post("/api/reasonai/dsa/chat", {
    headers: { origin: "https://untrusted.example" },
    data: request,
  });
  expect(crossOrigin.status()).toBe(403);
});

test("unauthenticated DSA requests return JSON 401 instead of a login redirect", async ({
  request,
}) => {
  const response = await request.post("/api/reasonai/dsa/chat", { data: {} });
  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain("application/json");
});

async function installControlledV2Stream(page: Page, retryMode = false) {
  await page.addInitScript(
    ({ retryMode }) => {
      const nativeFetch = window.fetch.bind(window);
      const encoder = new TextEncoder();
      let attempt = 0;
      const event = (
        seq: number,
        type: string,
        fields: Record<string, unknown> = {},
      ) =>
        `${JSON.stringify({ protocolVersion: 1, runId: `run-${attempt}`, seq, type, ...fields })}\n`;
      window.fetch = async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (!url.includes("/api/reasonai/dsa/chat"))
          return nativeFetch(input, init);
        attempt += 1;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const push = (value: string) =>
              controller.enqueue(encoder.encode(value));
            push(
              event(1, "run.started") +
                event(2, "text.delta", {
                  messageId: "message-1",
                  partId: "text-1",
                  delta: retryMode
                    ? "Partial answer remains"
                    : "First streamed ",
                }),
            );
            const finish = () => {
              if (retryMode && attempt === 1) return;
              push(
                event(3, "text.delta", {
                  messageId: "message-1",
                  partId: "text-1",
                  delta: "answer",
                }),
              );
              push(
                event(4, "text.final", {
                  messageId: "message-1",
                  partId: "text-1",
                  text: retryMode
                    ? "Retry completed."
                    : "Final authoritative answer.",
                }),
              );
              push(
                event(5, "sources.ready", {
                  messageId: "message-1",
                  partId: "sources-1",
                  sources: [],
                  retrievalStatus: "off",
                }),
              );
              push(event(6, "run.completed"));
              controller.close();
            };
            if (retryMode && attempt > 1) finish();
            else
              (
                window as typeof window & {
                  __finishReasonAIStream?: () => void;
                }
              ).__finishReasonAIStream = finish;
            init?.signal?.addEventListener(
              "abort",
              () => controller.error(init.signal?.reason),
              { once: true },
            );
          },
        });
        return new Response(body, {
          headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
        });
      };
    },
    { retryMode },
  );
}
