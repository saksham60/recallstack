import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./types";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { createApiError } from "./errors";

// Validate environment in production
if (process.env.NODE_ENV === "production") {
  if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_API_BASE_URL environment variable.");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase environment variables.");
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

// Maintain a single Supabase browser client
let browserSupabaseClient: ReturnType<typeof createSupabaseClient> | null = null;
function getBrowserSupabaseClient() {
  if (typeof window === "undefined") return null;
  if (!browserSupabaseClient) {
    browserSupabaseClient = createSupabaseClient();
  }
  return browserSupabaseClient;
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    // Note: this middleware runs on the client. 
    // Server components shouldn't use this fetcher if they need auth, unless we pass headers explicitly.
    if (typeof window !== "undefined") {
      const supabase = getBrowserSupabaseClient();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        request.headers.set("Authorization", `Bearer ${session.access_token}`);
      }
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
        errorData = { detail: response.statusText || "Unknown error" };
      }
      // Add status text for better debugging
      if (!errorData.detail) {
        errorData.detail = response.statusText;
      }
      throw createApiError(response.status, errorData);
    }
    return response;
  }
};

// Custom fetch implementation with timeout
const fetchWithTimeout: typeof fetch = async (input, init) => {
  const timeoutMs = 15000;

  if (init?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);

  const abortHandler = () => {
    controller.abort(init?.signal?.reason ?? new DOMException("Aborted", "AbortError"));
  };

  if (init?.signal) {
    init.signal.addEventListener("abort", abortHandler, { once: true });
  }

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error: unknown) {
    if (controller.signal.aborted && !init?.signal?.aborted) {
      // It was our timeout
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(id);
    if (init?.signal) {
      init.signal.removeEventListener("abort", abortHandler);
    }
  }
};

export const apiClient = createClient<paths>({ 
  baseUrl: API_BASE_URL,
  fetch: fetchWithTimeout,
});
apiClient.use(authMiddleware);

