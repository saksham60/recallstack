import { permanentRedirect } from "next/navigation";
import { resolveTopic } from "@/lib/dsa-execution/catalog-server";
import { TopicBoard } from "@/features/dsa/navigation/TopicBoard";

export default async function TopicPage({ params, searchParams }: {
  params: Promise<{ topicSlug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { topicSlug } = await params;
  const preview = (await searchParams).preview === "true";
  const topic = await resolveTopic(topicSlug, preview);
  if (topicSlug !== topic.slug) permanentRedirect(`/dsa/${encodeURIComponent(topic.slug)}${preview ? "?preview=true" : ""}`);
  return <TopicBoard key={`${topic.id}:${preview}`} topic={topic} preview={preview} />;
}
