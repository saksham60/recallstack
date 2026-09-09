import { expect, test } from "@playwright/test";
import { reasonAIProvider, ReasonAIProviderError } from "../src/features/system-design/reasonai/provider";
import { REASONAI_INVALID_PROPOSAL, type ReasonAIProposal, type ReasonAIRequest } from "../src/features/system-design/reasonai/contract";
import { normalizeReasonAIVisibleText } from "../src/features/system-design/reasonai/visible-text";

const KEY = "private-test-provider-credential";
const request: ReasonAIRequest = { mode: "chat", message: "Explain this architecture.", history: [], context: {
  title: "URL Shortener", requirements: [], scaleAssumptions: [], selectedNodeIds: [], selectedEdgeIds: [],
  nodes: [{ id: "node_redirect", type: "service", label: "Redirect Service", x: 10, y: 10 }, { id: "node_sql", type: "sql_database", label: "SQL Database", x: 300, y: 10 }],
  edges: [{ id: "edge_read", type: "database_read", sourceNodeId: "node_redirect", targetNodeId: "node_sql" }],
} };
const proposal: ReasonAIProposal = { summary: "**Cache**: reduce reads from node_sql.", operations: [
  { op: "add_node", ref: "new:redis", type: "cache", label: "Redis Cache", x: 500, y: 200 },
  { op: "add_edge", type: "database_read", sourceNodeId: "node_redirect", targetNodeId: "new:redis" },
  { op: "update_node", nodeId: "node_redirect", description: "Look up cached URLs first." },
] };
const tool = (args = JSON.stringify(proposal), name = "propose_canvas_changes") => ({ type: "function", function: { name, arguments: args } });
const completion = (content: unknown = "Observed\n• Redirect Service reads SQL Database.", calls?: unknown, finishReason: unknown = "stop") => ({ choices: [{ message: { content, tool_calls: calls, reasoning_content: "NEVER_SHOW_REASONING" }, finish_reason: finishReason }] });
const originalFetch = globalThis.fetch, originalWarn = console.warn, originalTimeout = globalThis.setTimeout;
const originalEnv = { NEBIUS_API_KEY: process.env.NEBIUS_API_KEY, REASONAI_BASE_URL: process.env.REASONAI_BASE_URL, REASONAI_MODEL: process.env.REASONAI_MODEL };
let diagnostics: unknown[][];
let sentBody: Record<string, unknown>;
test.beforeEach(() => {
  process.env.NEBIUS_API_KEY = KEY;
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  process.env.REASONAI_MODEL = "mock-model";
  diagnostics = [];
  console.warn = (...values: unknown[]) => { diagnostics.push(values); };
  mock(completion());
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  globalThis.setTimeout = originalTimeout;
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
function mock(body: unknown, status = 200) {
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(init!.body as string);
    return Response.json(body, { status });
  };
}
async function fails(category: string, message?: string) {
  await expect(reasonAIProvider.complete(request)).rejects.toMatchObject({ message: message ?? expect.any(String), status: 502 });
  expect(JSON.stringify(diagnostics)).toContain(`[ReasonAI] ${category}`);
  expect(JSON.stringify(diagnostics)).not.toContain(KEY);
  expect(JSON.stringify(diagnostics)).not.toContain("NEVER_SHOW_REASONING");
}

test("normal text, exact request tool fields, concise prompt and no reasoning traces", async () => {
  const result = await reasonAIProvider.complete(request);
  expect(result).toEqual({ text: "Observed\n• Redirect Service reads SQL Database." });
  expect(JSON.stringify(result)).not.toMatch(/NEVER_SHOW_REASONING|private-test-provider/);
  const body = JSON.stringify(sentBody);
  expect(body).toContain("sourceNodeId");
  expect(body).toContain("targetNodeId");
  expect(body).toContain("350 words");
  expect(body).toContain("at most 5");
  expect(body).toContain("architectural inference");
});
for (const content of ["Propose a cache.", null]) {
  test(`normal tool call with ${content === null ? "null" : "string"} content preserves exact tool data`, async () => {
    mock(completion(content, [tool()], "tool_calls"));
    const result = await reasonAIProvider.complete(request);
    expect(result.proposal).toEqual(proposal);
    expect(result.text).not.toMatch(/\*\*|node_sql/);
    expect(result.proposal!.operations[2]).toMatchObject({ nodeId: "node_redirect" });
  });
}
test("selects a usable choice despite harmless extra choices and metadata", async () => {
  const good = completion().choices[0];
  mock({ choices: [null, { message: "not a message" }, completion("").choices[0], good, { message: { content: "Secondary" }, finish_reason: "stop" }], usage: {}, model: "metadata" });
  expect((await reasonAIProvider.complete(request)).text).toContain("Redirect Service");
});
for (const choices of [undefined, null, [], {}, [null, { message: "invalid" }]]) {
  test(`rejects malformed choices: ${JSON.stringify(choices)}`, async () => { mock({ choices }); await fails("INVALID_CHOICES"); });
}
test("malformed tool JSON is diagnosed without logging its contents", async () => {
  mock(completion("Usable prose must not salvage an invalid proposal.", [tool('{"summary":"PRIVATE_USER_TEXT",')], "tool_calls"));
  await fails("TOOL_ARGUMENT_JSON_INVALID", REASONAI_INVALID_PROPOSAL);
  expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE_USER_TEXT");
});
test("unsupported tool never runs", async () => { mock(completion(null, [tool("{}", "execute_code")], "tool_calls")); await fails("INVALID_TOOL_CALL", REASONAI_INVALID_PROPOSAL); });
test("multiple tools are rejected", async () => { mock(completion(null, [tool(), tool()], "tool_calls")); await fails("INVALID_TOOL_CALL"); });
test("invalid proposal rejects the entire response with a safe validation reason", async () => {
  mock(completion("A valid prefix is insufficient.", [tool(JSON.stringify({ ...proposal, operations: [...proposal.operations, { op: "delete_node", nodeId: "missing-secret-node" }] }))], "tool_calls"));
  await fails("PROPOSAL_VALIDATION_FAILED", REASONAI_INVALID_PROPOSAL);
  expect(JSON.stringify(diagnostics)).toContain("missing existing node");
  expect(JSON.stringify(diagnostics)).not.toContain("missing-secret-node");
});
test("empty text is rejected", async () => { mock(completion(" \n ")); await fails("EMPTY_RESPONSE"); });
test("unsupported content is rejected", async () => { mock(completion([{ text: "not supported" }])); await fails("INVALID_CONTENT"); });
for (const reason of [undefined, "content_filter", "provider-secret-value"]) {
  test(`rejects unsupported finish reason ${String(reason)}`, async () => {
    const body = completion();
    body.choices[0].finish_reason = reason;
    mock(body);
    await fails("FINISH_REASON_REJECTED");
    expect(JSON.stringify(diagnostics)).not.toContain("provider-secret-value");
  });
}
test("length returns bounded usable text and a visible truncation notice", async () => {
  mock(completion("Useful observation. ".repeat(1000), undefined, "length"));
  const result = await reasonAIProvider.complete(request);
  expect(result.text.length).toBeLessThanOrEqual(16_000);
  expect(result.text).toContain("cut short");
  expect(result.proposal).toBeUndefined();
  expect(JSON.stringify(diagnostics)).toContain("RESPONSE_TRUNCATED");
});
test("length accepts a complete validated proposal", async () => { mock(completion(null, [tool()], "length")); expect((await reasonAIProvider.complete(request)).proposal).toEqual(proposal); });
test("length never salvages incomplete tool arguments", async () => { mock(completion("Some text", [tool('{"summary":')], "length")); await fails("TOOL_ARGUMENT_JSON_INVALID", "ReasonAI could not complete that response. Please try again."); });
test("length with only reasoning is unusable", async () => { mock(completion(null, undefined, "length")); await fails("EMPTY_RESPONSE"); });
for (const mode of ["review", "eagle"] as const) {
  test(`${mode} remains textual`, async () => {
    await reasonAIProvider.complete({ ...request, mode });
    expect(sentBody.tool_choice).toBe("none");
    mock(completion(null, [tool()], "tool_calls"));
    await expect(reasonAIProvider.complete({ ...request, mode })).rejects.toThrow(REASONAI_INVALID_PROPOSAL);
  });
}
for (const status of [401, 403, 429, 503]) {
  test(`provider HTTP ${status} is safe and diagnosed`, async () => {
    mock({ error: `Sensitive upstream ${KEY}` }, status);
    await expect(reasonAIProvider.complete(request)).rejects.toMatchObject({ status: status === 429 ? 429 : status === 503 ? 502 : 503 });
    expect(JSON.stringify(diagnostics)).toContain(`"status":${status}`);
    expect(JSON.stringify(diagnostics)).not.toContain(KEY);
  });
}
test("timeout aborts fetch and returns a safe 504", async () => {
  globalThis.setTimeout = ((callback: () => void, delay: number) => originalTimeout(callback, delay === 60_000 ? 0 : delay)) as typeof setTimeout;
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(new Error(`Unsafe transport detail ${KEY}`)), { once: true });
  });
  await expect(reasonAIProvider.complete(request)).rejects.toMatchObject({ status: 504, message: "ReasonAI timed out. Please try again." });
  expect(diagnostics).toEqual([["[ReasonAI] TIMEOUT", {}]]);
});
test("network failure does not surface its error message", async () => {
  globalThis.fetch = async () => { throw new Error(KEY); };
  await expect(reasonAIProvider.complete(request)).rejects.toMatchObject({ message: "ReasonAI is temporarily unavailable. Please try again." });
  expect(diagnostics).toEqual([["[ReasonAI] PROVIDER_UNAVAILABLE", {}]]);
});
for (const location of ["content", "arguments", "encoded arguments", "finish reason"]) {
  test(`secret in ${location} is never surfaced`, async () => {
    const body = location === "content" ? completion(KEY)
      : location === "finish reason" ? completion("", undefined, KEY)
      : completion(null, [tool(JSON.stringify({ ...proposal, summary: KEY }).replaceAll(KEY, location === "encoded arguments" ? KEY.split("").map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).join("") : KEY))], "tool_calls");
    mock(body);
    let caught: unknown;
    try { await reasonAIProvider.complete(request); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ReasonAIProviderError);
    expect((caught as Error).message + JSON.stringify(diagnostics)).not.toContain(KEY);
  });
}
test("oversized and invalid JSON bodies have safe distinct diagnostics", async () => {
  globalThis.fetch = async () => new Response("x".repeat(128 * 1024 + 1));
  await fails("RESPONSE_TOO_LARGE");
  globalThis.fetch = async () => new Response(`invalid JSON ${KEY}`);
  await fails("INVALID_RESPONSE_JSON");
});
test("small visible cleanup preserves meaning and tool JSON", () => {
  const original = JSON.stringify(proposal);
  const cleaned = normalizeReasonAIVisibleText("```markdown\n### **Observed**&#x20;\n\n| Component | Role |\n| --- | --- |\n| node_redirect | Read URLs |\n\n\\**Assumed\\**\n- Cache resilience is unspecified.\n\nFlow: node_redirect → node_sql\n```", request.context, proposal);
  expect(cleaned).toContain("Component: Redirect Service; Role: Read URLs");
  expect(cleaned).toContain("• Cache resilience is unspecified.");
  expect(cleaned).toContain("Flow: Redirect Service → SQL Database");
  expect(cleaned).not.toMatch(/\| Component|\*\*|###|&#x20;|```|node_redirect|node_sql/);
  expect(normalizeReasonAIVisibleText(cleaned, request.context, proposal)).toBe(cleaned);
  expect(JSON.stringify(proposal)).toBe(original);
  expect(normalizeReasonAIVisibleText("&lt;script&gt;unsafe()&lt;/script&gt;<b>Observed</b>", request.context)).toBe("Observed");
});
