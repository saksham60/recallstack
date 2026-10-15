import { timingSafeEqual } from "node:crypto";
import { dispatchExecutions, probeExecutionDelivery } from "@/lib/dsa-execution/queue";
import { readBoundedJSON } from "@/lib/http/read-bounded-json";
import {
  createExecutionRepository,
  executionConfigured,
} from "@/lib/dsa-execution/repository";
import { executionHttpError, reply } from "@/lib/dsa-execution/http";
export const runtime = "nodejs";
export const maxDuration = 30;
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret ?? ""}`);
  return !!secret && actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function GET(request: Request) {
  if (!authorized(request)) return reply({ error: "Unauthorized." }, 401);
  if (!executionConfigured()) return reply({ dispatched: 0, disabled: true });
  try {
    return reply(await dispatchExecutions(createExecutionRepository()));
  } catch (error) {
    return executionHttpError(error);
  }
}
/** Operator-only deployment verification; no job, user code or fixture is created. */
export async function POST(request: Request) {
  if (!authorized(request)) return reply({ error: "Unauthorized." }, 401);
  if (!executionConfigured()) return reply({ error: "Execution is not configured." }, 503);
  try {
    const body = await readBoundedJSON(request, 1024);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("probe" in body) || body.probe !== true) return reply({ error: "Expected a delivery probe." }, 400);
    return reply(await probeExecutionDelivery(), 202);
  } catch (error) { return executionHttpError(error); }
}
