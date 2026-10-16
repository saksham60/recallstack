import { z } from "zod";
import { executionIdentity, reply } from "@/lib/dsa-execution/http";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
export const runtime = "nodejs";
const input = z
  .object({ versions: z.array(z.uuid()).min(1).max(1000) })
  .strict();
const company = z.object({
  problem_version_id: z.uuid(),
  company: z.object({ slug: z.string(), name: z.string() }),
});

export async function POST(request: Request) {
  const identity = await executionIdentity(request);
  if (identity instanceof Response) return identity;
  let body: unknown;
  try {
    body = await readBoundedJSON(request, 65536);
  } catch (error) {
    if (error instanceof Error && error.message === "Body too large.") return reply({ error: "Request too large." }, 413);
    return reply({ error: "Invalid JSON." }, 400);
  }
  const parsed = input.safeParse(body);
  if (!parsed.success) return reply({ error: "Invalid version IDs." }, 422);
  // User-scoped client and owner-reviewed public metadata only. No service key.
  const items: Array<{ problemVersionId: string; slug: string; name: string }> =
    [];
  for (let page = 0; page < 20; page++) {
    const result = await identity.supabase
      .from("dsa_problem_company_tags")
      .select("problem_version_id,company:dsa_companies!inner(slug,name)")
      .in("problem_version_id", parsed.data.versions)
      .eq("reviewed", true)
      .order("problem_version_id")
      .order("company_id")
      .range(page * 500, page * 500 + 499);
    if (result.error)
      return reply(
        {
          error: "Reviewed company metadata is not available.",
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
        ...row.company,
      })),
    );
    if (rows.data.length < 500) return reply({ items });
  }
  return reply(
    { error: "Company metadata exceeds the supported page limit." },
    503,
  );
}
