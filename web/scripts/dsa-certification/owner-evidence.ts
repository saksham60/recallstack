import { z } from "zod";
import type { CertificationRow } from "./core";
const nullableText = z.string().max(200).nullable();
export const ownerEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.literal("jlqawpdsyptfxspyqnsu"),
  generatedAt: z.iso.datetime({ offset: true }),
  items: z
    .array(
      z.object({
        problemId: z.uuid(),
        problemVersionId: z.uuid(),
        suiteId: z.uuid(),
        checkId: z.uuid().nullable(),
        result: z.enum(["passed", "failed", "blocked"]).nullable(),
        verifier: nullableText,
        verifierVersion: nullableText,
        verifiedAt: nullableText,
        recordedFixtureMd5: z
          .string()
          .regex(/^[a-f0-9]{32}$/)
          .nullable(),
        currentFixtureMd5: z.string().regex(/^[a-f0-9]{32}$/),
        fixtureCount: z.number().int().nonnegative(),
      }),
    )
    .max(375),
});
export function attachOwnerEvidence(
  row: CertificationRow,
  evidence: z.infer<typeof ownerEvidenceSchema>["items"][number],
) {
  if (
    row.problemId !== evidence.problemId ||
    row.problemVersionId !== evidence.problemVersionId ||
    row.suiteId !== evidence.suiteId
  )
    return false;
  if (!evidence.checkId) return false;
  row.evidence.push({
    kind: "owner-recorded-independent-oracle",
    ...evidence,
    recordedDigestMatchesCurrent:
      !!evidence.recordedFixtureMd5 &&
      evidence.recordedFixtureMd5 === evidence.currentFixtureMd5,
    scope:
      "owner output-oracle evidence; not V3 typed Python, source, checker or hosted certification",
  });
  // Existing owner evidence is retained, never promoted into missing V3 approvals.
  return true;
}
