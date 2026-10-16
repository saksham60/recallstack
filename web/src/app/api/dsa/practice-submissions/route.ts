import { z } from "zod";
import { executionIdentity, reply } from "@/lib/dsa-execution/http";

export const runtime = "nodejs";
export const maxDuration = 15;

const submitSchema = z.object({
  problemId: z.uuid(),
  problemVersionId: z.uuid(),
  language: z.literal("python"),
  code: z.string().min(1).max(24000).refine((v) => !!v.trim()),
  checkStatus: z.enum(["examples_passed", "examples_failed", "not_evaluated"]),
  clientCheckedCount: z.number().int().min(0).max(20),
  clientPassedCount: z.number().int().min(0).max(20),
}).strict().refine((v) =>
  v.clientPassedCount <= v.clientCheckedCount &&
  (v.checkStatus === "not_evaluated"
    ? v.clientCheckedCount === 0 && v.clientPassedCount === 0
    : v.clientCheckedCount > 0 && (
      v.checkStatus === "examples_passed"
        ? v.clientCheckedCount === v.clientPassedCount
        : v.clientPassedCount < v.clientCheckedCount
    )),
  { message: "Invalid local feedback counts." }
);

function receipt(row: Record<string, unknown>) {
  return {
    id: row.id,
    createdAt: row.created_at,
    checkStatus: row.check_status,
    clientCheckedCount: row.client_checked_count,
    clientPassedCount: row.client_passed_count,
    gradingLevel: "browser_examples_unverified" as const,
  };
}

// Real, durable submissions. The feedback comes from in-browser examples and
// must NEVER be represented as a trusted Accepted or hidden-test verdict.
export async function POST(request: Request) {
  const identity = await executionIdentity(request);
  if (identity instanceof Response) return identity;
  let raw: unknown;
  try {
    const body = await request.text();
    if (body.length > 65536) return reply({ error: "Submission is too large." }, 413);
    raw = JSON.parse(body);
  } catch {
    return reply({ error: "Invalid submission JSON." }, 400);
  }
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return reply({ error: "Invalid Python submission or example results." }, 422);
  const data = parsed.data;
  const { data: row, error } = await identity.supabase
    .from("dsa_practice_submissions")
    .insert({
      user_id: identity.user.id,
      problem_id: data.problemId,
      problem_version_id: data.problemVersionId,
      language: "python",
      source_code: data.code,
      check_status: data.checkStatus,
      client_checked_count: data.clientCheckedCount,
      client_passed_count: data.clientPassedCount,
    })
    .select("id,created_at,check_status,client_checked_count,client_passed_count")
    .single();
  if (error) {
    if (error.message.includes("daily limit"))
      return reply({ error: "Practice submission limit reached. Try again tomorrow." }, 429);
    if (error.code === "42501" || error.code === "23503")
      return reply({ error: "This problem version is not currently available." }, 409);
    return reply({ error: "Could not save this submission." }, 503);
  }
  return reply(receipt(row), 201);
}

export async function GET(request: Request) {
  const identity = await executionIdentity(request);
  if (identity instanceof Response) return identity;
  const params = new URL(request.url).searchParams;
  const problemId = z.uuid().safeParse(params.get("problemId")),
    versionId = z.uuid().safeParse(params.get("problemVersionId"));
  if (!problemId.success || !versionId.success)
    return reply({ error: "Problem and version IDs are required." }, 422);
  const { data, error } = await identity.supabase
    .from("dsa_practice_submissions")
    .select("id,created_at,check_status,client_checked_count,client_passed_count")
    .eq("user_id", identity.user.id)
    .eq("problem_id", problemId.data)
    .eq("problem_version_id", versionId.data)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return reply({ error: "Could not load submission history." }, 503);
  return reply({ latest: data?.length ? receipt(data[0]) : null });
}
