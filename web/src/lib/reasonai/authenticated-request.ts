type SessionResult = { data: { session: { access_token: string } | null }; error: unknown };
interface SessionAuth { getSession(): Promise<SessionResult>; refreshSession(): Promise<SessionResult> }
export type ReasonAIEndpoint = "/api/reasonai/chat" | "/api/reasonai/dsa/chat";
const unavailable = () => new Error("Session verification is temporarily unavailable. Please try again.");

/** Client transport. Share one instance so simultaneous 401s share a refresh. */
export function createAuthenticatedReasonAIRequest(auth: SessionAuth, fetcher: typeof fetch = fetch) {
  let refreshing: Promise<SessionResult> | undefined;
  return async function request(endpoint: ReasonAIEndpoint, body: string, signal?: AbortSignal): Promise<Response> {
    if (!["/api/reasonai/chat", "/api/reasonai/dsa/chat"].includes(endpoint)) throw new Error("Unsupported ReasonAI endpoint.");
    async function session() {
      try { const result = await auth.getSession(); if (result.error) throw unavailable(); return result.data.session; }
      catch { throw unavailable(); }
    }
    const current = await session();
    const send = (token?: string) => {
      signal?.throwIfAborted();
      return fetcher(endpoint, { method: "POST", body, signal, cache: "no-store", credentials: "same-origin", redirect: "error", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
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
