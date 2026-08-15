"use client";

import { SystemDesignTechnologyIcon } from "@/features/system-design/components/SystemDesignTechnologyIcon";
import {
  SYSTEM_DESIGN_TECHNOLOGY_IDS,
  SYSTEM_DESIGN_TECHNOLOGY_REGISTRY,
} from "@/features/system-design/constants/system-design-visual-registry";
import type { DiagramInspectorControlRendererProps } from "../../core/types";

export function SystemDesignTechnologyField({ value, onChange }: DiagramInspectorControlRendererProps) {
  const technology = typeof value === "string" ? value : "";
  return (
    <label className="grid gap-1 text-[10px] text-muted">
      <span>Technology</span>
      {technology ? (
        <SystemDesignTechnologyIcon
          technology={technology}
          showName
          className="rounded-md border border-border bg-background px-1.5 py-1 text-foreground"
        />
      ) : null}
      <select
        className="h-7 w-full rounded border border-border bg-background px-2 text-[11px] text-foreground outline-none transition hover:border-zinc-500 focus:border-accent"
        value={technology}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">None</option>
        {SYSTEM_DESIGN_TECHNOLOGY_IDS.map((id) => (
          <option key={id} value={id}>{SYSTEM_DESIGN_TECHNOLOGY_REGISTRY[id].name}</option>
        ))}
      </select>
    </label>
  );
}
