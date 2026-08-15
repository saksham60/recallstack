import type { DiagramPositionedElement } from "../types";
import type { DiagramElementPatch } from "../state";

export type DiagramArrangeCommand = "align-left" | "align-center" | "align-right" | "align-top" | "align-middle" | "align-bottom" | "distribute-horizontal" | "distribute-vertical" | "match-width" | "match-height";

export function arrangeDiagramElements(elements: readonly DiagramPositionedElement[], command: DiagramArrangeCommand): Record<string, DiagramElementPatch> {
  if (elements.length < 2) return {};
  const left = Math.min(...elements.map((element) => element.x));
  const right = Math.max(...elements.map((element) => element.x + element.width));
  const top = Math.min(...elements.map((element) => element.y));
  const bottom = Math.max(...elements.map((element) => element.y + element.height));
  const patches: Record<string, DiagramElementPatch> = {};
  if (command === "distribute-horizontal") {
    const ordered = [...elements].sort((a, b) => a.x - b.x);
    const width = ordered.reduce((sum, element) => sum + element.width, 0);
    const gap = (right - left - width) / Math.max(1, ordered.length - 1);
    let x = left;
    for (const element of ordered) { patches[element.id] = { x }; x += element.width + gap; }
    return patches;
  }
  if (command === "distribute-vertical") {
    const ordered = [...elements].sort((a, b) => a.y - b.y);
    const height = ordered.reduce((sum, element) => sum + element.height, 0);
    const gap = (bottom - top - height) / Math.max(1, ordered.length - 1);
    let y = top;
    for (const element of ordered) { patches[element.id] = { y }; y += element.height + gap; }
    return patches;
  }
  for (const element of elements) {
    if (command === "align-left") patches[element.id] = { x: left };
    else if (command === "align-center") patches[element.id] = { x: (left + right - element.width) / 2 };
    else if (command === "align-right") patches[element.id] = { x: right - element.width };
    else if (command === "align-top") patches[element.id] = { y: top };
    else if (command === "align-middle") patches[element.id] = { y: (top + bottom - element.height) / 2 };
    else if (command === "align-bottom") patches[element.id] = { y: bottom - element.height };
    else if (command === "match-width") patches[element.id] = { width: elements[0].width };
    else if (command === "match-height") patches[element.id] = { height: elements[0].height };
  }
  return patches;
}
