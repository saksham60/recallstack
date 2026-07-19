import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./types";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { createApiError } from "./errors";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    // Note: this middleware runs on the client. 
    // Server components shouldn't use this fetcher if they need auth, unless we pass headers explicitly.
    if (typeof window !== "undefined") {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        request.headers.set("Authorization", `Bearer ${session.access_token}`);
      }
    }
    return request;
  },
  async onResponse({ response }) {
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.clone().json();
      } catch {
        errorData = { detail: response.statusText };
      }
      throw createApiError(response.status, errorData);
    }
    return response;
  }
};

export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL });
apiClient.use(authMiddleware);

