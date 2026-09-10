import type { ButtonHTMLAttributes, ReactNode } from "react";

export const editorIconButtonClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-muted transition-colors duration-150 hover:bg-[var(--editor-control-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40";

export const editorGhostButtonClass =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-2.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-[var(--editor-control-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40";

export const editorSecondaryButtonClass =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--editor-border)] bg-[var(--editor-control)] px-2.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-[var(--editor-border-strong)] hover:bg-[var(--editor-control-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40";

export function EditorIconButton({
  label,
  active,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`${editorIconButtonClass} ${
        active
          ? "border-[var(--editor-border-strong)] bg-[var(--editor-control-active)] text-accent"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
