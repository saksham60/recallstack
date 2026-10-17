import { createHash } from "node:crypto";
import { z } from "zod";
import {
  pythonContractSchema,
  typedStarter,
} from "../../src/lib/dsa-execution/python-contract";
import { equal, safeJson } from "../../src/lib/dsa-execution/public-comparator";
import { HARNESS_SHA256 } from "../../src/lib/dsa-execution/python/harness.generated";
const review = z
  .object({
    by: z.uuid(),
    at: z.iso.datetime({ offset: true }),
    evidence: z.string().min(1).max(2000),
  })
  .strict();
const sourceUrl = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
export const reviewedProblemSchema = z
  .object({
    problemId: z.uuid(),
    problemVersionId: z.uuid(),
    suiteId: z.uuid(),
    statement: z
      .object({
        published: z.boolean(),
        sourceUrl,
        sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
        review,
      })
      .strict(),
    contract: pythonContractSchema,
    contractReview: review,
    references: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            source: z.string().min(1).max(24000),
            sourceUrl,
            review,
          })
          .strict(),
      )
      .min(2)
      .max(3),
    fixtures: z
      .array(
        z
          .object({
            id: z.uuid(),
            visibility: z.enum(["public", "hidden"]),
            input: z.unknown(),
            expected: z.unknown(),
            category: z.enum(["official", "boundary", "stress", "regression"]),
            review,
          })
          .strict(),
      )
      .min(2)
      .max(100),
    checkerReview: z
      .object({
        review,
        cases: z
          .array(
            z
              .object({
                input: z.unknown(),
                expected: z.unknown(),
                actual: z.unknown(),
                accept: z.boolean(),
              })
              .strict(),
          )
          .min(2)
          .max(30),
      })
      .strict(),
  })
  .strict();
export const reviewedBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    items: z.array(reviewedProblemSchema).max(375),
  })
  .strict();
export type ReviewedProblem = z.infer<typeof reviewedProblemSchema>;
export type Identity = {
  problemId: string;
  problemVersionId: string;
  suiteId: string | null;
  slug: string;
  suiteStatus: string;
  checkerType: string;
  existingHiddenCertificate: boolean;
  existingPublicCertificate: boolean;
  blockers: string[];
};
export type CertificationRow = {
  problemId: string;
  problemVersionId: string;
  suiteId: string | null;
  slug: string;
  adapterVersion: string | null;
  starterVerified: boolean;
  publicFixtureVerified: boolean;
  hiddenFixtureVerified: boolean;
  referenceOracleVerified: boolean;
  checkerVerified: boolean;
  sandboxSmokePassed: boolean;
  certificationStatus:
    "not-audited" | "blocked" | "locally-validated-awaiting-sandbox-and-owner";
  blockers: string[];
  evidence: Array<Record<string, unknown>>;
  inputSha256?: string;
  harnessSha256: string;
  localCompleted?: boolean;
};
export type PythonEvidence = {
  status: string;
  actual?: unknown;
  durationMs?: number;
  stderr?: string;
};
export type ExecutePython = (
  source: string,
  contract: ReviewedProblem["contract"],
  input: unknown,
) => Promise<PythonEvidence>;
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => [key, canonical(value)]),
        )
      : value;
