import type { CodeAnalysis } from "../../src/lib/dsa-reports/contracts";
/** Fixture analysis, never evidence of a real provider call or actual judge result. */
export const exampleAnalysis: CodeAnalysis = {
  summary: "Consider tracking seen values to avoid repeated work.",
  complexity: {
    time: "O(n²)",
    space: "O(n)",
    explanation: "The nested scan appears quadratic in input length.",
    confidence: "medium",
    caveats: ["This is a static estimate, not a measurement."],
  },
  quality: {
    readability: "The steps are explicit.",
    naming: "Use meaningful pointer names.",
    modularity: "The function has one responsibility.",
    robustness: "Review boundary conditions.",
  },
  correctness: {
    evidence: ["The judge found a mismatch."],
    assumptions: ["Do not infer the hidden input."],
    edgeCases: ["Duplicate handling may require review."],
    invariants: ["Keep indices distinct."],
  },
  optimization: {
    approaches: ["Consider two pointers after sorting."],
    tradeoffs: ["Sorting changes order."],
    patterns: ["Two pointers"],
    suggestions: ["Reason about duplicate elimination."],
  },
  learning: {
    strengths: ["Clear iteration structure."],
    practice: ["Boundary conditions"],
    concepts: ["Loop invariants"],
    earlierAttempts:
      "Earlier verdicts alone do not establish learning improvement.",
  },
};
