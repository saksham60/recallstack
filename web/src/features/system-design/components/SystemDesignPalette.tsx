"use client";

import {
  ChevronDown,
  GripVertical,
  Plus,
  Search,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import { inputClass } from "@/features/admin/components/AdminPrimitives";
import {
  getSystemDesignNodeDefinition,
  SYSTEM_DESIGN_PALETTE_CATEGORIES,
} from "../constants/system-design-palette";
import { getSystemDesignNodeVisual } from "../constants/system-design-visual-registry";
import type {
  SystemDesignNodeDefinition,
  SystemDesignNodeType,
} from "../types/system-design.types";
import { SystemDesignNodeIcon } from "./SystemDesignIcons";

export const SYSTEM_DESIGN_NODE_DRAG_MIME =
  "application/x-recallstack-system-design-node";

const RECENT_COMPONENT_LIMIT = 4;

function normalizePaletteSearch(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function matchesPaletteSearch(value: string, searchTerms: readonly string[]) {
  const normalizedValue = normalizePaletteSearch(value);
  return searchTerms.every((term) => normalizedValue.includes(term));
}

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

interface PaletteItemButtonProps {
  item: SystemDesignNodeDefinition;
  context: string;
  compact?: boolean;
  disabled: boolean;
  onAdd: (type: SystemDesignNodeType) => void;
  onStartDrag: (
    event: DragEvent<HTMLButtonElement>,
    type: SystemDesignNodeType,
  ) => void;
  onEndDrag: (
    event: DragEvent<HTMLButtonElement>,
    type: SystemDesignNodeType,
  ) => void;
}

function PaletteItemButton({
  item,
  context,
  compact = false,
  disabled,
  onAdd,
  onStartDrag,
  onEndDrag,
}: PaletteItemButtonProps) {
  const visual = getSystemDesignNodeVisual(item.type);
  const descriptionId = `system-design-palette-${context}-${item.type}-description`;

  return (
    <button
      type="button"
      draggable={!disabled}
      disabled={disabled}
      className={`group/item flex w-full items-center gap-2 rounded-md border border-transparent text-left text-xs text-foreground transition hover:border-border hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        compact ? "px-2 py-1.5" : "px-2 py-2"
      }`}
      title={item.tooltip}
      aria-label={`Add ${item.label}`}
      aria-describedby={descriptionId}
      onClick={() => onAdd(item.type)}
      onDragStart={(event) => onStartDrag(event, item.type)}
      onDragEnd={(event) => onEndDrag(event, item.type)}
    >
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-md border bg-background transition ${
          compact ? "h-7 w-7" : "h-8 w-8"
        }`}
        style={{
          borderColor: `${visual.accent}66`,
          color: visual.accent,
          boxShadow: `inset 0 0 0 1px ${visual.softAccent}`,
        }}
      >
        <SystemDesignNodeIcon type={item.type} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 whitespace-normal break-words font-medium leading-4">
        {item.label}
      </span>
      <GripVertical
        className="h-3.5 w-3.5 shrink-0 text-muted opacity-60"
        aria-hidden="true"
      />
      {!compact && (
        <Plus
          className="hidden h-3.5 w-3.5 shrink-0 text-accent group-hover/item:block"
          aria-hidden="true"
        />
      )}
      <span id={descriptionId} className="sr-only">
        {item.tooltip} Drag onto the canvas or activate to add near its center.
      </span>
    </button>
  );
}

export function SystemDesignPalette({
  onAddNode,
  onDragStart,
  onDragEnd,
  disabled = false,
  className = "",
}: SystemDesignPaletteProps) {
  const [query, setQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState(
    () => new Set(["clients", "networking"]),
  );
  const [recentTypes, setRecentTypes] = useState<SystemDesignNodeType[]>([]);
  const normalizedQuery = normalizePaletteSearch(query);
  const searchTerms = useMemo(
    () => normalizedQuery.split(/\s+/).filter(Boolean),
    [normalizedQuery],
  );
  const categories = useMemo(
    () =>
      SYSTEM_DESIGN_PALETTE_CATEGORIES.map((category) => {
        const categoryMatches = matchesPaletteSearch(
          category.label,
          searchTerms,
        );
        return {
          ...category,
          items: category.items.filter((item) => {
            if (!normalizedQuery || categoryMatches) return true;
            return matchesPaletteSearch(
              `${item.label} ${item.tooltip} ${item.type.replaceAll("_", " ")}`,
              searchTerms,
            );
          }),
        };
      }).filter((category) => category.items.length > 0),
    [normalizedQuery, searchTerms],
  );
  const recentItems = useMemo(
    () => recentTypes.map(getSystemDesignNodeDefinition),
    [recentTypes],
  );

  const rememberType = useCallback((type: SystemDesignNodeType) => {
    setRecentTypes((current) => [
      type,
      ...current.filter((candidate) => candidate !== type),
    ].slice(0, RECENT_COMPONENT_LIMIT));
  }, []);

  const handleAdd = useCallback(
    (type: SystemDesignNodeType) => {
      rememberType(type);
      onAddNode(type);
    },
    [onAddNode, rememberType],
  );

  const handleDragStart = useCallback(
    (
      event: DragEvent<HTMLButtonElement>,
      type: SystemDesignNodeType,
    ) => {
      rememberType(type);
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(SYSTEM_DESIGN_NODE_DRAG_MIME, type);
      event.dataTransfer.setData("text/plain", type);
      onDragStart?.(event, type);
    },
    [onDragStart, rememberType],
  );

  const handleDragEnd = useCallback(
    (
      event: DragEvent<HTMLButtonElement>,
      type: SystemDesignNodeType,
    ) => onDragEnd?.(event, type),
    [onDragEnd],
  );

  const setCategoryExpanded = useCallback(
    (categoryId: string, open: boolean) => {
      if (normalizedQuery) return;
      setExpandedCategories((current) => {
        if (current.has(categoryId) === open) return current;
        const next = new Set(current);
        if (open) next.add(categoryId);
        else next.delete(categoryId);
        return next;
      });
    },
    [normalizedQuery],
  );

  return (
    <aside
      className={`flex min-h-0 w-72 shrink-0 flex-col border-r border-border bg-surface ${className}`}
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
        {!normalizedQuery && !recentTypes.includes("service") && (
          <section
            aria-label="Quick add components"
            className="mb-2 rounded-md border border-accent/20 bg-accent/5 p-1.5"
          >
            <h3 className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Quick add
            </h3>
            <PaletteItemButton
              item={getSystemDesignNodeDefinition("service")}
              context="quick"
              compact
              disabled={disabled}
              onAdd={handleAdd}
              onStartDrag={handleDragStart}
              onEndDrag={handleDragEnd}
            />
          </section>
        )}

        {recentItems.length > 0 && (
          <section
            aria-label="Recently used components"
            className="mb-2 rounded-md border border-border bg-background/35 p-1.5"
          >
            <h3 className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Recently used
            </h3>
            <div className="space-y-0.5">
              {recentItems.map((item) => (
                <PaletteItemButton
                  key={item.type}
                  item={item}
                  context="recent"
                  compact
                  disabled={disabled}
                  onAdd={handleAdd}
                  onStartDrag={handleDragStart}
                  onEndDrag={handleDragEnd}
                />
              ))}
            </div>
          </section>
        )}

        {categories.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted">
            No components match “{query}”.
          </div>
        ) : (
          <div className="space-y-1">
            {categories.map((category) => (
              <details
                key={category.id}
                data-testid={`system-design-palette-category-${category.id}`}
                open={normalizedQuery ? true : expandedCategories.has(category.id)}
                onToggle={(event) =>
                  setCategoryExpanded(category.id, event.currentTarget.open)
                }
                className="group"
              >
                <summary
                  className="flex cursor-pointer list-none items-center justify-between rounded px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted transition hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
                  aria-label={`${category.label} components`}
                >
                  <span>{category.label}</span>
                  <ChevronDown
                    className="h-3.5 w-3.5 transition group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="space-y-1 pb-2">
                  {category.items.map((item) => (
                    <PaletteItemButton
                      key={item.type}
                      item={item}
                      context={category.id}
                      disabled={disabled}
                      onAdd={handleAdd}
                      onStartDrag={handleDragStart}
                      onEndDrag={handleDragEnd}
                    />
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
