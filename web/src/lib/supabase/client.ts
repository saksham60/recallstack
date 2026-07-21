import "client-only";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicConfig } from "@/lib/config/public";

let browserClient: SupabaseClient | undefined;

export function getBrowserClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createBrowserClient(
    publicConfig.supabaseUrl,
    publicConfig.supabaseAnonKey,
    {
      isSingleton: true,
    },
  );

  return browserClient;
}

/** @deprecated Use getBrowserClient to make singleton ownership explicit. */
export function createClient() {
  return getBrowserClient();
}
