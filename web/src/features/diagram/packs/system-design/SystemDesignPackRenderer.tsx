"use client";

import { Circle, Group, Line, Rect } from "react-konva";
import type { DiagramJsonValue, DiagramShapeRendererProps } from "../../core/types";
import {
  getSystemDesignNodeVisual,
  SYSTEM_DESIGN_TECHNOLOGY_REGISTRY,
  type SystemDesignNodeChrome,
} from "@/features/system-design/constants/system-design-visual-registry";
import {
  SYSTEM_DESIGN_NODE_TYPE_ORDER,
} from "@/features/system-design/constants/system-design-palette";
import type {
  SystemDesignNodeType,
  TechnologyIdentity,
} from "@/features/system-design/types/system-design.types";
import { SystemDesignSemanticGlyph } from "@/features/system-design/components/SystemDesignSemanticGlyph";
import { SystemDesignTechnologyMark } from "@/features/system-design/components/SystemDesignTechnologyIcon";
import { GenericShapeRenderer } from "../generic";

const LEGACY_TYPES = new Set<string>(SYSTEM_DESIGN_NODE_TYPE_ORDER);

function rendererForChrome(chrome: SystemDesignNodeChrome): string {
  if (chrome === "datastore") return "generic.cylinder";
  if (chrome === "gateway") return "generic.hexagon";
  if (chrome === "identity") return "generic.person";
  if (chrome === "note" || chrome === "warning-note" || chrome === "assumption-note") return "generic.note";
  if (chrome === "ellipse") return "generic.ellipse";
  if (chrome === "diamond") return "generic.diamond";
  if (chrome === "text" || chrome === "label") return "generic.text";
  if (
    chrome === "boundary" ||
    chrome === "module-boundary" ||
    chrome === "vpc-boundary" ||
    chrome === "region-boundary" ||
    chrome === "availability-zone-boundary" ||
    chrome === "cluster-boundary" ||
    chrome === "deployment-boundary" ||
    chrome === "swimlane" ||
    chrome === "container"
  ) return "generic.frame";
  return chrome === "client" ? "generic.rounded-rectangle" : "generic.rectangle";
}

function readTechnology(value: DiagramJsonValue | undefined): TechnologyIdentity | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const id = value.id;
  const name = value.name;
  const category = value.category;
  if (typeof id !== "string" || typeof name !== "string" || typeof category !== "string") return null;
  return { id, name, category } as TechnologyIdentity;
}

function ExtendedSemanticGlyph({ icon, color }: { icon: string; color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.8, lineCap: "round" as const, lineJoin: "round" as const, listening: false };
  switch (icon) {
    case "firewall":
    case "guardrail":
      return <Line points={[16, 2, 27, 7, 25, 20, 16, 29, 7, 20, 5, 7]} closed {...stroke} />;
    case "ai-agent":
      return <><Circle x={16} y={12} radius={7} {...stroke} /><Line points={[5, 29, 7, 23, 12, 20, 20, 20, 25, 23, 27, 29]} {...stroke} /><Circle x={13} y={11} radius={1} fill={color} /><Circle x={19} y={11} radius={1} fill={color} /></>;
    case "llm":
    case "embedding-model":
      return <><Circle x={8} y={9} radius={3} {...stroke} /><Circle x={24} y={8} radius={3} {...stroke} /><Circle x={16} y={24} radius={3} {...stroke} /><Line points={[11, 10, 21, 9, 22, 11, 17, 21, 14, 21, 9, 12]} {...stroke} /></>;
    case "rag":
      return <><Rect x={3} y={6} width={8} height={20} cornerRadius={2} {...stroke} /><Circle x={18} y={16} radius={5} {...stroke} /><Line points={[11, 16, 13, 16, 23, 16, 29, 16, 26, 13, 29, 16, 26, 19]} {...stroke} /></>;
    case "tool":
      return <><Line points={[7, 26, 22, 11]} {...stroke} /><Circle x={7} y={26} radius={3} {...stroke} /><Line points={[18, 5, 24, 3, 29, 8, 27, 14, 22, 11, 18, 5]} {...stroke} /></>;
    case "mcp-server":
      return <><Rect x={4} y={5} width={24} height={22} cornerRadius={4} {...stroke} /><Line points={[10, 11, 22, 11, 10, 16, 22, 16, 10, 21, 18, 21]} {...stroke} /></>;
    case "vector":
      return <><Circle x={7} y={8} radius={2} fill={color} /><Circle x={25} y={7} radius={2} fill={color} /><Circle x={12} y={25} radius={2} fill={color} /><Circle x={25} y={23} radius={2} fill={color} /><Line points={[9, 9, 23, 8, 24, 21, 14, 24, 8, 10]} {...stroke} /></>;
    default:
      return <><Rect x={4} y={6} width={24} height={20} cornerRadius={4} {...stroke} /><Line points={[9, 12, 23, 12, 9, 18, 23, 18]} {...stroke} /></>;
  }
}

export function SystemDesignPackRenderer(props: DiagramShapeRendererProps) {
  const semanticType = String(props.element.data?.systemDesignType ?? "service");
  const legacyType = LEGACY_TYPES.has(semanticType)
    ? (semanticType as SystemDesignNodeType)
    : null;
  const visual = legacyType
    ? getSystemDesignNodeVisual(legacyType)
    : { chrome: String(props.element.data?.semanticChrome ?? "compute") as SystemDesignNodeChrome, accent: props.color, softAccent: "#27272a" };
  const technologyId = props.element.data?.technologyId;
  const technology = readTechnology(props.element.data?.technology) ??
    (typeof technologyId === "string" && technologyId in SYSTEM_DESIGN_TECHNOLOGY_REGISTRY
      ? SYSTEM_DESIGN_TECHNOLOGY_REGISTRY[technologyId as keyof typeof SYSTEM_DESIGN_TECHNOLOGY_REGISTRY]
      : null);
  const genericDefinition = {
    ...props.definition,
    rendererId: rendererForChrome(visual.chrome),
    defaultStyle: {
      ...props.definition.defaultStyle,
      stroke: props.element.style?.stroke ?? visual.accent,
    },
  };

  return (
    <Group listening={false}>
      <GenericShapeRenderer
        {...props}
        definition={genericDefinition}
        color={visual.accent}
      />
      {technology ? (
        <SystemDesignTechnologyMark technology={technology} x={12} y={12} size={28} />
      ) : (
        <Group x={12} y={12} listening={false}>
          {legacyType ? (
            <SystemDesignSemanticGlyph type={legacyType} size={28} color={visual.accent} />
          ) : (
            <ExtendedSemanticGlyph
              icon={String(props.element.data?.semanticIcon ?? semanticType)}
              color={visual.accent}
            />
          )}
        </Group>
      )}
    </Group>
  );
}
