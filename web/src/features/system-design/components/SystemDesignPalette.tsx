"use client";

import {
  ChevronDown,
  GripVertical,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { inputClass } from "@/features/admin/components/AdminPrimitives";
import { SYSTEM_DESIGN_PALETTE_CATEGORIES } from "../constants/system-design-palette";
import type { SystemDesignNodeType } from "../types/system-design.types";
import { SystemDesignNodeIcon } from "./SystemDesignIcons";

export const SYSTEM_DESIGN_NODE_DRAG_MIME =
  "application/x-recallstack-system-design-node";

export interface SystemDesignPaletteProps {
  onAddNode: (type: SystemDesignNodeType) => void;
  onDragStart?: (
    event: DragEvent<HTMLButtonElement>,
    type: SystemDesignNodeType,
  ) => void;
  onDragEnd?: (
    event: DragEvent<HTMLButtonElement>,
    type: SystemDesignNodeType,
  ) => void;
  disabled?: boolean;
  className?: string;
}

export function SystemDesignPalette({
  onAddNode,
  onDragStart,
  onDragEnd,
  disabled = false,
  className = "",
}: SystemDesignPaletteProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const categories = useMemo(
    () =>
      SYSTEM_DESIGN_PALETTE_CATEGORIES.map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          if (!normalizedQuery) return true;
          return (
            item.label.toLocaleLowerCase().includes(normalizedQuery) ||
            item.tooltip.toLocaleLowerCase().includes(normalizedQuery)
          );
        }),
      })).filter((category) => category.items.length > 0),
    [normalizedQuery],
  );

  return (
    <aside
      className={`flex min-h-0 w-64 shrink-0 flex-col border-r border-border bg-surface ${className}`}
      aria-label="System design component palette"
    >
      <div className="border-b border-border p-3">
        <h2 className="text-xs font-semibold text-foreground">Components</h2>
        <label className="relative mt-2 block">
          <span className="sr-only">Search components</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            className={`${inputClass} min-h-8 pl-8 text-xs`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search components…"
            disabled={disabled}
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {categories.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted">
            No components match “{query}”.
          </div>
        ) : (
          <div className="space-y-1">
            {categories.map((category) => (
              <details key={category.id} open className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between rounded px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:bg-surface-elevated hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <span>{category.label}</span>
                  <ChevronDown
                    className="h-3.5 w-3.5 transition group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="space-y-1 pb-2">
                  {category.items.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      draggable={!disabled}
                      disabled={disabled}
                      className="group/item flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-xs text-foreground transition hover:border-border hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                      title={item.tooltip}
                      aria-label={`Add ${item.label}`}
                      onClick={() => onAddNode(item.type)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(
                          SYSTEM_DESIGN_NODE_DRAG_MIME,
                          item.type,
                        );
                        event.dataTransfer.setData("text/plain", item.type);
                        onDragStart?.(event, item.type);
                      }}
                      onDragEnd={(event) => onDragEnd?.(event, item.type)}
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent transition group-hover/item:border-accent/50">
                        <SystemDesignNodeIcon
                          type={item.type}
                          className="h-4 w-4"
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {item.label}
                      </span>
                      <GripVertical
                        className="h-3.5 w-3.5 shrink-0 text-muted opacity-60"
                        aria-hidden="true"
                      />
                      <Plus
                        className="hidden h-3.5 w-3.5 shrink-0 text-accent group-hover/item:block"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-2 text-center text-[10px] leading-relaxed text-muted">
        Drag onto the canvas or click to add near the viewport center.
      </div>
    </aside>
  );
}
