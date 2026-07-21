"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { BookmarkButton } from "@/features/bookmarks";
import { DifficultyBadge } from "@/features/catalog";
import { NotesPanel } from "@/features/notes";
import { PracticePanel } from "@/features/practice";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useStudyNote } from "../use-study-note";

const StudyNoteRenderer = dynamic(
  () => import("./StudyNoteRenderer").then((module) => module.StudyNoteRenderer),
  { ssr: false },
);

export function StudyNoteScreen({ slug }: { slug: string }) {
  const { data: note, isLoading, error } = useStudyNote(slug);

  if (isLoading) {
    return (
      <div className="flex gap-8">
        <div className="flex-1 space-y-8"><div className="h-10 w-2/3 bg-surface animate-pulse rounded" /><div className="h-6 w-full bg-surface animate-pulse rounded" /><div className="h-6 w-5/6 bg-surface animate-pulse rounded" /><div className="h-64 w-full bg-surface animate-pulse rounded" /></div>
        <div className="w-80 space-y-4"><div className="h-40 w-full bg-surface animate-pulse rounded" /></div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <ErrorState
        title="Failed to load study note"
        description={getApiErrorMessage(error, "Please try again later.")}
        action={<Link href="/dsa" className="text-accent">Return to Dashboard</Link>}
      />
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      <div className="flex-1 min-w-0">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted mb-4">
            <Link href={`/${note.domain.slug}`} className="hover:text-foreground transition-colors">{note.domain.name}</Link>
            <span>/</span>
            {note.categories.map((category, index) => (
              <span key={category.id} className="contents">
                <Link href={`/${note.domain.slug}/${category.id}`} className="hover:text-foreground transition-colors">{category.name}</Link>
                {index < note.categories.length - 1 && <span>, </span>}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-4 mb-2"><h1 className="text-3xl font-bold tracking-tight text-foreground">{note.title}</h1><BookmarkButton contentId={note.content_item_id} isBookmarked={note.is_bookmarked} /></div>
          {note.summary && <p className="text-lg text-muted">{note.summary}</p>}
        </div>
        <StudyNoteRenderer blocks={note.blocks} />
      </div>

      <div className="w-full lg:w-80 shrink-0 space-y-6">
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold mb-4 border-b border-border pb-2">Status</h3>
          <div className="flex items-center justify-between mb-4"><span className="text-sm text-muted">Difficulty</span>{note.difficulty ? <DifficultyBadge difficulty={note.difficulty} /> : <span className="text-sm text-muted">—</span>}</div>
          <div className="flex items-center justify-between mb-6"><span className="text-sm text-muted">Topics</span><div className="flex flex-wrap justify-end gap-1">{note.topics.map((topic) => <Badge key={topic.id} variant="secondary">{topic.name}</Badge>)}</div></div>
          <PracticePanel contentId={note.content_item_id} />
        </div>
        <NotesPanel contentId={note.content_item_id} />
      </div>
    </div>
  );
}
