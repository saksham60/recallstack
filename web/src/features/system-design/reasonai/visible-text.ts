import type { SystemDesignDiagram } from "../types/system-design.types";
import type { ReasonAIContext, ReasonAIProposal } from "./contract";

/** Plain-text cleanup only. Never render HTML or pass tool arguments through here. */
export function normalizeReasonAIVisibleText(
  value: string,
  context: ReasonAIContext | Pick<SystemDesignDiagram, "nodes" | "edges">,
  proposal?: ReasonAIProposal,
): string {
  return createReasonAIVisibleTextNormalizer(context, proposal)(value);
}

/** Precompile graph ID replacements once for a group of labels in the same render. */
export function createReasonAIVisibleTextNormalizer(
  context: ReasonAIContext | Pick<SystemDesignDiagram, "nodes" | "edges">,
  proposal?: ReasonAIProposal,
): (value: string) => string {
  const labels = new Map(context.nodes.map((node) => [node.id, node.label || "Component"]));
  for (const edge of context.edges) labels.set(edge.id, edge.label || `${labels.get(edge.sourceNodeId) ?? "Component"} → ${labels.get(edge.targetNodeId) ?? "Component"}`);
  for (const op of proposal?.operations ?? []) if (op.op === "add_node") labels.set(op.ref, op.label);
  const replacements = [...labels].sort(([a], [b]) => b.length - a.length).map(([id, label]) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { pattern: new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "g"), label };
  });
  return (value) => normalizeText(value, replacements);
}

function normalizeText(value: string, replacements: { pattern: RegExp; label: string }[]): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  let text = value.replace(/\r\n?/g, "\n");
  for (let pass = 0; pass < 2; pass++) {
    text = text.replace(/&(#x[\da-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? match;
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return (code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) || code === 10 || code === 9 ? String.fromCodePoint(code) : "";
    });
  }
  // Match complete IDs, not substrings of ordinary words or other IDs.
  for (const { pattern, label } of replacements) text = text.replace(pattern, () => label);
  text = text
    .replace(/\bnode_[\w-]+\b/g, "component")
    .replace(/\bedge_[\w-]+\b/g, "connection")
    .replace(/\bnew:[\w-]+\b/g, "new component")
    .replace(/\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/gi, "canvas element")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\\([\\`*#_|>])/g, "$1")
    .replace(/^\s*```(?:text|plaintext|markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, "$1")
    .replace(/^ {0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/^\s*\*\*\s*$/gm, "")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^([ \t]*)[-*]\s+/gm, "$1• ");

  // Flatten only recognizable pipe tables into labeled bullets, preserving cells.
  const lines = text.split("\n"), output: string[] = [];
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  const separator = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("|") && separator.test(lines[i + 1] ?? "")) {
      const headings = cells(lines[i]);
      i += 2;
      while (i < lines.length && lines[i].includes("|")) {
        output.push(`• ${cells(lines[i]).map((cell, index) => headings[index] ? `${headings[index]}: ${cell}` : cell).join("; ")}`);
        i++;
      }
      i--;
    } else output.push(lines[i]);
  }
  return output.join("\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}
