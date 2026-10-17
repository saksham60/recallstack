import { WorkspaceClient } from "@/features/dsa/workspace/WorkspaceClient";
import { resolveProblem } from "@/lib/dsa-execution/catalog-server";
import { notFound } from "next/navigation";
import { isUuid } from "@/features/dsa/navigation/urls";

export default async function DSAProblemPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ version?: string; preview?: string; submission?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const preview = query.preview === "true";
  if (query.submission && !isUuid(query.submission)) notFound();
  const problem = await resolveProblem(slug, query.version, preview);
  return <WorkspaceClient problemId={problem.id} versionId={problem.problem_version_id} preview={preview} submissionId={query.submission} />;
}
