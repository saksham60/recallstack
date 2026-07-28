import { ProblemDetailScreen } from "@/features/admin";

export default async function AdminProblemPage({ params }: { params: Promise<{ problemId: string }> }) {
  const { problemId } = await params;
  return <ProblemDetailScreen problemId={problemId} />;
}
