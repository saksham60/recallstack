import { Suspense } from "react";
import type { Metadata } from "next";
import { FeedScreen, FeedSkeleton } from "@/features/feed";

export const metadata: Metadata = { title: "Knowledge Feed | ReasonAI" };

export default function FeedPage() {
  return <Suspense fallback={<div className="mx-auto max-w-[610px]"><FeedSkeleton /></div>}><FeedScreen /></Suspense>;
}
