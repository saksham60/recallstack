import { hash, initialRow, type Identity } from "./core";
import { z } from "zod";
const importedSchema = z.object({
  problem_id: z.uuid(),
  problem_version_id: z.uuid(),
  suite_id: z.uuid().nullable(),
  version_status: z.string(),
  suite_status: z.string().nullable(),
  checker_type: z.string().nullable(),
  specification: z.record(z.string(), z.unknown()),
  provenance: z.record(z.string(), z.unknown()),
  certified_contract: z.unknown().nullable(),
  fixtures: z
    .array(
      z.object({
        id: z.uuid(),
        category: z.string(),
        visibility: z.enum(["public", "hidden"]),
        input: z.unknown(),
        expected: z.unknown(),
        validation_status: z.string(),
        fixture_ref: z.string().nullable(),
      }),
    )
    .max(100),
});
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
/** Audit imported rows as data; publication/replay flags never imply certification. */
export function auditImportedProblem(identity: Identity, raw: unknown) {
  const item = importedSchema.parse(raw),
    row = initialRow(identity);
  if (
    item.problem_id !== identity.problemId ||
    item.problem_version_id !== identity.problemVersionId ||
    item.suite_id !== identity.suiteId
  )
    throw new Error("Imported immutable identity mismatch");
  row.certificationStatus = "blocked";
  const seen = new Map<string, { visibility: string; expected: string }>();
  let duplicateInputs = 0,
    overlap = 0,
    contradictions = 0;
  for (const fixture of item.fixtures) {
    const key = hash(canonical(fixture.input)),
      expected = hash(canonical(fixture.expected)),
      prior = seen.get(key);
    if (prior) {
      duplicateInputs++;
      if (prior.visibility !== fixture.visibility) overlap++;
      if (prior.expected !== expected) contradictions++;
    } else seen.set(key, { visibility: fixture.visibility, expected });
  }
  const reference = item.provenance.reference_solution_python;
  const statuses = Object.fromEntries(
    [...new Set(item.fixtures.map((row) => row.validation_status))].map(
      (status) => [
        status,
        item.fixtures.filter((row) => row.validation_status === status).length,
      ],
    ),
  );
  row.blockers = [
    "independent-source-and-typed-contract-review-required",
    "independent-reference-oracle-validation-required",
    "real-sandbox-proof-required",
    "owner-certificate-application-required",
  ];
  if (item.version_status !== "published")
    row.blockers.push("version-not-published");
  if (item.suite_status !== "published")
    row.blockers.push("suite-not-published");
  if (item.fixtures.some((row) => row.validation_status !== "verified"))
    row.blockers.push("unverified-imported-fixtures");
  if (duplicateInputs) row.blockers.push("duplicate-fixture-inputs");
  if (overlap) row.blockers.push("public-hidden-overlap");
  if (contradictions) row.blockers.push("contradictory-expected-outputs");
  if (item.fixtures.some((row) => row.fixture_ref !== null))
    row.blockers.push("external-fixture-resolution-required");
  if (typeof reference !== "string" || !reference.trim())
    row.blockers.push("missing-imported-reference");
  if (!item.fixtures.some((row) => row.visibility === "public"))
    row.blockers.push("missing-public-fixtures");
  if (!item.fixtures.some((row) => row.visibility === "hidden"))
    row.blockers.push("missing-hidden-fixtures");
  row.inputSha256 = hash(item);
  row.evidence.push({
    kind: "actual-database-import-audit",
    fixtureCount: item.fixtures.length,
    publicCount: item.fixtures.filter((row) => row.visibility === "public")
      .length,
    hiddenCount: item.fixtures.filter((row) => row.visibility === "hidden")
      .length,
    validationStatuses: statuses,
    uniqueInputs: seen.size,
    duplicateInputs,
    publicHiddenOverlap: overlap,
    contradictoryOutputs: contradictions,
    referencePresent: typeof reference === "string" && !!reference.trim(),
    sourceVerificationClaimed:
      item.provenance.source_contract_verified === true,
    existingCertificatePresent: !!item.certified_contract,
    independentCertificationPerformed: false,
  });
  return row;
}
