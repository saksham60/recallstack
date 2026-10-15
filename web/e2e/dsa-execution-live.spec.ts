import { expect, test } from "@playwright/test";
import { ContreeClient } from "contree-client";
import { createSandboxAdapter } from "../src/lib/dsa-execution/contree";
import { judge } from "../src/lib/dsa-execution/judge";
import type {
  EvaluationPlan,
  OperationResult,
  SandboxAdapter,
} from "../src/lib/dsa-execution/types";
import { hydrateTutorContext } from "../src/lib/dsa-execution/tutor-context";
import { parseDSATutorRequest } from "../src/features/dsa/reasonai/contract";
import { streamDSAGraph } from "../src/lib/reasonai/server/langgraph/dsa/graph";
import { defaultDSADurableConversationState } from "../src/lib/reasonai/server/langgraph/dsa/state";
import { parseVisualLesson } from "../src/features/dsa/reasonai/visual-contract";
import type { components } from "../src/lib/api/types";

test.describe("explicitly enabled fixed-program ConTree execution checks", () => {
  test.skip(
    process.env.DSA_LIVE_SANDBOX !== "1",
    "Opt in to disposable live sandbox operations.",
  );
  let adapter: SandboxAdapter;
  const owned = new Set<string>();
  test.beforeEach(async () => {
    const client = new ContreeClient(process.env.NEBIUS_API_KEY!, {
      project: process.env.CONTREE_PROJECT,
      baseUrl: process.env.CONTREE_URL,
    });
    const identity = await client.whoami();
    expect(identity.operationsStat!.running_instances).toBeLessThan(5);
    adapter = createSandboxAdapter();
  });
  test.afterEach(async () => {
    for (const id of owned) {
      try {
        await adapter.cancel(id);
      } catch {
        /* Already terminal. */
      }
    }
    owned.clear();
  });
  function plan(inputs: unknown[], expected: unknown[]): EvaluationPlan {
    return {
      certificateId: crypto.randomUUID(),
      suiteId: crypto.randomUUID(),
      problemId: crypto.randomUUID(),
      problemVersionId: crypto.randomUUID(),
      exposeCounts: false,
      contract: {
        entrypoint: "solve",
        inputMode: "single",
        checker: "exact_json",
      },
      cases: inputs.map((input, index) => ({
        id: crypto.randomUUID(),
        input,
        expected: expected[index],
        visibility: index ? "hidden" : "public",
      })),
    };
  }
  async function start(code: string, evaluation: EvaluationPlan) {
    const submissionId = crypto.randomUUID();
    const operationId = await adapter.start(
      submissionId,
      {
        problemId: evaluation.problemId,
        problemVersionId: evaluation.problemVersionId,
        mode: "submit",
        language: "python",
        idempotencyKey: crypto.randomUUID(),
        code,
      },
      evaluation,
    );
    owned.add(operationId);
    return { submissionId, operationId };
  }
  async function wait(id: string) {
    let result: OperationResult = { terminal: false };
    await expect
      .poll(
        async () => {
          result = await adapter.inspect(id);
          return result.terminal;
        },
        { timeout: 60000, intervals: [500, 1000, 2000] },
      )
      .toBeTruthy();
    owned.delete(id);
    return result;
  }
  test("real Python results are judged outside one VM, and recovery finds its unique hostname", async () => {
    const evaluation = plan([[1, 2, 3], [], [-8, 5]], [6, 0, -3]);
    const launchedAt = new Date(Date.now() - 1000).toISOString();
    const { operationId, submissionId } = await start(
      "def solve(nums):\n    print('private runtime log')\n    return sum(nums)",
      evaluation,
    );
    const operation = await wait(operationId);
    expect(operation.cases?.map((row) => row.actual)).toEqual([6, 0, -3]);
    expect(await adapter.find(submissionId, launchedAt)).toBe(operationId);
    const result = judge(evaluation, operation, "submit", 100);
    expect(result.verdict).toBe("accepted");
    expect(result).not.toHaveProperty("publicCases");
    expect(JSON.stringify(result)).not.toContain("private runtime log");
  });
  test("runtime errors, per-case timeouts, output caps, UID/resource and network isolation are real", async () => {
    const evaluation = plan(
      ["runtime", "timeout", "output", "security"],
      [
        null,
        null,
        null,
        {
          uid: 65534,
          secret: false,
          network: false,
          parentProtected: true,
          forkBlocked: true,
          memory: 268435456,
        },
      ],
    );
    const code = `def solve(action):
    import os, resource, signal, socket, time
    if action == 'runtime': raise ValueError('fixed runtime error')
    if action == 'timeout': time.sleep(10)
    if action == 'output':
        for _ in range(100): print('x' * 10000)
    if action == 'security':
        network = True
        try: socket.create_connection(('1.1.1.1', 443), timeout=0.5)
        except OSError: network = False
        protected = False
        try: os.kill(os.getppid(), signal.SIGKILL)
        except PermissionError: protected = True
        fork_blocked = False
        try: os.fork()
        except OSError: fork_blocked = True
        return {'uid': os.geteuid(), 'secret': 'NEBIUS_API_KEY' in os.environ, 'network': network, 'parentProtected': protected, 'forkBlocked': fork_blocked, 'memory': resource.getrlimit(resource.RLIMIT_AS)[1]}
`;
    const { operationId } = await start(code, evaluation);
    const operation = await wait(operationId);
    expect(operation.cases?.map((row) => row.status)).toEqual([
      "runtime_error",
      "time_limit_exceeded",
      "output_limit_exceeded",
      "ok",
    ]);
    expect(operation.cases?.at(-1)?.actual).toEqual(
      evaluation.cases.at(-1)?.expected,
    );
    expect(operation.cases?.[2].stdout?.length ?? 0).toBeLessThanOrEqual(4096);
  });
  test("explicit cancellation reaches a real terminal operation", async () => {
    const evaluation = plan([1], [1]);
    const { operationId } = await start(
      "def solve(value):\n    import time\n    time.sleep(20)\n    return value",
      evaluation,
    );
    await adapter.cancel(operationId);
    const result = await wait(operationId);
    expect(result.cancelled).toBeTruthy();
  });
});


