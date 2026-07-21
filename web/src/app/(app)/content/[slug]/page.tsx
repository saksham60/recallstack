import { StudyNoteScreen } from "@/features/content";

export default async function StudyNotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StudyNoteScreen slug={slug} />;
}
