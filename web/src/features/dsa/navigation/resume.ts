import { z } from "zod";
const resumeSchema = z.object({
  schema: z.literal(1), slug: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/),
  problem_version_id: z.uuid(), title: z.string().min(1).max(300),
});
export function readResume(userId: string) {
  try {
    const parsed = resumeSchema.safeParse(JSON.parse(localStorage.getItem(`reasonai:dsa:resume:1:${userId}`) ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
export function rememberProblem(userId: string, problem: { slug: string; problem_version_id: string; title: string }) {
  try { localStorage.setItem(`reasonai:dsa:resume:1:${userId}`, JSON.stringify({ schema: 1, slug: problem.slug, problem_version_id: problem.problem_version_id, title: problem.title })); }
  catch { /* Resume is optional; the existing draft warning covers storage failure. */ }
}
