import type { VisualLesson, VisualStep } from "../../src/features/dsa/reasonai/visual-contract";

export const visualStep: VisualStep = {
  title: "Compare the endpoints", explanation: "The highlighted values add to 7. This is an illustrative example of comparing endpoints in sorted data.",
  values: ["1", "2", "4", "6"], highlights: [0, 3], pointers: [{ label: "left", index: 0 }, { label: "right", index: 3 }],
  nodes: [], edges: [], rows: [], activeCells: [], variables: [{ name: "sum", value: "7" }],
};
export const visualLesson: VisualLesson = {
  title: "Reading sorted order", summary: "Watch how the comparison changes when a pointer moves. This is an illustrative concept example, not the full problem solution.",
  kind: "array", basis: "illustrative", steps: [visualStep,
    { ...visualStep, title: "Move one position", explanation: "Advancing the left pointer increases its value from 1 to 2. The right value stays 6.", highlights: [1, 3], pointers: [{ label: "left", index: 1 }, { label: "right", index: 3 }], variables: [{ name: "sum", value: "8" }] },
    { ...visualStep, title: "Notice the invariant", explanation: "The order tells us the direction of the change. Stop here and predict what moving the right pointer left would do." },
  ],
};
