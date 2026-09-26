import { Suspense } from "react";
import type { Metadata } from "next";
import { FeedScreen } from "@/features/feed";
import { FeedSkeleton } from "@/features/feed/StoryCard";

export const metadata: Metadata = { title: "Knowledge Feed | ReasonAI" };

export default function FeedPage() {
  return <Suspense fallback={<div className="mx-auto max-w-[720px]"><FeedSkeleton /></div>}><FeedScreen /></Suspense>;
}
