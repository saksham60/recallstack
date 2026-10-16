import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  reviewedProblemSchema,
  reviewChecks,
  type Identity,
} from "../scripts/dsa-certification/core";
import {
  attachThreeSumEvidence,
  fixtureContentSha,
} from "../scripts/dsa-certification/evidence";
import { initialRow } from "../scripts/dsa-certification/core";
import { HARNESS_SHA256 } from "../src/lib/dsa-execution/python/harness.generated";
const id = () => crypto.randomUUID();
function fixture() {
  const identity: Identity = {
    problemId: id(),
    problemVersionId: id(),
    suiteId: id(),
    slug: "test-array-total",
    suiteStatus: "needs_review",
    checkerType: "exact",
    existingPublicCertificate: false,
    existingHiddenCertificate: false,
    blockers: [],
  };
  const review = {
    by: id(),
    at: new Date().toISOString(),
    evidence: "AUTOMATED TEST FIXTURE ONLY; not a real content approval",
  };
  const problem = reviewedProblemSchema.parse({
    problemId: identity.problemId,
    problemVersionId: identity.problemVersionId,
    suiteId: identity.suiteId,
    statement: {
      published: true,
      sourceUrl: "https://example.invalid/test-only",
      sourceSha256: "a".repeat(64),
      review,
    },
    contract: {
      entrypoint: "array_total",
      inputMode: "kwargs",
      checker: "exact_json",
      adapter: {
        id: "reasonai-python",
        version: 1,
        invocation: "function",
        parameters: [{ name: "nums", pythonType: "List[int]", codec: "json" }],
        returnType: "int",
        result: { source: "return", codec: "json" },
      },
    },
    contractReview: review,
    references: [
      {
        name: "sum builtin",
        source: "def array_total(nums):\n    return sum(nums)",
        sourceUrl: "https://example.invalid/test-only-a",
        review,
      },
      {
        name: "explicit loop",
        source:
          "def array_total(nums):\n    answer = 0\n    for value in nums:\n        answer += value\n    return answer",
        sourceUrl: "https://example.invalid/test-only-b",
        review,
      },
    ],
    fixtures: [
      {
        id: id(),
        visibility: "public",
        input: { nums: [] },
        expected: 0,
        category: "boundary",
        review,
      },
      {
        id: id(),
        visibility: "hidden",
        input: { nums: Array.from({ length: 100 }, (_, i) => i) },
        expected: 4950,
        category: "stress",
        review,
      },
    ],
    checkerReview: {
      review,
      cases: [
        { input: { nums: [] }, expected: 0, actual: 0, accept: true },
        { input: { nums: [] }, expected: 0, actual: -1, accept: false },
      ],
    },
  });
  return { identity, problem };
}
test("certification rejects public/hidden overlap, duplicate fixtures and checker mistakes", () => {
  const { identity, problem } = fixture();
  expect(reviewChecks(identity, problem).blockers).toEqual([]);
  const overlap = structuredClone(problem);
  overlap.fixtures[1].input = overlap.fixtures[0].input;
  expect(reviewChecks(identity, overlap).blockers).toContain(
    "public-hidden-input-overlap",
  );
  const duplicate = structuredClone(problem);
  duplicate.fixtures[1].id = duplicate.fixtures[0].id;
  expect(reviewChecks(identity, duplicate).blockers).toContain(
    "duplicate-fixture-identities",
  );
  const wrong = structuredClone(problem);
  wrong.checkerReview.cases[1].accept = true;
  expect(reviewChecks(identity, wrong).checkerVerified).toBe(false);
  expect(
    reviewChecks({ ...identity, problemVersionId: id() }, problem).blockers,
  ).toContain("immutable-version-or-suite-mismatch");
});

