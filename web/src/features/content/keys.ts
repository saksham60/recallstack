export const studyNoteKeys = {
  all: ["content"] as const,
  details: () => [...studyNoteKeys.all, "detail"] as const,
  slug: (slug: string) => [...studyNoteKeys.details(), slug] as const,
};