test("opt-in real tutor streams canonical development context and validated educational visuals", async () => {
  test.skip(process.env.DSA_LIVE_TUTOR !== "1", "Opt in to fixed-context live model calls.");
  test.setTimeout(180000);
  const problem = {
    id: crypto.randomUUID(), problem_version_id: crypto.randomUUID(), title: "Array total (development fixture)", slug: "array-total", difficulty: "easy", availability: "available",
    description: "Return the sum of the integers in nums. Keep nums unchanged.", constraints: ["0 <= nums.length <= 100", "Every value is an integer between -100 and 100"], function_contract: { function: "solve", input: { nums: "integer array" }, output: "integer" }, examples: [{ input: { nums: [1, 2, 3] }, output: 6 }], categories: [], topics: [], supported_contract_languages: ["python"],
  } as components["schemas"]["ProblemDetail"];
  for (const action of ["explain", "hint", "visualize"] as const) {
    const input = await hydrateTutorContext(parseDSATutorRequest({ action, teachingMode: action === "explain" ? "direct" : "socratic", message: action === "explain" ? "Explain only the goal and input/output of this development exercise in two sentences." : action === "hint" ? "Give me one hint about my accumulator." : "Visualize my accumulator over nums=[1,2,3] as three short educational snapshots. This is a teaching example, not an execution trace.", searchWeb: false, hintLevel: 1, history: [], context: { contentId: problem.id, problemVersionId: problem.problem_version_id, title: problem.title, slug: problem.slug, userCode: "def solve(nums):\n    total = 0\n    for num in nums:\n        total += num\n    return total", userApproach: "Accumulate the processed prefix.", userNotes: "", language: "python" } }), "development-fixture", { problem: async () => problem, execution: async () => undefined });
    const started = Date.now(); let firstTextMs: number | undefined; let answer = ""; let visual;
    for await (const event of streamDSAGraph(input, { durableState: defaultDSADurableConversationState(), signal: AbortSignal.timeout(65000), onStage: (stage, tool, meta) => { if (tool) console.info("DSA_LIVE_TOOL", { stage, tool, meta }); } })) {
      if (event.type === "text.delta") firstTextMs ??= Date.now() - started;
      if (event.type === "result") { answer = event.result.text; visual = event.result.visual; }
    }
    expect(answer.trim().length).toBeGreaterThan(10);
    expect(answer).not.toMatch(/<think>|reasoning_content/);
    if (action === "visualize") { if (!visual) console.info("DSA_LIVE_VISUAL_UNAVAILABLE", answer.slice(0, 1000)); expect(parseVisualLesson(visual).steps.length).toBeGreaterThan(1); }
    console.info("DSA_LIVE_TUTOR", { action, firstTextMs, durationMs: Date.now() - started, visual: !!visual });
  }
});
