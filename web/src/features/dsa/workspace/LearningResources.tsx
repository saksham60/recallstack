"use client";
import Link from "next/link";
import { useStudyNote } from "@/features/content/use-study-note";
import { PracticePanel } from "@/features/practice";
import { getDSAProblemContext } from "../problem";
import { safeExternalUrl } from "../reasonai/contract";

/** Preserve published attribution, related study resources and practice tracking. */
export function LearningResources({ id, slug }: { id: string; slug: string }) {
  const query = useStudyNote(slug),
    note = query.data;
  if (!note || note.content_item_id !== id || note.domain.slug !== "dsa")
    return null;
  const context = getDSAProblemContext(note);
  return (
    <details className="studio-resources">
      <summary>Sources, related resources & practice</summary>
      <div className="studio-copy">
        {context.sourceUrl && safeExternalUrl(context.sourceUrl) && (
          <p>
            <a
              href={context.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open on {context.sourceProvider || "source"}
            </a>
          </p>
        )}
        {context.remarks && <p className="studio-muted">{context.remarks}</p>}
        {!!context.companies?.length && (
          <p className="studio-muted">
            Imported source metadata: {context.companies.join(", ")} (company
            filters use separately reviewed tags).
          </p>
        )}
        {!!note.related_content.length && (
          <div>
            <h3>Related learning resources</h3>
            {note.related_content.map((p) => (
              <p key={p.content_item_id}>
                <Link href={`/content/${encodeURIComponent(p.slug)}`}>
                  {p.title}
                </Link>
              </p>
            ))}
          </div>
        )}
        <PracticePanel
          contentId={id}
          practiceResources={note.practice_resources.filter((p) =>
            safeExternalUrl(p.url),
          )}
        />
      </div>
    </details>
  );
}
