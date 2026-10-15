"use client";

import { memo, useLayoutEffect, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

loader.config({ paths: { vs: "/monaco/vs" } });
type Props = {
  value: string;
  language: string;
  path: string;
  view?: editor.ICodeEditorViewState | null;
  onChange: (code: string) => void;
  onView: (view: editor.ICodeEditorViewState | null) => void;
  onRun: () => void;
  onSubmit: () => void;
};
function CodeEditor({
  value,
  language,
  path,
  view,
  onChange,
  onView,
  onRun,
  onSubmit,
}: Props) {
  const latest = useRef({ onChange, onView, onRun, onSubmit });
  // Events read the latest callbacks without recreating the editor or its model.
  useLayoutEffect(() => {
    latest.current = { onChange, onView, onRun, onSubmit };
  }, [onChange, onView, onRun, onSubmit]);
  return (
    <Editor
      height="100%"
      path={path}
      language={language}
      value={value}
      theme="vs-dark"
      loading={<p className="studio-empty">Loading code editor…</p>}
      options={{
        automaticLayout: true,
        ariaLabel: "Solution code",
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        wordWrap: "on",
        padding: { top: 20 },
        tabSize: 4,
        autoIndent: "full",
        matchBrackets: "always",
        bracketPairColorization: { enabled: true },
      }}
      onChange={(code) => {
        if ((code?.length ?? 0) <= 24000) latest.current.onChange(code ?? "");
      }}
      onMount={(instance, monaco) => {
        instance.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF);
        if (view) {
          try {
            instance.restoreViewState(view);
          } catch {
            /* Ignore an incompatible old view. */
          }
        }
        const save = () => latest.current.onView(instance.saveViewState());
        instance.onDidChangeCursorPosition(save);
        instance.onDidScrollChange(save);
        instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
          latest.current.onRun(),
        );
        instance.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
          () => latest.current.onSubmit(),
        );
        instance.onDidChangeModelContent(() => {
          if ((instance.getModel()?.getValueLength() ?? 0) > 24000)
            instance.trigger("size-limit", "undo", null);
        });
      }}
    />
  );
}
export default memo(CodeEditor);
