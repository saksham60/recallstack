export interface ReasonAISource { id: number; title: string; url: string }
export function parseReasonAISources(value: unknown): ReasonAISource[] {
  if (!Array.isArray(value) || value.length > 6) return [];
  const seen = new Set<number>();
  return value.flatMap((source) => {
    if (!source || typeof source !== "object" || !Number.isInteger(source.id) || source.id < 1 || source.id > 6 || seen.has(source.id) || typeof source.title !== "string" || source.title.length > 200 || typeof source.url !== "string" || source.url.length > 2048) return [];
    try {
      const url = new URL(source.url);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return [];
      seen.add(source.id);
      return [{ id: source.id, title: source.title, url: url.href }];
    } catch { return []; }
  });
}
