import { Suspense } from "react";
import type { Metadata } from "next";
import { FeedScreen, FeedSkeleton } from "@/features/feed";

export const metadata: Metadata = {
  title: "Knowledge Feed | ReasonAI",
  description: "Technical stories worth understanding, one at a time. Explore the Knowledge Feed with ReasonAI.",
  openGraph: {
    title: "Knowledge Feed | ReasonAI",
    description: "Technical stories worth understanding, one at a time.",
    siteName: "ReasonAI",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function FeedPage() {
  return <Suspense fallback={<div className="mx-auto max-w-[610px]"><FeedSkeleton /></div>}><FeedScreen /></Suspense>;
}
