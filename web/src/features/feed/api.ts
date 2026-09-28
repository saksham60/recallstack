import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { getBrowserClient } from "@/lib/supabase/client";
import { parseFeedPage, storySchema, type FeedEvent } from "./model";
import type { components } from "@/lib/api/types";

let refreshing: Promise<unknown> | undefined;

/** One refresh at most; Query retries never loop on an expired session. */
async function authenticated<T>(request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try { return await request(); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    signal?.throwIfAborted();
    refreshing ??= getBrowserClient().auth.refreshSession().then(({ data, error: refreshError }) => {
      if (refreshError || !data.session) throw error;
    }).finally(() => { refreshing = undefined; });
    await refreshing;
    signal?.throwIfAborted();
    return request();
  }
}

export const feedApi = {
  async list(topic: string, cursor: string | null, signal?: AbortSignal) {
    const { data } = await authenticated(() => apiClient.GET("/api/v1/knowledge/feed", {
      params: { query: { limit: 10, ...(topic ? { topic } : {}), ...(cursor ? { cursor } : {}) } }, signal,
    }), signal);
    return parseFeedPage(data);
  },
  async story(id: string, signal?: AbortSignal) {
    const { data } = await authenticated(() => apiClient.GET("/api/v1/knowledge/stories/{storyId}", {
      params: { path: { storyId: id } }, signal,
    }), signal);
    return storySchema.parse(data);
  },
  async events(events: FeedEvent[]) {
    await authenticated(() => apiClient.POST("/api/v1/knowledge/events/batch", { body: { events } }));
  },
  async preferences(signal?: AbortSignal) {
    const { data } = await authenticated(() => apiClient.GET("/api/v1/knowledge/preferences", { signal }), signal);
    return data;
  },
  async savePreferences(topics: components["schemas"]["TopicInput-Input"][]) {
    const { data } = await authenticated(() => apiClient.PATCH("/api/v1/knowledge/preferences", { body: { topics } }));
    return data;
  },
  async startRefresh() {
    const { data } = await authenticated(() => apiClient.POST("/api/v1/knowledge/refresh-runs"));
    if (!data) throw new Error("Empty refresh response");
    return data;
  },
  async refreshAvailability(signal?: AbortSignal) {
    const { data } = await authenticated(() => apiClient.GET("/api/v1/knowledge/refresh-runs", { signal }), signal);
    return data?.available === true;
  },
  async refreshStatus(runId: string) {
    const { data } = await authenticated(() => apiClient.GET("/api/v1/knowledge/refresh-runs/{runId}", { params: { path: { runId } } }));
    if (!data) throw new Error("Empty refresh status");
    return data;
  },
};

export function retryFeedRequest(count: number, error: Error) {
  return count < 1 && (!(error instanceof ApiError) || error.status >= 500);
}

export function feedErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Your session has expired. Sign in again to continue reading.";
    if (error.status === 403) return "This feed is not available for your account.";
    if (error.status === 404) return "This story is no longer available.";
    if (error.status === 409) return "Your feed has changed. Refresh to continue reading.";
    if (error.status === 429) return "Please wait a moment before trying again.";
  }
  return "We couldn’t load this right now. Check your connection and try again.";
}
