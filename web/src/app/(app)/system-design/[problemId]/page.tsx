import { notFound } from "next/navigation";
import { SystemDesignEditorScreen } from "@/features/system-design";
import { getSystemDesignProblem } from "@/features/system-design/data/system-design-problems";

export default async function SystemDesignEditorPage({
  params,
}: {
  params: Promise<{ problemId: string }>;
}) {
  const { problemId } = await params;
  const problem = getSystemDesignProblem(problemId);

  if (!problem) notFound();

  return <SystemDesignEditorScreen problem={problem} />;
}
