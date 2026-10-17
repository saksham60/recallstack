import {
  analysisSchema,
  claimSchema,
  type ReportClaim,
  type ReportRepository,
  type CodeAnalysis,
  type ReportUsage,
} from "./contracts";
export class RetryReport extends Error {
  constructor(public afterSeconds = 30) {
    super("Report processing will resume.");
  }
}
export class ReportProviderError extends Error {
  constructor(public retryable: boolean) {
    super(
      "Code Intelligence could not be generated. The judge result is saved.",
    );
  }
}
export type ReportGenerator = (
  claim: ReportClaim,
) => Promise<{ document: CodeAnalysis; usage: ReportUsage }>;
/** No judge repository or verdict mutation capability is passed to this worker. */
export async function processReport(
  id: string,
  repository: ReportRepository,
  generate: ReportGenerator,
  token = crypto.randomUUID(),
) {
  const raw = await repository.claim(id, token);
  if (raw === "done") return;
  if (!raw) throw new RetryReport();
  const claim = claimSchema.parse(raw);
  if (
    new TextEncoder().encode(JSON.stringify(claim.packet)).byteLength > 40000
  ) {
    await repository.finish(claim, {
      error: "The evidence packet exceeds the supported analysis limit.",
    });
    return;
  }
  let outcome;
  try {
    const generated = await generate(claim);
    outcome = {
      document: analysisSchema.parse(generated.document),
      usage: generated.usage,
    };
  } catch (error) {
    // Never persist raw provider text, model instructions, private evidence or secrets.
    outcome = {
      error:
        "Code Intelligence could not be generated. The judge result is saved.",
      retry:
        error instanceof ReportProviderError &&
        error.retryable,
    };
  }
  // Storage failure retries delivery; the durable claim prevents concurrent calls.
  if (!(await repository.finish(claim, outcome))) throw new RetryReport(90);
  if ("retry" in outcome && outcome.retry) throw new RetryReport(30);
}
