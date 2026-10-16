"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublishedStudyNoteResponse } from "@/features/content/use-study-note";

// Compatibility for generic /content links. There is only one DSA workspace.
export function DSAProblemWorkspace({ note }: { note: PublishedStudyNoteResponse }) {
  return <DSAProblemScreen slug={note.slug} />;
}
export function DSAProblemScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const href = `/dsa/problem/${encodeURIComponent(slug)}`;
  useEffect(() => { router.replace(href); }, [router, href]);
  return <p role="status" className="p-8">Opening your DSA workspace? <Link href={href}>Continue</Link></p>;
}
