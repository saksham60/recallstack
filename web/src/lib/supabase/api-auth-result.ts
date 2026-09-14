import "server-only";
import { isAuthError, type SupabaseClient } from "@supabase/supabase-js";

export const authRequired = () => Response.json({ error: "Your session has expired. Sign in to use ReasonAI.", code: "AUTH_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
export const authUnavailable = () => Response.json({ error: "Session verification is temporarily unavailable. Please try again.", code: "AUTH_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "3" } });

export async function validateApiUser(auth: Pick<SupabaseClient["auth"], "getUser">, token?: string): Promise<Response | undefined> {
  try {
    const { data, error } = await auth.getUser(token);
    if (error) return isAuthError(error) && [400, 401, 403].includes(error.status ?? 0) ? authRequired() : authUnavailable();
    return data.user ? undefined : authRequired();
  } catch { return authUnavailable(); }
}
