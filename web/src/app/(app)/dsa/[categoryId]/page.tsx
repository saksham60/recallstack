import { CategoryContentScreen } from "@/features/catalog";

export default async function CategoryContentPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  return <CategoryContentScreen categoryId={categoryId} domainSlug="dsa" />;
}
