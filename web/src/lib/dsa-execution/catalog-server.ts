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
    cache: "no-store",
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
  const data = z
    .object({ items: z.array(taxonomy) })
    .parse(
      await catalogRead(
        "/api/v1/dsa/categories",
        new URLSearchParams({ preview: String(preview) }),
        preview,
      ),
    );
  const topic = data.items.find(
    (entry) => entry.slug === identifier || entry.id === identifier,
  );
  if (!topic) notFound();
  return topic;
}
