import { z } from "zod";
import { executionIdentity, reply } from "@/lib/dsa-execution/http";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
export const runtime = "nodejs";
const input = z
  .object({ versions: z.array(z.uuid()).min(1).max(1000) })
  .strict();
const company = z.object({
  problem_version_id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  review_status: z.enum(["reviewed", "imported"]),
});

export async function POST(request: Request) {
  const identity = await executionIdentity(request);
  if (identity instanceof Response) return identity;
  let body: unknown;
  try {
    body = await readBoundedJSON(request, 65536);
  } catch (error) {
    if (error instanceof Error && error.message === "Body too large.")
      return reply({ error: "Request too large." }, 413);
    return reply({ error: "Invalid JSON." }, 400);
  }
  const parsed = input.safeParse(body);
  if (!parsed.success) return reply({ error: "Invalid version IDs." }, 422);
  // User-scoped client and owner-reviewed public metadata only. No service key.
  const items: Array<{
    problemVersionId: string;
    slug: string;
    name: string;
    reviewStatus: string;
  }> = [];
  for (let page = 0; page < 20; page++) {
    const result = await identity.supabase
      .rpc("dsa_v3_board_companies", {
        p_versions: parsed.data.versions,
        p_offset: page * 500,
      })
      .abortSignal(AbortSignal.timeout(8000));
    if (result.error)
      return reply(
        {
          error: "Company metadata is not available.",
          code: "COMPANY_METADATA_UNAVAILABLE",
        },
        503,
      );
    const rows = z.array(company).safeParse(result.data);
    if (!rows.success)
      return reply({ error: "Company metadata contract mismatch." }, 503);
    items.push(
      ...rows.data.map((row) => ({
        problemVersionId: row.problem_version_id,
        slug: row.slug,
        name: row.name,
        reviewStatus: row.review_status,
      })),
    );
    if (rows.data.length < 500) return reply({ items });
  }
  return reply(
    { error: "Company metadata exceeds the supported page limit." },
    503,
  );
}
