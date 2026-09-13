import type { PublishedStudyNoteResponse } from "@/features/content/use-study-note";
import { safeExternalUrl, type DSAProblemContext } from "./reasonai/contract";

export function getDSAProblemContext(note: PublishedStudyNoteResponse): DSAProblemContext {
  const resource = note.practice_resources.find((item) => item.is_primary) ?? note.practice_resources[0];
  // Workbook import stores optional attribution inside the recognize block.
  const source = note.blocks.find((block) => block.type === "recognize" && block.payload.source)?.payload.source;
  const metadata = source && typeof source === "object" && !Array.isArray(source) ? source as Record<string, unknown> : {};
  const companies = typeof metadata.companies === "string" ? metadata.companies.split(/[,;\n]/).map((value) => value.trim()).filter(Boolean)
    : Array.isArray(metadata.companies) ? metadata.companies.filter((value): value is string => typeof value === "string") : undefined;
  const recognize = note.blocks.find((block) => block.type === "recognize")?.payload.text;
  return {
    contentId: note.content_item_id, slug: note.slug, title: note.title,
    difficulty: note.difficulty ?? undefined,
    category: note.categories.map((category) => category.name).join(", ") || undefined,
    sourceProvider: resource?.provider_name || resource?.provider_slug || undefined,
    sourceUrl: safeExternalUrl(resource?.url),
    summary: (note.summary || (typeof recognize === "string" ? recognize : undefined))?.slice(0, 4000),
    companies: companies?.slice(0, 50).map((company) => company.slice(0, 200)),
    remarks: typeof metadata.remarks === "string" ? metadata.remarks.slice(0, 4000) : undefined,
    userApproach: "", userNotes: "", userCode: "",
  };
}
