import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { createApiError } from "./errors";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api/v1";

interface ApiOptions extends RequestInit {
  timeoutMs?: number;
}

export async function apiClient<T = any>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 15000);

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    signal: options.signal || controller.signal,
  };

  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { detail: response.statusText };
      }
      throw createApiError(response.status, errorData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
