import { readFile, writeFile, mkdir, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  reviewedBundleSchema,
  initialRow,
  hash,
  validateReviewedProblem,
  type CertificationRow,
} from "./dsa-certification/core";
import { createCertificationRuntime } from "./dsa-certification/browser";
import { HARNESS_SHA256 } from "../src/lib/dsa-execution/python/harness.generated";
import { auditImportedProblem } from "./dsa-certification/import-audit";
import { attachThreeSumEvidence } from "./dsa-certification/evidence";
import {
  attachOwnerEvidence,
  ownerEvidenceSchema,
} from "./dsa-certification/owner-evidence";

async function main() {
  const { values } = parseArgs({
    options: {
      audit: { type: "boolean" },
      "dry-run": { type: "boolean" },
      problem: { type: "string" },
      ids: { type: "string" },
      cohort: { type: "string" },
      "batch-size": { type: "string" },
      resume: { type: "string" },
      inventory: { type: "string" },
      "imported-directory": { type: "string" },
      "evidence-directory": { type: "string" },
      "owner-evidence": { type: "string" },
      "reviewed-bundle": { type: "string" },
      output: { type: "string" },
      strict: { type: "boolean" },
      help: { type: "boolean" },
    },
    strict: true,
  });
  if (values.help) {
    console.log(
      "dsa:certify [--audit] [--dry-run] [--problem <slug-or-uuid>] [--ids <uuid,...>] [--cohort source-review|checker-archetype|final] [--reviewed-bundle <private.json>] [--imported-directory <private-export-folder>] [--batch-size 1..25] [--resume <manifest.json>] [--output <manifest.json>] [--strict]\nNo database writes, provider calls or publication changes. Local validation uses isolated real Pyodide. A successful local audit cannot certify Nebius or install a certificate.",
    );
    return;
  }
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const inventory = JSON.parse(
    await readFile(
      path.resolve(
        values.inventory ??
          path.join(root, "../artifacts/dsa-v3-catalog-inventory.json"),
      ),
      "utf8",
    ),
  );
  const identitySchema = z.object({
    problemId: z.uuid(),
    problemVersionId: z.uuid(),
    suiteId: z.uuid().nullable(),
    slug: z.string(),
    suiteStatus: z.string(),
    checkerType: z.string(),
    existingHiddenCertificate: z.boolean(),
    existingPublicCertificate: z.boolean(),
    blockers: z.array(z.string()),
  });
  const identities = z.array(identitySchema).parse(inventory.items);
  const imported = new Map<string, unknown>();
  if (values["imported-directory"]) {
    const folder = path.resolve(values["imported-directory"]);
    for (const file of (await readdir(folder))
      .filter((file) => /^catalog-\d{3}\.json$/.test(file))
      .sort()) {
      const chunk = JSON.parse(await readFile(path.join(folder, file), "utf8"));
      for (const item of chunk.items) {
        if (imported.has(item.problem_id))
          throw new Error("Duplicate imported identity");
        imported.set(item.problem_id, item);
      }
    }
    if (imported.size !== identities.length)
      throw new Error("Imported snapshot must cover every inventory identity");
  }
  if (
    new Set(identities.map((row) => row.problemId)).size !== identities.length
  )
    throw new Error("Inventory contains duplicate problem identities");
  const batch = Number(values["batch-size"] ?? 10);
  if (!Number.isInteger(batch) || batch < 1 || batch > 25)
    throw new Error("batch-size must be 1..25");
  const selectors = [values.problem, values.ids, values.cohort].filter(Boolean);
  if (selectors.length > 1)
    throw new Error("Choose one problem, ID-list or cohort selector");
  const ids = values.ids?.split(",");
  if (ids && !ids.every((id) => z.uuid().safeParse(id).success))
    throw new Error("Invalid explicit problem ID");
  if (
    values.cohort &&
    !["source-review", "checker-archetype", "final"].includes(values.cohort)
  )
    throw new Error("Unknown cohort");
  const selected = identities.filter((row) =>
    values.problem
      ? row.problemId === values.problem ||
        row.slug === values.problem ||
        row.slug === `ultimate-dsa-016-${values.problem}`
      : ids
        ? ids.includes(row.problemId)
        : values.cohort === "final"
          ? row.existingHiddenCertificate
          : values.cohort === "checker-archetype"
            ? row.checkerType === "custom"
            : values.cohort === "source-review"
              ? row.suiteStatus !== "published"
              : true,
  );
  if (
    !selected.length ||
    (ids &&
      new Set(selected.map((row) => row.problemId)).size !== new Set(ids).size)
  )
    throw new Error(
      "Selector does not resolve every requested immutable problem identity",
    );
  const reviewed = values["reviewed-bundle"]
    ? reviewedBundleSchema.parse(
        JSON.parse(
          await readFile(path.resolve(values["reviewed-bundle"]), "utf8"),
        ),
      )
    : undefined;
  const previous = values.resume
    ? JSON.parse(await readFile(path.resolve(values.resume), "utf8"))
    : undefined;
  const rows = new Map<string, CertificationRow>(
    identities.map((row) => [row.problemId, initialRow(row)]),
  );
  if (!values.audit && !values["dry-run"] && Array.isArray(previous?.items))
    for (const identity of identities) {
      const problem = reviewed?.items.find(
        (row) =>
          row.problemId === identity.problemId &&
          row.problemVersionId === identity.problemVersionId,
      );
      const old = previous.items.find(
        (row: CertificationRow) =>
          row.problemId === identity.problemId &&
          row.problemVersionId === identity.problemVersionId &&
          row.suiteId === identity.suiteId,
      );
      if (
        problem &&
        old?.localCompleted &&
        old.inputSha256 === hash(problem) &&
        old.harnessSha256 === HARNESS_SHA256 &&
        old.certificationStatus ===
          "locally-validated-awaiting-sandbox-and-owner"
      )
        rows.set(identity.problemId, {
          ...old,
          sandboxSmokePassed: false,
          certificationStatus: "locally-validated-awaiting-sandbox-and-owner",
          blockers: [
            "real-sandbox-proof-required",
            "owner-certificate-application-required",
          ],
        });
    }
  const chosen =
    values.audit || values["dry-run"]
      ? selected
      : selected
          .filter((row) => !rows.get(row.problemId)?.localCompleted)
          .slice(0, batch);
  const output = path.resolve(
    values.output ??
      path.join(root, "../artifacts/dsa-certification-manifest.json"),
  );
  const snapshot = () => {
    const items = [...rows.values()];
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      mode:
        values.audit || values["dry-run"]
          ? "read-only-audit"
          : "local-reference-validation",
      harnessSha256: HARNESS_SHA256,
      paidVerificationCalls: 0,
      productionMutations: 0,
      independentSandboxCertificationPerformed: false,
      summary: {
        target: identities.length,
        selected: chosen.length,
        locallyValidated: items.filter(
          (row) =>
            row.certificationStatus ===
            "locally-validated-awaiting-sandbox-and-owner",
        ).length,
        certified: 0,
        ownerOracleChecksRecorded: items.filter((row) =>
          row.evidence.some(
            (e) =>
              e.kind === "owner-recorded-independent-oracle" &&
              e.result === "passed",
          ),
        ).length,
        ownerOracleChecksWithMatchingDigest: items.filter((row) =>
          row.evidence.some(
            (e) =>
              e.kind === "owner-recorded-independent-oracle" &&
              e.result === "passed" &&
              e.recordedDigestMatchesCurrent === true,
          ),
        ).length,
        independentOraclesValidated: items.filter(
          (row) => row.referenceOracleVerified,
        ).length,
        sandboxComponentsVerified: items.filter((row) => row.sandboxSmokePassed)
          .length,
        blocked: items.filter((row) => row.certificationStatus === "blocked")
          .length,
        notAudited: items.filter(
          (row) => row.certificationStatus === "not-audited",
        ).length,
      },
      items,
    };
  };
  const save = async () => {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output + ".tmp",
      JSON.stringify(snapshot(), null, 2) + "\n",
    );
    await rename(output + ".tmp", output);
  };
  let runtime:
    Awaited<ReturnType<typeof createCertificationRuntime>> | undefined;
  try {
    for (const identity of chosen) {
      const problem = reviewed?.items.find(
        (row) =>
          row.problemId === identity.problemId &&
          row.problemVersionId === identity.problemVersionId,
      );
      if (values.audit || values["dry-run"] || !problem) {
        if (imported.has(identity.problemId)) {
          rows.set(
            identity.problemId,
            auditImportedProblem(identity, imported.get(identity.problemId)),
          );
          continue;
        }
        const row = rows.get(identity.problemId)!;
        row.certificationStatus = "blocked";
        if (problem) row.inputSha256 = hash(problem);
        row.evidence.push({
          kind: "read-only-inventory",
          existingPublishedSuite: identity.suiteStatus === "published",
          existingCertificateFlag: identity.existingHiddenCertificate,
          independentCertificationPerformed: false,
        });
        await save();
        continue;
      }
      runtime ??= await createCertificationRuntime();
      console.log(
        `Validating ${identity.problemId} (${identity.slug}) with actual local Python`,
      );
      const started = Date.now();
      try {
        rows.set(
          identity.problemId,
          await validateReviewedProblem(identity, problem, async (...args) => {
            if (Date.now() - started > 120000)
              throw new Error("Local problem budget exceeded");
            return runtime!.execute(...args);
          }),
        );
      } catch {
        const row = rows.get(identity.problemId)!;
        row.certificationStatus = "blocked";
        row.blockers.push("local-runtime-or-problem-budget-failure");
      }
      await save();
    }
  } finally {
    await runtime?.close();
  }
  if (values["evidence-directory"]) {
    const directory = path.resolve(values["evidence-directory"]);
    const local = await readFile(
      path.join(directory, "dsa-v3-three-sum-local.json"),
      "utf8",
    ).then(JSON.parse);
    const provider = await readFile(
      path.join(directory, "dsa-v3-live-component.json"),
      "utf8",
    ).then(JSON.parse);
    const importedRow = imported.get(local.problemId);
    if (importedRow) {
      const fixtures = z
        .object({
          fixtures: z
            .array(
              z.object({
                id: z.uuid(),
                visibility: z.string(),
                input: z.unknown(),
                expected: z.unknown(),
              }),
            )
            .max(100),
        })
        .parse(importedRow).fixtures;
      const row = rows.get(local.problemId);
      if (row) attachThreeSumEvidence(row, fixtures, local, provider);
    }
  }
  if (values["owner-evidence"]) {
    const owner = ownerEvidenceSchema.parse(
      JSON.parse(
        await readFile(path.resolve(values["owner-evidence"]), "utf8"),
      ),
    );
    if (
      new Set(owner.items.map((item) => item.problemId)).size !==
      owner.items.length
    )
      throw new Error("Duplicate owner evidence identity");
    for (const item of owner.items) {
      const row = rows.get(item.problemId);
      if (
        !row ||
        row.problemVersionId !== item.problemVersionId ||
        row.suiteId !== item.suiteId
      )
        throw new Error("Owner evidence identity mismatch");
      attachOwnerEvidence(row, item);
    }
  }
  const manifest = snapshot(),
    { items, summary } = manifest;
  await save();
  const failures = {
    schemaVersion: 1,
    generatedAt: manifest.generatedAt,
    summary,
    items: items
      .filter((row) => row.blockers.length)
      .map(({ problemId, problemVersionId, suiteId, blockers }) => ({
        problemId,
        problemVersionId,
        suiteId,
        blockers,
      })),
  };
  await writeFile(
    output.replace(/\.json$/, "") + ".failures.json",
    JSON.stringify(failures, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary));
  console.log(`Manifest: ${output}`);
  if (
    values.strict &&
    items.some(
      (row) =>
        row.certificationStatus !==
          "locally-validated-awaiting-sandbox-and-owner" || row.blockers.length,
    )
  )
    process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "Certification failed. Check input schemas, local interpreter assets and exact version metadata. No private fixture/source data is printed.",
  );
  process.exitCode = 1;
});
