"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useStudyNote } from "@/features/content/use-study-note";
import { StudyNoteRenderer } from "@/features/content/components/StudyNoteRenderer";
import { Badge } from "@/components/ui/Badge";
import { BookmarkButton } from "@/features/bookmarks/components/BookmarkButton";
import { NotesPanel } from "@/features/notes/components/NotesPanel";
import { PracticePanel } from "@/features/practice/components/PracticePanel";

export default function StudyNotePage() {
  const params = useParams();
  const slug = params.slug as string;
  const { data: note, isLoading, error } = useStudyNote(slug);

  if (isLoading) {
    return (
      <div className="flex gap-8">
        <div className="flex-1 space-y-8">
          <div className="h-10 w-2/3 bg-surface animate-pulse rounded" />
          <div className="h-6 w-full bg-surface animate-pulse rounded" />
          <div className="h-6 w-5/6 bg-surface animate-pulse rounded" />
          <div className="h-64 w-full bg-surface animate-pulse rounded" />
        </div>
        <div className="w-80 space-y-4">
          <div className="h-40 w-full bg-surface animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="rounded-md bg-surface-elevated p-6 text-center border border-danger/20">
        <h3 className="text-lg font-medium text-danger">Failed to load study note</h3>
        <p className="text-muted text-sm mt-2">Please try again later.</p>
        <Link href="/dsa" className="mt-4 inline-block text-accent">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted mb-4">
            <Link href={`/${note.domain.slug}`} className="hover:text-foreground transition-colors">
              {note.domain.name}
            </Link>
            <span>/</span>
            {note.categories.map((c, i) => (
              <React.Fragment key={c.id}>
                <Link href={`/${note.domain.slug}/${c.id}`} className="hover:text-foreground transition-colors">
                  {c.name}
                </Link>
                {i < note.categories.length - 1 && <span>, </span>}
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{note.title}</h1>
            <BookmarkButton contentId={note.content_item_id} isBookmarked={note.is_bookmarked} />
          </div>
          {note.summary && <p className="text-lg text-muted">{note.summary}</p>}
        </div>

        <StudyNoteRenderer blocks={note.blocks} />
      </div>

      {/* Right Sidebar */}
      <div className="w-full lg:w-80 shrink-0 space-y-6">
        {/* Progress Context */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold mb-4 border-b border-border pb-2">Status</h3>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted">Difficulty</span>
            {note.difficulty ? (
              <Badge variant={note.difficulty === "hard" ? "danger" : note.difficulty === "medium" ? "warning" : "success"}>
                {note.difficulty}
              </Badge>
            ) : (
              <span className="text-sm text-muted">—</span>
            )}
          </div>
          
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm text-muted">Topics</span>
            <div className="flex flex-wrap justify-end gap-1">
              {note.topics.map(t => (
                <Badge key={t.id} variant="secondary">{t.name}</Badge>
              ))}
            </div>
          </div>

          <PracticePanel contentId={note.content_item_id} />
        </div>

        {/* Bookmarks & Notes */}
        <NotesPanel contentId={note.content_item_id} />
      </div>
    </div>
  );
}
