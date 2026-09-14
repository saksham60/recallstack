import "server-only";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { publicConfig } from "@/lib/config/public";
import { createClient } from "./server";

import { authRequired, authUnavailable, validateApiUser } from "./api-auth-result";

/** Verify tokens with Supabase; never authorize from client-decoded claims. */
export async function authenticateApiRequest(request: Request): Promise<Response | undefined> {
  try {
    const authorization = request.headers.get("authorization");
    if (authorization !== null) {
      const token = /^Bearer ([^\s]{1,8192})$/i.exec(authorization)?.[1];
      if (!token) return authRequired();
      // No cookie session initialization/refresh on this path: the browser's
      // shared Supabase client owns refresh, and the server verifies its token.
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
      const client = createStatelessClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal }) },
      });
      return validateApiUser(client.auth, token);
    }
    // Compatibility for existing cookie-authenticated clients.
    return validateApiUser((await createClient()).auth);
  } catch { return authUnavailable(); }
}
