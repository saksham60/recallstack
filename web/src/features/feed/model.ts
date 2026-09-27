import { z } from "zod";
import type { components } from "@/lib/api/types";
import { safeExternalUrl as externalUrl } from "@/lib/http/safe-external-url";

export type FeedStory = components["schemas"]["StoryResponse"];
export type FeedPage = components["schemas"]["FeedResponse"];
export type FeedEvent = components["schemas"]["EventInput"];

// Generated types describe the contract; validation isolates malformed individual stories.
export const storySchema: z.ZodType<FeedStory> = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(1000),
  summary: z.string().trim().min(1).max(12000),
  whyItMatters: z.string().max(12000),
  source: z.object({ key: z.string().min(1).max(200), name: z.string().min(1).max(300) }),
  sourceUrl: z.string().refine((value) => Boolean(externalUrl(value))),
  imageUrl: z.unknown().transform((value) => externalUrl(value) ?? ""),
  publishedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  topics: z.array(z.string().min(1).max(80)).max(50),
  importanceScore: z.number(),
  qualityScore: z.number(),
  viewerState: z.object({ saved: z.boolean(), seenAt: z.string().nullable() }),
});

export function parseFeedPage(value: unknown): FeedPage {
  const page = z.object({ items: z.array(z.unknown()).max(50), nextCursor: z.string().max(2048).nullable(), hasMore: z.boolean() }).parse(value);
  if (page.hasMore && !page.nextCursor) throw new Error("Incomplete feed page.");
  const items = page.items.flatMap((item) => {
    const result = storySchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
  if (page.items.length && !items.length) throw new Error("No readable stories in this response.");
  return { ...page, items };
}

export function topicLabel(topic: string) {
  return topic.split(/[-_ ]/).map((word) => ["ai", "dsa", "api", "llm"].includes(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function storyLink(id: string) { return `/feed?story=${encodeURIComponent(id)}`; }
