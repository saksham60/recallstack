"use client";

import dynamic from "next/dynamic";
const Studio = dynamic(() => import("./Workspace"), {
  ssr: false,
  loading: () => (
    <p className="p-8 text-muted" role="status">
      Opening DSA workspace…
    </p>
  ),
});
export function WorkspaceClient({
  problemId,
  versionId,
  preview,
}: {
  problemId?: string;
  versionId?: string;
  preview: boolean;
}) {
  return (
    <Studio problemId={problemId} versionId={versionId} preview={preview} />
  );
}
