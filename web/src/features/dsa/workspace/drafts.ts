import type { editor } from "monaco-editor";

export type Draft = {
  schema: 1;
  code: string;
  approach: string;
  view?: editor.ICodeEditorViewState | null;
};
export const EMPTY_DRAFT: Draft = { schema: 1, code: "", approach: "" };

// A non-solution scaffold, derived only from the published public function
// contract. No input mode is guessed: *args/**kwargs accepts both positional
// and keyword invocation until the judge contract is independently certified.
type PublicFunctionContract = {
  function?: string | null;
  input?: string | Record<string, string> | null;
  output?: string | Record<string, string> | null;
};

function summarizeContract(value: PublicFunctionContract["input"]): string {
  const text =
    typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? Object.entries(value)
            .slice(0, 8)
            .map(([name, type]) => `${name}: ${type}`)
            .join("; ")
        : "See problem specification";
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function pythonStarterCode(
  contract: PublicFunctionContract | null | undefined,
  language: string,
): string {
  if (language !== "python") return "";
  const name = contract?.function;
  if (
    typeof name !== "string" ||
    !/^[A-Za-z_][A-Za-z_0-9]*$/.test(name) ||
    /^(False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)$/.test(name)
  ) return "";
  return [
    `def ${name}(*args, **kwargs):`,
    `    # Input: ${summarizeContract(contract?.input)}`,
    `    # Output: ${summarizeContract(contract?.output)}`,
    "    # Implement the contract above; adjust parameters once the judge input",
    "    # binding is certified. This scaffold is not a working solution.",
    '    raise NotImplementedError("Implement your solution")',
    "",
  ].join("\n");
}
export function draftKey(
  user: string,
  problem: string,
  version: string,
  language: string,
) {
  return `reasonai:dsa:draft:1:${user}:${problem}:${version}:${language}`;
}
export function readDraft(key: string, starterCode = ""): Draft {
  try {
    const draft: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      draft &&
      typeof draft === "object" &&
      "schema" in draft &&
      draft.schema === 1 &&
      "code" in draft &&
      typeof draft.code === "string" &&
      draft.code.length <= 24000 &&
      "approach" in draft &&
      typeof draft.approach === "string" &&
      draft.approach.length <= 12000
    ) {
      const view =
        "view" in draft
          ? (draft.view as editor.ICodeEditorViewState | undefined)
          : undefined;
      return {
        schema: 1,
        code: draft.code,
        approach: draft.approach,
        view:
          view &&
          Array.isArray(view.cursorState) &&
          typeof view.viewState === "object"
            ? view
            : undefined,
      };
    }
  } catch {
    /* Missing, corrupt, or restricted browser storage starts an empty draft. */
  }
  return { ...EMPTY_DRAFT, code: starterCode };
}
