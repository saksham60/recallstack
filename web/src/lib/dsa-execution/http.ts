import "server-only";
import { authenticateApiRequestWithContext } from "@/lib/supabase/api-auth";
import { ExecutionError } from "./types";
export const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
      "X-DSA-Execution-Version": "1",
    },
  });
export function executionHttpError(error: unknown): Response {
  return error instanceof ExecutionError
    ? reply({ error: error.message, code: error.code }, error.status)
    : reply(
        {
          error: "Execution is temporarily unavailable.",
          code: "EXECUTION_UNAVAILABLE",
        },
        503,
      );
}
export async function executionIdentity(request: Request) {
  const version = request.headers.get("x-dsa-execution-version");
  if (version && version !== "1")
    return reply({ error: "Unsupported execution API version." }, 400);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return reply({ error: "Invalid request origin." }, 403);
  // Execution has no E2E auth bypass: a browser test can never spend sandbox
  // capacity using the application's development-only login cookie.
  const identity = await authenticateApiRequestWithContext(request);
  if (identity instanceof Response) {
    identity.headers.set("X-DSA-Execution-Version", "1");
    identity.headers.set("Cache-Control", "private, no-store");
    identity.headers.set("Vary", "Authorization, Cookie");
  }
  return identity;
}
