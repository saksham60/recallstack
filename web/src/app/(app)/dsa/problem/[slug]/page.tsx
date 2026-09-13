import { DSAProblemScreen } from "@/features/dsa/components/DSAProblemScreen";

export default async function DSAProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DSAProblemScreen key={slug} slug={slug} />;
}
