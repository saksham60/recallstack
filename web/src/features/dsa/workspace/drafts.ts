import type { editor } from "monaco-editor";

export type Draft = {
  schema: 1;
  code: string;
  approach: string;
  view?: editor.ICodeEditorViewState | null;
};
export const EMPTY_DRAFT: Draft = { schema: 1, code: "", approach: "" };
export function draftKey(
  user: string,
  problem: string,
  version: string,
  language: string,
) {
  return `reasonai:dsa:draft:1:${user}:${problem}:${version}:${language}`;
}
export function readDraft(key: string): Draft {
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
  return { ...EMPTY_DRAFT };
}
