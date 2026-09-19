import { Suspense } from "react";
import { CategoryContentScreen } from "@/features/catalog";

function CategoryContentFallback() {
  return <div role="status" aria-label="Loading category content" className="h-40 animate-pulse rounded-xl border border-border bg-surface" />;
}

export default async function CategoryContentPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  return <Suspense fallback={<CategoryContentFallback />}><CategoryContentScreen categoryId={categoryId} domainSlug="dsa" /></Suspense>;
}
