import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import {
  codeIntelligenceEnabled,
  createReportRepository,
} from "@/lib/dsa-reports/repository";
import { generateCodeReport } from "@/lib/dsa-reports/provider";
import { processReport, RetryReport } from "@/lib/dsa-reports/worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = handleCallback(
  async (message: unknown) => {
    const parsed = z.object({ reportId: z.uuid() }).strict().safeParse(message);
    if (!parsed.success || !codeIntelligenceEnabled()) return;
    await processReport(
      parsed.data.reportId,
      createReportRepository(),
      generateCodeReport,
    );
  },
  {
    retry: (error) => ({
      afterSeconds: error instanceof RetryReport ? error.afterSeconds : 60,
    }),
  },
);
