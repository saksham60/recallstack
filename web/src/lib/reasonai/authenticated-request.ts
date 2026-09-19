type SessionResult = { data: { session: { access_token: string } | null }; error: unknown };
interface SessionAuth { getSession(): Promise<SessionResult>; refreshSession(): Promise<SessionResult> }
export type ReasonAIEndpoint = "/api/reasonai/chat" | "/api/reasonai/dsa/chat";
export type ReasonAIResourceEndpoint = ReasonAIEndpoint
  | "/api/reasonai/conversations"
  | `/api/reasonai/conversations/${string}`;
export type ReasonAIResponseMediaType = "application/json" | "application/x-ndjson";
const unavailable = () => new Error("Session verification is temporarily unavailable. Please try again.");

function allowedEndpoint(endpoint: string): endpoint is ReasonAIResourceEndpoint {
  return endpoint === "/api/reasonai/chat"
    || endpoint === "/api/reasonai/dsa/chat"
    || endpoint === "/api/reasonai/conversations"
    || /^\/api\/reasonai\/conversations\/[0-9a-f-]{36}(?:\/runs\/[0-9a-f-]{36}\/cancel)?$/i.test(endpoint);
}

/** Shared authenticated transport. Automatic 401 retries preserve method and body exactly. */
export function createAuthenticatedReasonAIFetch(auth: SessionAuth, fetcher: typeof fetch = fetch) {
  let refreshing: Promise<SessionResult> | undefined;
  return async function requestResource(
    endpoint: ReasonAIResourceEndpoint,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<Response> {
    if (!allowedEndpoint(endpoint)) throw new Error("Unsupported ReasonAI endpoint.");
    async function session() {
      try { const result = await auth.getSession(); if (result.error) throw unavailable(); return result.data.session; }
      catch { throw unavailable(); }
    }
    const current = await session();
    const send = (token?: string) => {
      signal?.throwIfAborted();
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetcher(endpoint, { ...init, signal, cache: "no-store", credentials: "same-origin", redirect: "error", headers });
    };
    const response = await send(current?.access_token);
    if (response.status !== 401) return response;
    signal?.throwIfAborted();
    // Another tab/request may already have refreshed while this request ran.
    const latest = await session();
    if (latest && latest.access_token !== current?.access_token) return send(latest.access_token);
    if (!latest) return response;
    let refreshed: SessionResult;
    try {
      refreshing ??= auth.refreshSession().finally(() => { refreshing = undefined; });
      refreshed = await refreshing;
    } catch { throw unavailable(); }
    signal?.throwIfAborted();
    if (refreshed.error) {
      const status = (refreshed.error as { status?: number }).status;
      if (status && [400, 401, 403].includes(status)) return response;
      throw unavailable();
    }
    return refreshed.data.session ? send(refreshed.data.session.access_token) : response;
  };
}

/** Client POST transport retained for the PR1/PR2 call sites. */
export function createAuthenticatedReasonAIRequest(auth: SessionAuth, fetcher: typeof fetch = fetch) {
  const request = createAuthenticatedReasonAIFetch(auth, fetcher);
  return (
    endpoint: ReasonAIEndpoint,
    body: string,
    signal?: AbortSignal,
    accept?: ReasonAIResponseMediaType,
  ) => request(endpoint, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", ...(accept ? { Accept: accept } : {}) },
  }, signal);
}
