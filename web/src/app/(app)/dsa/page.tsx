import { redirect } from "next/navigation";
import { resolveProblem } from "@/lib/dsa-execution/catalog-server";
import { problemHref } from "@/features/dsa/navigation/urls";
import { TopicHome } from "@/features/dsa/navigation/TopicHome";

export default async function DSAPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preview = params.preview === "true";
  if (typeof params.problem === "string") {
    const problem = await resolveProblem(params.problem, typeof params.version === "string" ? params.version : undefined, preview);
    redirect(problemHref(problem, { preview, submission: typeof params.submission === "string" ? params.submission : undefined }));
  }
  return <TopicHome preview={preview} />;
}
