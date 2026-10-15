import { WorkspaceClient } from "@/features/dsa/workspace/WorkspaceClient";

export default async function DSAPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <WorkspaceClient
      problemId={
        typeof params.problem === "string" ? params.problem : undefined
      }
      versionId={
        typeof params.version === "string" ? params.version : undefined
      }
      preview={params.preview === "true"}
    />
  );
}
