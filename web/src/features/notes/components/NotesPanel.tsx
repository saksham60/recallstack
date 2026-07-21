"use client";

import React, { useState } from "react";
import { useNotes, useCreateNote, useDeleteNote, NoteResponse } from "../use-notes";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { getApiErrorMessage } from "@/lib/api/errors";

interface NotesPanelProps {
  contentId: string;
}

export function NotesPanel({ contentId }: NotesPanelProps) {
  const { data: notesData, isLoading, error: notesError } = useNotes(contentId);
  const notes = notesData?.items;
  const { mutate: createNote, isPending: isCreating, error: createError } = useCreateNote();
  const { mutate: deleteNote, error: deleteError } = useDeleteNote();
  
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNoteKind, setNewNoteKind] = useState<"note" | "mistake" | "insight">("note");

  const handleAdd = () => {
    if (!newNoteBody.trim()) return;
    createNote({
      contentId,
      kind: newNoteKind,
      body: newNoteBody,
    }, {
      onSuccess: () => {
        setNewNoteBody("");
        setIsAdding(false);
      }
    });
  };

  const handleDelete = (note: NoteResponse) => {
    if (confirm("Are you sure you want to delete this note?")) {
      deleteNote({ noteId: note.id, contentId, rowVersion: note.row_version });
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
        <h3 className="font-semibold">My Notes</h3>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="text-xs font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
          >
            <span>+</span> Add Note
          </button>
        )}
      </div>

      {isAdding && (
        <div className="mb-4 bg-surface-elevated p-3 rounded-lg border border-border">
          <div className="flex gap-2 mb-2">
            {(["note", "insight", "mistake"] as const).map(kind => (
              <button
                key={kind}
                onClick={() => setNewNoteKind(kind)}
                className={`text-xs px-2 py-1 rounded capitalize ${newNoteKind === kind ? "bg-accent text-accent-foreground" : "bg-surface text-muted hover:text-foreground"}`}
              >
                {kind}
              </button>
            ))}
          </div>
          <textarea
            value={newNoteBody}
            onChange={(e) => setNewNoteBody(e.target.value)}
            placeholder="Write your note..."
            className="w-full bg-surface border border-border rounded p-2 text-sm text-foreground focus:outline-none focus:border-accent min-h-[80px]"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2">
            <button 
              onClick={() => setIsAdding(false)}
              className="text-xs px-3 py-1.5 rounded hover:bg-surface text-muted"
            >
              Cancel
            </button>
            <button 
              onClick={handleAdd}
              disabled={isCreating || !newNoteBody.trim()}
              className="text-xs px-3 py-1.5 bg-accent text-accent-foreground rounded font-medium disabled:opacity-50"
            >
              {isCreating ? "Saving..." : "Save"}
            </button>
          </div>
          {createError && (
            <p className="mt-2 text-xs text-danger" role="alert">
              {getApiErrorMessage(createError, "Failed to create note.")}
            </p>
          )}
        </div>
      )}

      {notesError ? (
        <ErrorState
          title="Failed to load notes"
          description={getApiErrorMessage(notesError, "Please try again later.")}
          className="p-4"
        />
      ) : isLoading ? (
        <div className="space-y-3">
          <div className="h-20 bg-surface-elevated animate-pulse rounded-lg" />
          <div className="h-20 bg-surface-elevated animate-pulse rounded-lg" />
        </div>
      ) : notes && notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map(note => (
            <div key={note.id} className="group p-3 rounded-lg border border-border bg-surface-elevated text-sm relative">
              <div className="flex justify-between items-start mb-1">
                <Badge variant={note.kind === "mistake" ? "danger" : note.kind === "insight" ? "warning" : "secondary"}>
                  {note.kind}
                </Badge>
                <button 
                  onClick={() => handleDelete(note)}
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-opacity"
                  title="Delete Note"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
              <div className="text-foreground/90 whitespace-pre-wrap">{note.body}</div>
              <div className="text-[10px] text-muted mt-2 text-right">
                {new Date(note.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !isAdding && <p className="text-sm text-muted italic text-center py-4">No notes yet. Add one to remember key insights.</p>
      )}
      {deleteError && (
        <p className="mt-3 text-xs text-danger" role="alert">
          {getApiErrorMessage(deleteError, "Failed to delete note.")}
        </p>
      )}
    </div>
  );
}
