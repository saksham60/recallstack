import "server-only";
import { createClient as createStatelessClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { publicConfig } from "@/lib/config/public";
import { createClient } from "./server";

import { authRequired, authUnavailable, resolveApiUser } from "./api-auth-result";

export interface AuthenticatedApiContext {
  user: User;
  supabase: SupabaseClient;
}

/** Returns the verified user and a user-scoped client whose queries remain subject to RLS. */
export async function authenticateApiRequestWithContext(
  request: Request,
): Promise<AuthenticatedApiContext | Response> {
  try {
    const authorization = request.headers.get("authorization");
    if (authorization !== null) {
      const token = /^Bearer ([^\s]{1,8192})$/i.exec(authorization)?.[1];
      if (!token) return authRequired();
      const client = createStatelessClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          headers: { Authorization: `Bearer ${token}` },
          // Persistence finalization must not inherit an already-aborted HTTP request.
          fetch: (input, init) => fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
              : AbortSignal.timeout(8000),
          }),
        },
      });
      const user = await resolveApiUser(client.auth, token);
      return user instanceof Response ? user : { user, supabase: client };
    }
    const client = await createClient();
    const user = await resolveApiUser(client.auth);
    return user instanceof Response ? user : { user, supabase: client };
  } catch { return authUnavailable(); }
}

/** Verify tokens with Supabase; never authorize from client-decoded claims. */
export async function authenticateApiRequest(request: Request): Promise<Response | undefined> {
  const result = await authenticateApiRequestWithContext(request);
  return result instanceof Response ? result : undefined;
}
