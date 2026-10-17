export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function problemHref(
  problem: { slug: string; problem_version_id?: string },
  options: { preview?: boolean; submission?: string } = {},
) {
  const query = new URLSearchParams();
  if (problem.problem_version_id)
    query.set("version", problem.problem_version_id);
  if (options.preview) query.set("preview", "true");
  if (options.submission) query.set("submission", options.submission);
  return `/dsa/problem/${encodeURIComponent(problem.slug)}${query.size ? `?${query}` : ""}`;
}
