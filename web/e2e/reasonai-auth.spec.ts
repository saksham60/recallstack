import { expect, test } from "@playwright/test";
import { AuthApiError, AuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { createAuthenticatedReasonAIFetch, createAuthenticatedReasonAIRequest, type ReasonAIEndpoint } from "../src/lib/reasonai/authenticated-request";
import { validateApiUser } from "../src/lib/supabase/api-auth-result";

const session = (token: string | null, error: unknown = null) => ({ data: { session: token ? { access_token: token } : null }, error });
const endpoint = "/api/reasonai/chat";

test("expired token refreshes once and retries the identical request with the current token", async () => {
  let refreshes = 0;
  const calls: RequestInit[] = [];
  const request = createAuthenticatedReasonAIRequest({ getSession: async () => session("old"), refreshSession: async () => { refreshes++; return session("fresh"); } }, async (_url, init) => {
    calls.push(init!); return Response.json({}, { status: calls.length === 1 ? 401 : 200 });
  });
  expect((await request(endpoint, '{"message":"capacity"}')).status).toBe(200);
  expect(refreshes).toBe(1);
  expect(calls).toHaveLength(2);
  expect(calls[0].body).toBe(calls[1].body);
  expect(new Headers(calls[0].headers).get("Authorization")).toBe("Bearer old");
  expect(new Headers(calls[1].headers).get("Authorization")).toBe("Bearer fresh");
  expect(calls[1]).toMatchObject({ credentials: "same-origin", redirect: "error", cache: "no-store" });
});

test("simultaneous tutor requests share a refresh and retry at most once", async () => {
  let refreshes = 0, calls = 0;
  let release!: (value: ReturnType<typeof session>) => void;
  const refresh = new Promise<ReturnType<typeof session>>((resolve) => { release = resolve; });
  const request = createAuthenticatedReasonAIRequest({ getSession: async () => session("old"), refreshSession: async () => { refreshes++; return refresh; } }, async () => { calls++; return Response.json({}, { status: 401 }); });
  const a = request(endpoint, "a"), b = request("/api/reasonai/dsa/chat", "b");
  await expect.poll(() => refreshes).toBe(1);
  release(session("fresh"));
  expect((await Promise.all([a, b])).map((response) => response.status)).toEqual([401, 401]);
  expect(refreshes).toBe(1);
  expect(calls).toBe(4);
});

test("uses a token already refreshed elsewhere without refreshing again", async () => {
  let reads = 0, refreshes = 0;
  const tokens: (string | null)[] = [];
  const request = createAuthenticatedReasonAIRequest({ getSession: async () => session(++reads === 1 ? "old" : "updated"), refreshSession: async () => { refreshes++; return session("unused"); } }, async (_url, init) => {
    tokens.push(new Headers(init?.headers).get("Authorization")); return Response.json({}, { status: tokens.length === 1 ? 401 : 200 });
  });
  expect((await request(endpoint, "{}")).status).toBe(200);
  expect(tokens).toEqual(["Bearer old", "Bearer updated"]);
  expect(refreshes).toBe(0);
});

for (const status of [200, 403, 429, 502, 503]) test(`HTTP ${status} does not retry or refresh`, async () => {
  let calls = 0, refreshes = 0;
  const request = createAuthenticatedReasonAIRequest({ getSession: async () => session("token"), refreshSession: async () => { refreshes++; return session("fresh"); } }, async () => { calls++; return Response.json({}, { status }); });
  expect((await request(endpoint, "{}")).status).toBe(status);
  expect([calls, refreshes]).toEqual([1, 0]);
});

test("missing session returns 401 without trying refresh; tokens cannot leave the tutor endpoints", async () => {
  let calls = 0, refreshes = 0;
  const request = createAuthenticatedReasonAIRequest({ getSession: async () => session(null), refreshSession: async () => { refreshes++; return session(null); } }, async (_url, init) => {
    calls++; expect(new Headers(init?.headers).has("Authorization")).toBe(false); return Response.json({}, { status: 401 });
  });
  expect((await request(endpoint, "{}")).status).toBe(401);
  await expect(request("https://untrusted.test" as ReasonAIEndpoint, "{}")).rejects.toThrow("Unsupported");
  expect([calls, refreshes]).toEqual([1, 0]);
});

for (const status of [400, 401, 403, 429, 500]) test(`refresh failure ${status} distinguishes expired credentials from temporary failure`, async () => {
  const request = createAuthenticatedReasonAIRequest({ getSession: async () => session("old"), refreshSession: async () => session(null, new AuthApiError("private detail", status, undefined)) }, async () => Response.json({}, { status: 401 }));
  if (status < 429) expect((await request(endpoint, "{}")).status).toBe(401);
  else await expect(request(endpoint, "{}")).rejects.toThrow("temporarily unavailable");
});

test("cancellation during refresh never resubmits a request", async () => {
  const controller = new AbortController(); let calls = 0;
  const request = createAuthenticatedReasonAIRequest({ getSession: async () => session("old"), refreshSession: async () => { controller.abort(); return session("fresh"); } }, async () => { calls++; return Response.json({}, { status: 401 }); });
  await expect(request(endpoint, "{}", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(1);
});

test("conversation resources use the same bearer refresh path without changing GET semantics", async () => {
  const calls: RequestInit[] = [];
  const request = createAuthenticatedReasonAIFetch({ getSession: async () => session("token"), refreshSession: async () => session("unused") }, async (_url, init) => {
    calls.push(init!);
    return Response.json({});
  });
  expect((await request("/api/reasonai/conversations/10000000-0000-4000-8000-000000000001", { method: "GET" })).status).toBe(200);
  expect(calls[0].method).toBe("GET");
  expect(new Headers(calls[0].headers).get("Authorization")).toBe("Bearer token");
  expect(calls[0].body).toBeUndefined();
  await expect(request("/api/reasonai/conversations/not-a-uuid" as never)).rejects.toThrow("Unsupported");
});

for (const [name, error, status] of [
  ["invalid JWT", new AuthApiError("sensitive JWT detail", 401, undefined), 401],
  ["missing session", new AuthApiError("missing session", 400, undefined), 401],
  ["revoked user", new AuthApiError("revoked", 403, undefined), 401],
  ["rate limit", new AuthApiError("rate limited", 429, undefined), 503],
  ["auth service down", new AuthApiError("upstream detail", 500, undefined), 503],
  ["network failure", new AuthRetryableFetchError("private URL", 0), 503],
] as const) test(`server verification: ${name} returns ${status}`, async () => {
  const auth = { getUser: async (token?: string) => { expect(token).toBe("current-token"); return { data: { user: null }, error }; } } as Pick<SupabaseClient["auth"], "getUser">;
  const response = (await validateApiUser(auth, "current-token"))!;
  expect(response.status).toBe(status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).not.toContain(error.message);
});

test("server requires a verified user and treats thrown verification errors as unavailable", async () => {
  const auth = (getUser: unknown) => ({ getUser }) as Pick<SupabaseClient["auth"], "getUser">;
  expect(await validateApiUser(auth(async () => ({ data: { user: { id: "verified" } }, error: null })))).toBeUndefined();
  expect((await validateApiUser(auth(async () => ({ data: { user: null }, error: null }))))?.status).toBe(401);
  expect((await validateApiUser(auth(async () => { throw new Error("private network data"); })))?.status).toBe(503);
});
