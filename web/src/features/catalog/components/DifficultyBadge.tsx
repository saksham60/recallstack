import { Badge } from "@/components/ui/Badge";

export function DifficultyBadge({ difficulty }: { difficulty: string | null }) {
  if (!difficulty) return null;

  const normalized = difficulty.toLowerCase();
  const variant = normalized === "hard" ? "danger" : normalized === "medium" ? "warning" : "success";
  return <Badge variant={variant}>{difficulty}</Badge>;
}
