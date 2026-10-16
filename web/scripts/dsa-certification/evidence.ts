import { createHash } from "node:crypto";
import { z } from "zod";
import { HARNESS_SHA256 } from "../../src/lib/dsa-execution/python/harness.generated";
import type { CertificationRow } from "./core";
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, value]) => [key, canonical(value)]),
        )
      : value;
export function fixtureContentSha(
  fixtures: Array<{
    id: string;
    visibility: string;
    input: unknown;
    expected: unknown;
  }>,
) {
  const ordered = [...fixtures]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ id, visibility, input, expected }) => ({
      id,
      visibility,
      input,
      expected,
    }));
  return createHash("sha256")
    .update(JSON.stringify(canonical(ordered)))
    .digest("hex");
}
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const localSchema = z.object({
  problemId: z.uuid(),
  problemVersionId: z.uuid(),
  suiteId: z.uuid(),
  harnessSha256: digest,
  fixtureContentSha256: digest,
  executionSourceSha256: digest,
  completedAt: z.string(),
  typedStarterExecuted: z.boolean(),
  fixtureResults: z
    .array(
      z.object({
        id: z.uuid(),
        visibility: z.enum(["public", "hidden"]),
        importedReferenceStatus: z.string(),
        independentOracleStatus: z.string(),
        bothMatchExpected: z.boolean(),
      }),
    )
    .max(100),
  publicPassHiddenFail: z.object({
    publicCases: z.number(),
    publicPassed: z.number(),
    hiddenFailureFixtureId: z.uuid(),
    candidateExecuted: z.boolean(),
  }),
});
const providerSchema = z.object({
  problemId: z.uuid(),
  problemVersionId: z.uuid(),
  suiteId: z.uuid(),
  harnessSha256: digest,
  codeSha256: digest,
  fixtureContentSha256: digest,
  passed: z.literal(true),
  componentVerdict: z.literal("accepted"),
  actualCaseCount: z.number().int(),
  operationId: z.uuid(),
  persistedSubmission: z.literal(false),
  releaseE2EProven: z.literal(false),
});
/** Reuse exact saved evidence only; it never grants publication or certification. */
export function attachThreeSumEvidence(
  row: CertificationRow,
  fixtures: Array<{
    id: string;
    visibility: string;
    input: unknown;
    expected: unknown;
  }>,
  localRaw: unknown,
  providerRaw: unknown,
) {
  const local = localSchema.safeParse(localRaw),
    provider = providerSchema.safeParse(providerRaw);
  if (!local.success) return row;
  const proof = local.data;
  if (
    proof.problemId !== row.problemId ||
    proof.problemVersionId !== row.problemVersionId ||
    proof.suiteId !== row.suiteId ||
    proof.harnessSha256 !== HARNESS_SHA256 ||
    proof.fixtureContentSha256 !== fixtureContentSha(fixtures) ||
    proof.fixtureResults.length !== fixtures.length ||
    new Set(proof.fixtureResults.map((row) => row.id)).size !==
      fixtures.length ||
    !proof.fixtureResults.every(
      (result) =>
        result.bothMatchExpected &&
        result.importedReferenceStatus === "ok" &&
        result.independentOracleStatus === "ok" &&
        fixtures.some(
          (fixture) =>
            fixture.id === result.id &&
            fixture.visibility === result.visibility,
        ),
    )
  )
    return row;
  const negative = proof.publicPassHiddenFail;
  if (
    !negative.candidateExecuted ||
    negative.publicCases !==
      fixtures.filter((f) => f.visibility === "public").length ||
    negative.publicPassed !== negative.publicCases ||
    !fixtures.some(
      (f) =>
        f.id === negative.hiddenFailureFixtureId && f.visibility === "hidden",
    )
  )
    return row;
  row.referenceOracleVerified = true;
  row.publicFixtureVerified = true;
  row.hiddenFixtureVerified = true;
  row.checkerVerified = true;
  row.adapterVersion = "reasonai-python:1";
  row.blockers = row.blockers.filter(
    (blocker) => blocker !== "independent-reference-oracle-validation-required",
  );
  row.evidence.push({
    kind: "actual-independent-oracle-and-public-pass-hidden-failure",
    artifact: "artifacts/dsa-v3-three-sum-local.json",
    fixtureContentSha256: proof.fixtureContentSha256,
    candidateStarterExecuted: proof.typedStarterExecuted,
    approvedTypedStarter: false,
  });
  if (provider.success) {
    const live = provider.data;
    if (
      live.problemId === row.problemId &&
      live.problemVersionId === row.problemVersionId &&
      live.suiteId === row.suiteId &&
      live.harnessSha256 === HARNESS_SHA256 &&
      live.fixtureContentSha256 === proof.fixtureContentSha256 &&
      live.codeSha256 === proof.executionSourceSha256 &&
      live.actualCaseCount === fixtures.length
    ) {
      row.sandboxSmokePassed = true;
      row.blockers = row.blockers.filter(
        (blocker) => blocker !== "real-sandbox-proof-required",
      );
      row.blockers.push(
        "authenticated-submit-queue-persistence-and-report-proof-required",
      );
      row.evidence.push({
        kind: "real-nebius-component-compatibility",
        artifact: "artifacts/dsa-v3-live-component.json",
        operationId: live.operationId,
        persistedSubmission: false,
        releaseE2EProven: false,
      });
    }
  }
  return row;
}