test("saved evidence requires exact fixtures, source, harness and complete case coverage", () => {
  const { identity, problem } = fixture(),
    fixtures = problem.fixtures.map(({ id, visibility, input, expected }) => ({
      id,
      visibility,
      input,
      expected,
    }));
  const local = {
    problemId: identity.problemId,
    problemVersionId: identity.problemVersionId,
    suiteId: identity.suiteId,
    harnessSha256: HARNESS_SHA256,
    fixtureContentSha256: fixtureContentSha(fixtures),
    executionSourceSha256: "a".repeat(64),
    completedAt: new Date().toISOString(),
    typedStarterExecuted: true,
    fixtureResults: fixtures.map(({ id, visibility }) => ({
      id,
      visibility,
      importedReferenceStatus: "ok",
      independentOracleStatus: "ok",
      bothMatchExpected: true,
    })),
    publicPassHiddenFail: {
      publicCases: 1,
      publicPassed: 1,
      hiddenFailureFixtureId: fixtures[1].id,
      candidateExecuted: true,
    },
  };
  const live = {
    ...local,
    codeSha256: local.executionSourceSha256,
    passed: true,
    componentVerdict: "accepted",
    actualCaseCount: 2,
    operationId: id(),
    persistedSubmission: false,
    releaseE2EProven: false,
  };
  const valid = attachThreeSumEvidence(
    initialRow(identity),
    fixtures,
    local,
    live,
  );
  expect(valid.referenceOracleVerified).toBe(true);
  expect(valid.sandboxSmokePassed).toBe(true);
  expect(valid.certificationStatus).not.toBe("certified");
  expect(
    attachThreeSumEvidence(
      initialRow(identity),
      fixtures,
      { ...local, fixtureContentSha256: "0".repeat(64) },
      live,
    ).referenceOracleVerified,
  ).toBe(false);
  expect(
    attachThreeSumEvidence(initialRow(identity), fixtures, local, {
      ...live,
      codeSha256: "0".repeat(64),
    }).sandboxSmokePassed,
  ).toBe(false);
  expect(
    attachThreeSumEvidence(
      initialRow(identity),
      fixtures,
      {
        ...local,
        fixtureResults: [local.fixtureResults[0], local.fixtureResults[0]],
      },
      live,
    ).referenceOracleVerified,
  ).toBe(false);
});
function command(args: string[]) {
  return new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "node_modules/tsx/dist/cli.mjs",
          "scripts/certify-catalog.ts",
          ...args,
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, LANGSMITH_TRACING: "false" },
        },
      );
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      child.once("error", reject);
      child.once("exit", (code) => resolve({ code, output }));
    },
  );
}
test("actual certification CLI executes Python, checkpoints, resumes the next batch and never claims sandbox success", async () => {
  test.setTimeout(120000);
  const a = fixture(),
    b = fixture();
  b.identity.slug = "test-second-array-total";
  const folder = path.resolve(".next/cache", `dsa-certification-test-${id()}`);
  await mkdir(folder, { recursive: true });
  const inventory = path.join(folder, "inventory.json"),
    bundle = path.join(folder, "private-reviewed.json"),
    manifest = path.join(folder, "manifest.json");
  await writeFile(
    inventory,
    JSON.stringify({ items: [a.identity, b.identity] }),
  );
  await writeFile(
    bundle,
    JSON.stringify({ schemaVersion: 1, items: [a.problem, b.problem] }),
  );
  const args = [
    "--inventory",
    inventory,
    "--reviewed-bundle",
    bundle,
    "--batch-size",
    "1",
    "--output",
    manifest,
  ];
  const first = await command(args);
  expect(first.code, first.output).toBe(0);
  const one = JSON.parse(await readFile(manifest, "utf8"));
  expect(one.summary.locallyValidated).toBe(1);
  const second = await command([...args, "--resume", manifest]);
  expect(second.code, second.output).toBe(0);
  const two = JSON.parse(await readFile(manifest, "utf8"));
  expect(two.summary.locallyValidated).toBe(2);
  expect(two.summary.certified).toBe(0);
  expect(
    two.items.every(
      (row: { sandboxSmokePassed: boolean }) => !row.sandboxSmokePassed,
    ),
  ).toBe(true);
  expect(JSON.stringify(two)).not.toContain("def array_total");
  expect(JSON.stringify(two)).not.toContain('"expected"');
  const strict = await command([...args, "--resume", manifest, "--strict"]);
  expect(strict.code).toBe(1);
  const dry = await command([...args, "--audit", "--dry-run"]);
  expect(dry.code).toBe(0);
  const audit = JSON.parse(await readFile(manifest, "utf8"));
  expect(audit.summary.locallyValidated).toBe(0);
  expect(audit.paidVerificationCalls).toBe(0);
});
