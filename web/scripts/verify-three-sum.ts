import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { createCertificationRuntime } from "./dsa-certification/browser";
import {
  pythonContractSchema,
  typedStarter,
} from "../src/lib/dsa-execution/python-contract";
import { equal } from "../src/lib/dsa-execution/public-comparator";
import { HARNESS_SHA256 } from "../src/lib/dsa-execution/python/harness.generated";
import { fixtureContentSha } from "./dsa-certification/evidence";

async function main() {
  const { values } = parseArgs({
    options: { input: { type: "string" }, output: { type: "string" } },
    strict: true,
  });
  if (!values.input)
    throw new Error("An actual private read-only export is required");
  const data = JSON.parse(await readFile(path.resolve(values.input), "utf8"));
  if (
    data.problem.id !== "62b831b6-4c58-438e-9442-a78be83e3469" ||
    data.problem.suite_id !== "c34f14dd-3de2-4199-bf8f-67d0db67f9fb"
  )
    throw new Error("Canonical version/suite mismatch");
  const contract = pythonContractSchema.parse({
    entrypoint: "three_sum",
    inputMode: "kwargs",
    checker: "exact_json",
    adapter: {
      id: "reasonai-python",
      version: 1,
      invocation: "function",
      parameters: [{ name: "values", pythonType: "List[int]", codec: "json" }],
      returnType: "List[List[int]]",
      result: { source: "return", codec: "json" },
    },
  });
  const imported = data.problem.provenance.reference_solution_python;
  if (typeof imported !== "string" || imported.length > 24000)
    throw new Error("Invalid imported reference");
  const baseline =
    imported +
    "\n\ndef three_sum(values):\n    return solve({'values': values})\n";
  // Independently implemented multiplicity oracle, rather than another two-pointer copy.
  const oracle = `from collections import Counter
from itertools import combinations_with_replacement
def three_sum(values):
    counts = Counter(values)
    answers = []
    keys = sorted(counts)
    if not keys or keys[0] > 0 or keys[-1] < 0:
        return []
    for triple in combinations_with_replacement(keys, 3):
        if sum(triple) == 0:
            needed = Counter(triple)
            if all(counts[value] >= count for value, count in needed.items()):
                answers.append(list(triple))
    return answers
`;
  const candidate = baseline.replace(
    "return solve({'values': values})",
    "return solve({'values': [value for value in values if -2 <= value <= 2]})",
  );
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const output = path.resolve(
    values.output ?? "../artifacts/dsa-v3-three-sum-local.json",
  );
  await mkdir(path.dirname(output), { recursive: true });
  const evidence = {
    schemaVersion: 1,
    kind: "actual-imported-suite-local-audit",
    problemId: "6bf047e9-6735-4892-b063-f59e4c8ce29f",
    problemVersionId: data.problem.id,
    suiteId: data.problem.suite_id,
    harnessSha256: HARNESS_SHA256,
    fixtureSnapshotSha256: hash(JSON.stringify(data.cases)),
    fixtureContentSha256: fixtureContentSha(
      data.cases.map(
        (row: {
          id: string;
          visibility: string;
          input_json: unknown;
          expected_json: unknown;
        }) => ({
          id: row.id,
          visibility: row.visibility,
          input: row.input_json,
          expected: row.expected_json,
        }),
      ),
    ),
    executionSourceSha256: hash(baseline),
    importedReferenceSha256: hash(imported),
    independentOracleSha256: hash(oracle),
    candidateSha256: hash(candidate),
    contract,
    sourceReview: {
      provider: "leetcode",
      url: "https://leetcode.com/problems/3sum/description/",
      sourceExact: false,
      requiredOwnerDecision:
        "Current ReasonAI version requires lexicographic output and permits short arrays; the linked source permits any order and constrains length >= 3. Approve this clearly attributed authored variant or publish a corrected version. Do not rewrite existing IDs or silently change checker semantics.",
    },
    typedStarterExecuted: false,
    fixtureResults: [] as Array<{
      id: string;
      visibility: string;
      importedReferenceStatus: string;
      independentOracleStatus: string;
      bothMatchExpected: boolean;
    }>,
    publicPassHiddenFail: {
      publicCases: 0,
      publicPassed: 0,
      hiddenFailureFixtureId: null as string | null,
      candidateExecuted: false,
    },
    additionalStress: [] as Array<{
      label: string;
      length: number;
      bothPass: boolean;
    }>,
    sandboxSmokePassed: false,
    productionMutations: 0,
    paidVerificationCalls: 0,
    certificationStatus:
      "blocked-awaiting-owner-review-and-real-provider-proof",
    completedAt: null as string | null,
  };
  const runtime = await createCertificationRuntime();
  try {
    const starter = await runtime.execute(
      typedStarter(contract)!,
      contract,
      data.cases[0].input_json,
    );
    evidence.typedStarterExecuted = starter.status === "ok";
    for (const fixture of data.cases) {
      const [a, b] = await Promise.all([
        runtime.execute(baseline, contract, fixture.input_json),
        runtime.execute(oracle, contract, fixture.input_json),
      ]);
      evidence.fixtureResults.push({
        id: fixture.id,
        visibility: fixture.visibility,
        importedReferenceStatus: a.status,
        independentOracleStatus: b.status,
        bothMatchExpected:
          a.status === "ok" &&
          b.status === "ok" &&
          equal(
            a.actual,
            fixture.expected_json,
            contract,
            fixture.input_json,
          ) &&
          equal(b.actual, fixture.expected_json, contract, fixture.input_json),
      });
      if (evidence.fixtureResults.length % 6 === 0) {
        console.log(
          `Local oracle audit: ${evidence.fixtureResults.length}/${data.cases.length} cases processed`,
        );
        await writeFile(output, JSON.stringify(evidence, null, 2) + "\n");
      }
    }
    for (const fixture of data.cases.filter(
      (row: { visibility: string }) => row.visibility === "public",
    )) {
      const result = await runtime.execute(
        candidate,
        contract,
        fixture.input_json,
      );
      evidence.publicPassHiddenFail.publicCases++;
      if (
        result.status === "ok" &&
        equal(
          result.actual,
          fixture.expected_json,
          contract,
          fixture.input_json,
        )
      )
        evidence.publicPassHiddenFail.publicPassed++;
    }
    for (const fixture of data.cases.filter(
      (row: { visibility: string }) => row.visibility === "hidden",
    )) {
      const result = await runtime.execute(
        candidate,
        contract,
        fixture.input_json,
      );
      if (
        result.status !== "ok" ||
        !equal(
          result.actual,
          fixture.expected_json,
          contract,
          fixture.input_json,
        )
      ) {
        evidence.publicPassHiddenFail.hiddenFailureFixtureId = fixture.id;
        break;
      }
    }
    evidence.publicPassHiddenFail.candidateExecuted = true;
    for (const [label, values, expected] of [
      [
        "3000 positive values",
        Array.from({ length: 3000 }, (_, i) => i + 1),
        [],
      ],
      ["3000 zeros", Array(3000).fill(0), [[0, 0, 0]]],
    ] as const) {
      const input = { values };
      const [a, b] = await Promise.all([
        runtime.execute(baseline, contract, input),
        runtime.execute(oracle, contract, input),
      ]);
      evidence.additionalStress.push({
        label,
        length: values.length,
        bothPass:
          a.status === "ok" &&
          b.status === "ok" &&
          equal(a.actual, expected, contract, input) &&
          equal(b.actual, expected, contract, input),
      });
    }
    evidence.completedAt = new Date().toISOString();
    await writeFile(output, JSON.stringify(evidence, null, 2) + "\n");
    const passed = evidence.fixtureResults.filter(
      (row) => row.bothMatchExpected,
    ).length;
    console.log(
      JSON.stringify({
        actualImportedFixtures: data.cases.length,
        oracleAgreementPassed: passed,
        publicPass: evidence.publicPassHiddenFail.publicPassed,
        publicTotal: evidence.publicPassHiddenFail.publicCases,
        hiddenFailureObserved:
          !!evidence.publicPassHiddenFail.hiddenFailureFixtureId,
        stressPassed: evidence.additionalStress.filter((row) => row.bothPass)
          .length,
        paidCalls: 0,
        productionMutations: 0,
      }),
    );
    if (
      passed !== data.cases.length ||
      !evidence.typedStarterExecuted ||
      !evidence.publicPassHiddenFail.hiddenFailureFixtureId ||
      evidence.publicPassHiddenFail.publicPassed !==
        evidence.publicPassHiddenFail.publicCases ||
      evidence.additionalStress.some((row) => !row.bothPass)
    )
      process.exitCode = 1;
  } finally {
    await runtime.close();
  }
}
main().catch(() => {
  console.error(
    "3Sum local audit failed; private fixture/source data is intentionally omitted from diagnostics.",
  );
  process.exitCode = 1;
});
