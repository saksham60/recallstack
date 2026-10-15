"use client";

import { useState } from "react";
import { Bookmark, Check, Pencil, Trash2 } from "lucide-react";
import {
  useBookmarked,
  useLearnerChange,
  useNotes,
  useProgress,
  type Note,
  type Status,
  type useDSAScope,
} from "./api";
import { RequestError } from "./Explorer";

type Scope = ReturnType<typeof useDSAScope>;
export function BookmarkControl({ scope, id }: { scope: Scope; id: string }) {
  const bookmark = useBookmarked(scope, id),
    change = useLearnerChange(scope, id);
  return (
    <div>
      <button
        type="button"
        className="studio-icon"
        disabled={
          !scope.userId ||
          bookmark.isPending ||
          !!bookmark.error ||
          change.isPending
        }
        aria-label={bookmark.data ? "Remove bookmark" : "Bookmark problem"}
        aria-pressed={bookmark.data ?? false}
        onClick={() =>
          change.mutate({ kind: "bookmark", bookmarked: bookmark.data! })
        }
      >
        <Bookmark size={17} fill={bookmark.data ? "currentColor" : "none"} />
      </button>
      {(bookmark.error || change.error) && (
        <RequestError
          error={bookmark.error ?? change.error}
          retry={() => {
            change.reset();
            void bookmark.refetch();
          }}
        />
      )}
    </div>
  );
}
export function LearnerPanel({ scope, id }: { scope: Scope; id: string }) {
  const progress = useProgress(scope, id),
    notes = useNotes(scope, id),
    change = useLearnerChange(scope, id);
  const [editing, setEditing] = useState<Note>();
  const [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  const [kind, setKind] = useState<Note["kind"]>("note");
  const [deleteId, setDeleteId] = useState<string>();
  const [saved, setSaved] = useState(false);
  if (!scope.userId)
    return (
      <p className="studio-empty">
        Sign in to save notes and learning progress.
      </p>
    );
  function clear() {
    setEditing(undefined);
    setTitle("");
    setBody("");
    setKind("note");
  }
  return (
    <div className="studio-copy">
      <h3>Learning progress</h3>
      <p className="studio-muted">
        Your self-assessment. Judged submissions will arrive with execution.
      </p>
      {progress.isPending ? (
        <p role="status">Loading progress…</p>
      ) : progress.error ? (
        <RequestError
          error={progress.error}
          retry={() => void progress.refetch()}
        />
      ) : (
        <div className="studio-progress">
          <label>
            Status
            <select
              aria-label="Learning status"
              disabled={change.isPending}
              value={progress.data?.status ?? "new"}
              onChange={(event) =>
                change.mutate({
                  kind: "progress",
                  status: event.target.value as Status,
                  confidence: progress.data!.confidence,
                  rowVersion: progress.data!.row_version,
                })
              }
            >
              {["new", "learning", "attempted", "confident", "mastered"].map(
                (status) => (
                  <option key={status}>{status}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Confidence <b>{progress.data?.confidence}%</b>
            <input
              aria-label="Confidence"
              type="range"
              min={0}
              max={100}
              defaultValue={progress.data?.confidence ?? 0}
              key={progress.data?.row_version}
              disabled={change.isPending}
              onPointerUp={(event) => {
                const value = Number(event.currentTarget.value);
                if (value !== progress.data!.confidence)
                  change.mutate({
                    kind: "progress",
                    status: progress.data!.status,
                    confidence: value,
                    rowVersion: progress.data!.row_version,
                  });
              }}
              onKeyUp={(event) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "Home",
                    "End",
                    "PageUp",
                    "PageDown",
                  ].includes(event.key)
                ) {
                  const value = Number(event.currentTarget.value);
                  if (value !== progress.data!.confidence)
                    change.mutate({
                      kind: "progress",
                      status: progress.data!.status,
                      confidence: value,
                      rowVersion: progress.data!.row_version,
                    });
                }
              }}
            />
          </label>
        </div>
      )}
      <h3>Notes & insights</h3>
      {notes.error && (
        <RequestError error={notes.error} retry={() => void notes.refetch()} />
      )}
      {notes.isPending && <p role="status">Loading notes…</p>}
      {notes.data?.pages
        .flatMap((page) => page.items)
        .map((note) => (
          <article key={note.id} className="studio-note">
            <div className="studio-note-heading">
              <span className="studio-badge">{note.kind}</span>
              <span>
                <button
                  type="button"
                  className="studio-icon"
                  aria-label={`Edit ${note.title || "note"}`}
                  disabled={change.isPending}
                  onClick={() => {
                    setEditing(note);
                    setTitle(note.title ?? "");
                    setBody(note.body);
                    setKind(note.kind);
                    setSaved(false);
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="studio-icon"
                  aria-label={`Delete ${note.title || "note"}`}
                  disabled={change.isPending}
                  onClick={() => setDeleteId(note.id)}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
            {note.title && <h4>{note.title}</h4>}
            <p className="studio-prewrap">{note.body}</p>
            {deleteId === note.id && (
              <div className="studio-notice">
                <p>Delete this note?</p>
                <button
                  type="button"
                  disabled={change.isPending}
                  onClick={() =>
                    change.mutate(
                      { kind: "delete-note", note },
                      {
                        onSuccess: () => {
                          setDeleteId(undefined);
                          if (editing?.id === note.id) clear();
                        },
                      },
                    )
                  }
                >
                  Delete note
                </button>
                <button type="button" onClick={() => setDeleteId(undefined)}>
                  Keep note
                </button>
              </div>
            )}
          </article>
        ))}
      {notes.hasNextPage && (
        <button
          type="button"
          disabled={notes.isFetchingNextPage}
          onClick={() => void notes.fetchNextPage()}
        >
          Load more notes
        </button>
      )}
      <form
        className="studio-note-form"
        onSubmit={(event) => {
          event.preventDefault();
          change.mutate(
            editing
              ? {
                  kind: "edit-note",
                  note: editing,
                  title,
                  body,
                  noteKind: kind,
                }
              : { kind: "create-note", title, body, noteKind: kind },
            {
              onSuccess: () => {
                clear();
                setSaved(true);
              },
            },
          );
        }}
      >
        <h4>{editing ? "Edit note" : "Add a note"}</h4>
        <label>
          Kind
          <select
            aria-label="Note kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as Note["kind"])}
          >
            <option>note</option>
            <option>mistake</option>
            <option>insight</option>
          </select>
        </label>
        <label>
          Title
          <input
            aria-label="Note title"
            maxLength={240}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label>
          Note
          <textarea
            required
            aria-label="Note body"
            maxLength={100000}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <div className="studio-actions">
          <button
            className="studio-primary"
            type="submit"
            disabled={change.isPending || !body.trim()}
          >
            {change.isPending
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Save note"}
          </button>
          {editing && (
            <button type="button" onClick={clear}>
              Cancel edit
            </button>
          )}
          {saved && (
            <span role="status">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
      </form>
      {change.error && (
        <div role="alert" className="studio-notice">
          {change.error.message} Your text is retained. Load the latest saved
          version before retrying a conflict.
          <button
            type="button"
            onClick={async () => {
              const latest = await notes.refetch();
              if (editing) {
                const savedNote = latest.data?.pages
                  .flatMap((page) => page.items)
                  .find((note) => note.id === editing.id);
                if (savedNote) setEditing(savedNote);
              }
              await progress.refetch();
              change.reset();
            }}
          >
            Load latest version and keep my edits
          </button>
        </div>
      )}
    </div>
  );
}
