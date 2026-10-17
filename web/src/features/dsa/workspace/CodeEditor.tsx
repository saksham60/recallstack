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
      theme="reasonai-studio"
      loading={<p className="studio-empty">Loading code editor…</p>}
      options={{
        automaticLayout: true,
        ariaLabel: "Solution code",
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 23,
        fontFamily: "'Cascadia Code', Consolas, 'SFMono-Regular', monospace",
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        wordWrap: "on",
        padding: { top: 16, bottom: 24 },
        lineNumbersMinChars: 3,
        glyphMargin: false,
        renderLineHighlight: "gutter",
        scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9 },
        tabSize: 4,
        autoIndent: "full",
        matchBrackets: "always",
        bracketPairColorization: { enabled: true },
      }}
      onChange={(code) => {
        if ((code?.length ?? 0) <= 24000) latest.current.onChange(code ?? "");
      }}
      beforeMount={(monaco) =>
        monaco.editor.defineTheme("reasonai-studio", {
          base: "vs-dark",
          inherit: true,
          rules: [
            { token: "keyword", foreground: "AB8CFF" },
            { token: "string", foreground: "DFC078" },
            { token: "number", foreground: "A9CCFC" },
            { token: "comment", foreground: "71849C" },
          ],
          colors: {
            "editor.background": "#0E1118",
            "editor.foreground": "#D0D7E6",
            "editorLineNumber.foreground": "#68718B",
            "editorLineNumber.activeForeground": "#C1AFEB",
            "editor.selectionBackground": "#61459466",
            "editorCursor.foreground": "#F6F2FF",
          },
        })
      }
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
