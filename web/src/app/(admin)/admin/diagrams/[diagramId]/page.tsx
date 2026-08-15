import { DiagramWorkspace } from "@/features/diagram/editor";

export default async function DiagramEditorPage({ params }: { params: Promise<{ diagramId: string }> }) {
  const { diagramId } = await params;
  return <DiagramWorkspace documentId={diagramId} />;
}
