import { expect, test } from "@playwright/test";
import { reasonAIProvider } from "../src/features/system-design/reasonai/provider";
import { REASONAI_INVALID_PROPOSAL, type ReasonAIRequest } from "../src/features/system-design/reasonai/contract";

const KEY = "private-test-provider-credential";
const request: ReasonAIRequest = {
  mode: "chat",
  message: "Propose improvements to this architecture.",
  history: [],
  context: {
    title: "URL Shortener",
    requirements: [],
    scaleAssumptions: [],
    selectedNodeIds: [],
    selectedEdgeIds: [],
    nodes: [
      { id: "node_redirect", type: "service", label: "Redirect Service", subtitle: "", technology: "", description: "", x: 10, y: 10 },
      { id: "node_sql", type: "sql_database", label: "SQL Database", subtitle: "", technology: "", description: "", x: 300, y: 10 },
    ],
    edges: [
      { id: "edge_read", type: "database_read", sourceNodeId: "node_redirect", targetNodeId: "node_sql", label: "", protocol: "" },
    ],
  },
};

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalEnv = {
  NEBIUS_API_KEY: process.env.NEBIUS_API_KEY,
  REASONAI_BASE_URL: process.env.REASONAI_BASE_URL,
  REASONAI_MODEL: process.env.REASONAI_MODEL,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
};

let diagnostics: unknown[][];

function completion(args: string) {
  return {
    choices: [{
      message: {
        content: null,
        tool_calls: [{ type: "function", function: { name: "propose_canvas_changes", arguments: args } }],
      },
      finish_reason: "tool_calls",
    }],
  };
}

function mock(body: unknown) {
  globalThis.fetch = async () => Response.json(body);
}

test.beforeEach(() => {
  process.env.NEBIUS_API_KEY = KEY;
  process.env.REASONAI_BASE_URL = "https://provider.test/v1";
  process.env.REASONAI_MODEL = "mock-model";
  process.env.TAVILY_API_KEY = "tvly-private-test-credential";
  diagnostics = [];
  console.warn = (...values: unknown[]) => { diagnostics.push(values); };
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("provider diagnostics distinguish a wrong top-level proposal contract", async () => {
  mock(completion(JSON.stringify({
    title: "URL Shortener",
    requirements: [],
    scaleAssumptions: [],
    nodes: [],
    edges: [],
  })));

  await expect(reasonAIProvider.complete(request)).rejects.toMatchObject({ message: REASONAI_INVALID_PROPOSAL });

  const text = JSON.stringify(diagnostics);
  expect(text).toContain("[ReasonAI] PROPOSAL_VALIDATION_FAILED");
  expect(text).toContain("proposal_validation");
  expect(text).toContain("configured-provider");
  expect(text).toContain("mock-model");
  expect(text).toContain("topLevelKeys");
  expect(text).toContain("nodes");
  expect(text).toContain("edges");
  expect(text).not.toContain(KEY);
});

test("provider diagnostics distinguish malformed proposal tool JSON", async () => {
  mock(completion('{"summary":"private payload",'));

  await expect(reasonAIProvider.complete(request)).rejects.toMatchObject({ message: REASONAI_INVALID_PROPOSAL });

  const text = JSON.stringify(diagnostics);
  expect(text).toContain("[ReasonAI] TOOL_ARGUMENT_JSON_INVALID");
  expect(text).toContain("tool_argument_json");
  expect(text).toContain("configured-provider");
  expect(text).toContain("mock-model");
  expect(text).not.toContain("private payload");
  expect(text).not.toContain(KEY);
});

test("valid proposal behavior is unchanged", async () => {
  mock(completion(JSON.stringify({
    summary: "Add a cache.",
    operations: [{ op: "add_node", ref: "new:redis", type: "cache", label: "Redis", x: 500, y: 200 }],
  })));

  const result = await reasonAIProvider.complete(request);
  expect(result.proposal?.summary).toBe("Add a cache.");
  expect(result.proposal?.operations).toHaveLength(1);
  expect(diagnostics).toEqual([]);
});
