import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { publicConfig } from "@/lib/config/public";
import { createClient } from "@/lib/supabase/server";

const taxonomy = z.object({ id: z.uuid(), slug: z.string(), name: z.string() });
const item = z.object({
  id: z.uuid(),
  problem_version_id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  categories: z.array(taxonomy),
  topics: z.array(taxonomy),
});

async function catalogRead(
  path: string,
  query: URLSearchParams,
  preview = false,
  refresh = false,
) {
  const headers = new Headers();
  if (preview) {
    // Forward the session; backend verifies reviewer permission.
    const client = await createClient();
    const { data } = await client.auth.getSession();
    if (data.session)
      headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  const url = new URL(
    path,
    process.env.DSA_API_BASE_URL || publicConfig.apiBaseUrl,
  );
  url.search = query.toString();
  const response = await fetch(url, {
    headers,
    // Only unauthenticated taxonomy can be shared. Problem resolution and every
    // reviewer-preview request retain their original no-store semantics.
    ...(!preview && !refresh && path === "/api/v1/dsa/categories"
      ? { cache: "force-cache" as const, next: { revalidate: 60, tags: ["dsa-public-categories"] } }
      : { cache: "no-store" as const }),
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error(
      "The DSA catalog could not resolve this link. Please retry.",
    );
  return response.json() as Promise<unknown>;
}

export async function resolveProblem(
  identifier: string,
  version?: string,
  preview = false,
) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(identifier)) notFound();
  if (version && !z.uuid().safeParse(version).success) notFound();
  const query = new URLSearchParams({
    problem: identifier,
    preview: String(preview),
  });
  if (version) query.set("problem_version_id", version);
  return item.parse(await catalogRead("/api/v1/dsa/resolve", query, preview));
}

export async function resolveTopic(identifier: string, preview = false) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(identifier)) notFound();
  const schema = z.object({ items: z.array(taxonomy) });
  const query = new URLSearchParams({ preview: String(preview) });
  const data = schema.parse(await catalogRead("/api/v1/dsa/categories", query, preview));
  let topic = data.items.find(
    (entry) => entry.slug === identifier || entry.id === identifier,
  );
  // A newly published/renamed category must work before the public cache's next
  // revalidation. The backend remains the single source of category identity.
  if (!topic && !preview) {
    const fresh = schema.parse(await catalogRead("/api/v1/dsa/categories", query, false, true));
    topic = fresh.items.find(entry => entry.slug === identifier || entry.id === identifier);
  }
  if (!topic) notFound();
  return topic;
}
