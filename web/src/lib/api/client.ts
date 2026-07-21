import createClient, { type Middleware } from "openapi-fetch";
import "client-only";

import type { paths } from "./types";
import { publicConfig } from "@/lib/config/public";
import { getBrowserClient } from "@/lib/supabase/client";
import { createApiError } from "./errors";

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    if (typeof window !== "undefined") {
      const supabase = getBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

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
  baseUrl: publicConfig.apiBaseUrl,
  fetch: fetchWithTimeout,
});
apiClient.use(authMiddleware);