export function initialRow(item: Identity): CertificationRow {
  return {
    problemId: item.problemId,
    problemVersionId: item.problemVersionId,
    suiteId: item.suiteId,
    slug: item.slug,
    adapterVersion: null,
    starterVerified: false,
    publicFixtureVerified: false,
    hiddenFixtureVerified: false,
    referenceOracleVerified: false,
    checkerVerified: false,
    sandboxSmokePassed: false,
    certificationStatus: "not-audited",
    blockers: [
      "reviewed-source-contract-fixtures-and-two-independent-references-required",
      "real-sandbox-proof-required",
      "owner-certificate-application-required",
    ],
    evidence: [],
    harnessSha256: HARNESS_SHA256,
  };
}
export function reviewChecks(identity: Identity, problem: ReviewedProblem) {
  const blockers: string[] = [];
  if (
    identity.problemId !== problem.problemId ||
    identity.problemVersionId !== problem.problemVersionId ||
    identity.suiteId !== problem.suiteId
  )
    blockers.push("immutable-version-or-suite-mismatch");
  if (!problem.statement.published) blockers.push("statement-not-published");
  if (!problem.contract.adapter)
    blockers.push("reviewed-typed-adapter-required");
  if (
    new Set(problem.references.map((row) => row.source.trim())).size !==
    problem.references.length
  )
    blockers.push("reference-implementations-are-identical");
  if (
    new Set(problem.fixtures.map((row) => row.id)).size !==
    problem.fixtures.length
  )
    blockers.push("duplicate-fixture-identities");
  const seen = new Map<string, string>();
  for (const fixture of problem.fixtures) {
    if (
      !safeJson(fixture.input) ||
      !safeJson(fixture.expected) ||
      Buffer.byteLength(JSON.stringify(fixture.expected)) > 8192
    ) {
      blockers.push("unsafe-or-oversized-fixture-json");
      break;
    }
    const key = hash(canonical(fixture.input)),
      prior = seen.get(key);
    if (prior)
      blockers.push(
        prior === fixture.visibility
          ? "duplicate-fixture-input"
          : "public-hidden-input-overlap",
      );
    seen.set(key, fixture.visibility);
  }
  if (
    Buffer.byteLength(
      JSON.stringify(problem.fixtures.map((row) => row.input)),
    ) > 65536
  )
    blockers.push("fixture-input-budget-exceeded");
  if (!problem.fixtures.some((row) => row.visibility === "public"))
    blockers.push("missing-public-fixtures");
  if (!problem.fixtures.some((row) => row.visibility === "hidden"))
    blockers.push("missing-hidden-fixtures");
  for (const category of ["boundary", "stress"])
    if (!problem.fixtures.some((row) => row.category === category))
      blockers.push(`missing-${category}-coverage`);
  const checkerVerified =
    problem.checkerReview.cases.some((row) => row.accept) &&
    problem.checkerReview.cases.some((row) => !row.accept) &&
    problem.checkerReview.cases.every(
      (row) =>
        equal(row.actual, row.expected, problem.contract, row.input) ===
        row.accept,
    );
  if (!checkerVerified) blockers.push("checker-adversarial-review-failed");
  return { blockers: [...new Set(blockers)], checkerVerified };
}
export async function validateReviewedProblem(
  identity: Identity,
  problem: ReviewedProblem,
  execute: ExecutePython,
): Promise<CertificationRow> {
  const row = initialRow(identity),
    checks = reviewChecks(identity, problem);
  row.inputSha256 = hash(problem);
  row.adapterVersion = problem.contract.adapter
    ? `${problem.contract.adapter.id}:${problem.contract.adapter.version}`
    : null;
  row.blockers = checks.blockers;
  row.checkerVerified = checks.checkerVerified;
  row.certificationStatus = "blocked";
  if (row.blockers.length) return row;
  const started = Date.now();
  // Compile and invoke the actual typed template without treating it as a solution.
  const starter = await execute(
    typedStarter(problem.contract)!,
    problem.contract,
    problem.fixtures[0].input,
  );
  row.starterVerified = starter.status === "ok";
  if (!row.starterVerified) row.blockers.push("typed-starter-execution-failed");
  let publicPassed = true,
    hiddenPassed = true,
    agreement = true;
  for (const fixture of problem.fixtures) {
    const outputs = [];
    for (const reference of problem.references) {
      const outcome = await execute(
        reference.source,
        problem.contract,
        fixture.input,
      );
      const passed =
        outcome.status === "ok" &&
        equal(
          outcome.actual,
          fixture.expected,
          problem.contract,
          fixture.input,
        );
      if (!passed) {
        if (fixture.visibility === "public") publicPassed = false;
        else hiddenPassed = false;
      }
      outputs.push(outcome);
    }
    // Predicate/equivalence checkers may accept different valid serialized results.
    if (
      outputs.some(
        (outcome) =>
          outcome.status !== "ok" ||
          !equal(
            outcome.actual,
            fixture.expected,
            problem.contract,
            fixture.input,
          ),
      )
    )
      agreement = false;
    row.evidence.push({
      kind: "actual-pyodide-reference-execution",
      fixtureId: fixture.id,
      visibility: fixture.visibility,
      inputSha256: hash(fixture.input),
      referenceSourceHashes: problem.references.map((reference) =>
        hash(reference.source),
      ),
      statuses: outputs.map((outcome) => outcome.status),
      allReferencesPass: outputs.every(
        (outcome) =>
          outcome.status === "ok" &&
          equal(
            outcome.actual,
            fixture.expected,
            problem.contract,
            fixture.input,
          ),
      ),
    });
  }
  row.publicFixtureVerified = publicPassed;
  row.hiddenFixtureVerified = hiddenPassed;
  row.referenceOracleVerified = agreement;
  if (!publicPassed) row.blockers.push("public-reference-fixture-failure");
  if (!hiddenPassed) row.blockers.push("hidden-reference-fixture-failure");
  if (!agreement)
    row.blockers.push("independent-reference-oracle-disagreement");
  row.localCompleted = true;
  if (!row.blockers.length)
    row.certificationStatus = "locally-validated-awaiting-sandbox-and-owner";
  row.blockers.push(
    "real-sandbox-proof-required",
    "owner-certificate-application-required",
  );
  row.evidence.push({
    kind: "bounded-local-validation",
    runtime: "pyodide:0.28.3",
    harnessSha256: HARNESS_SHA256,
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  });
  return row;
}
