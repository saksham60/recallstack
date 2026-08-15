"use client";

import { useEffect, useRef } from "react";
import type { ComponentType, SVGProps } from "react";

export interface DiagramContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

interface Props {
  x: number;
  y: number;
  items: readonly DiagramContextMenuItem[];
  onClose: () => void;
}

export function DiagramContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); };
  }, [onClose]);
  return <div ref={ref} role="menu" aria-label="Diagram actions" style={{ left: x, top: y }} className="fixed z-50 max-h-[calc(100vh-16px)] w-52 overflow-y-auto rounded-lg border border-border bg-surface/98 p-1.5 shadow-2xl backdrop-blur">
    {items.map((item) => { const Icon = item.icon; return <div key={item.id}>{item.separatorBefore ? <div className="my-1 h-px bg-border" /> : null}<button type="button" role="menuitem" disabled={item.disabled} onClick={() => { item.onSelect(); onClose(); }} className={`flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[10px] transition hover:bg-surface-elevated focus:bg-surface-elevated focus:outline-none disabled:pointer-events-none disabled:opacity-35 ${item.danger ? "text-red-300" : "text-foreground"}`}>{Icon ? <Icon className="h-3.5 w-3.5 text-muted" /> : <span className="w-3.5" />}<span className="flex-1">{item.label}</span>{item.shortcut ? <kbd className="text-[9px] text-zinc-500">{item.shortcut}</kbd> : null}</button></div>; })}
  </div>;
}
