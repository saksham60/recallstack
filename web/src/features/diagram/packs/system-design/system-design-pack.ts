import type {
  DiagramInspectorFieldDefinition,
  DiagramPack,
  DiagramShapeDefinition,
} from "../../core/types";
import {
  COMMON_DIAGRAM_INSPECTOR_FIELDS,
  DEFAULT_DIAGRAM_PORTS,
} from "../../core/registry";
import {
  SYSTEM_DESIGN_NODE_DEFINITIONS,
  SYSTEM_DESIGN_NODE_TYPE_ORDER,
  isSystemDesignBoundaryNodeType,
  isSystemDesignModuleNodeType,
} from "@/features/system-design/constants/system-design-palette";
import {
  SYSTEM_DESIGN_TECHNOLOGY_IDS,
  SYSTEM_DESIGN_TECHNOLOGY_REGISTRY,
  getSystemDesignNodeVisual,
} from "@/features/system-design/constants/system-design-visual-registry";
import type { SystemDesignNodeChrome } from "@/features/system-design/constants/system-design-visual-registry";
import type {
  SystemDesignNodeCategory,
  SystemDesignNodeType,
} from "@/features/system-design/types/system-design.types";
import { SystemDesignPackRenderer } from "./SystemDesignPackRenderer";
import { SystemDesignTechnologyField } from "./SystemDesignTechnologyField";
import { renderSystemDesignShapeSvg } from "./system-design-svg";

const technologyField: DiagramInspectorFieldDefinition = {
  id: "technology",
  label: "Technology",
  section: "content",
  control: "system-design.technology",
  path: "data.technologyId",
  options: [
    { value: "", label: "None" },
    ...SYSTEM_DESIGN_TECHNOLOGY_IDS.map((id) => ({
      value: id,
      label: SYSTEM_DESIGN_TECHNOLOGY_REGISTRY[id].name,
    })),
  ],
};

const CATEGORY_LABELS: Record<SystemDesignNodeCategory | "ai", string> = {
  clients: "Clients",
  networking: "Networking",
  compute: "Compute",
  data: "Data",
  messaging: "Messaging",
  external: "External",
  modules: "Architecture",
  boundaries: "Architecture",
  annotations: "Annotations",
  ai: "AI",
};

const TECHNOLOGY_KEYWORDS: Partial<Record<SystemDesignNodeType, readonly string[]>> = {
  cdn: ["cloudfront"],
  api_gateway: ["nginx", "kong"],
  service: ["docker", "kubernetes"],
  serverless_function: ["aws lambda", "azure functions"],
  sql_database: ["postgresql", "postgres", "mysql", "supabase"],
  nosql_database: ["mongodb", "mongo", "firebase"],
  cache: ["redis"],
  search_engine: ["elasticsearch", "opensearch"],
  object_storage: ["s3", "amazon s3"],
  message_queue: ["rabbitmq"],
  event_stream: ["kafka"],
  pubsub: ["gcp pub/sub", "google pubsub"],
};

const legacyShapes: DiagramShapeDefinition[] = SYSTEM_DESIGN_NODE_TYPE_ORDER.map(
  (type) => {
    const definition = SYSTEM_DESIGN_NODE_DEFINITIONS[type];
    const visual = getSystemDesignNodeVisual(type);
    const isFrame = isSystemDesignBoundaryNodeType(type);
    return {
      id: `system-design.${type}`,
      packId: "system-design",
      label: definition.label,
      category: definition.category,
      keywords: [
        definition.label.toLowerCase(),
        definition.tooltip.toLowerCase(),
        type.replaceAll("_", " "),
        ...(TECHNOLOGY_KEYWORDS[type] ?? []),
      ],
      icon: definition.iconKey,
      rendererId: "system-design.semantic",
      defaultSize: {
        width: definition.defaultWidth,
        height: definition.defaultHeight,
      },
      minimumSize: isFrame ? { width: 160, height: 100 } : { width: 96, height: 56 },
      resize: { horizontal: true, vertical: true },
      rotatable: !isFrame && !isSystemDesignModuleNodeType(type),
      ports: isFrame ? [] : DEFAULT_DIAGRAM_PORTS,
      defaultStyle: {
        fill: isFrame ? `${visual.softAccent}55` : "#18181b",
        stroke: visual.accent,
        strokeWidth: 1.5,
        strokeStyle: isFrame ? "dashed" : "solid",
        opacity: 1,
        cornerRadius: 10,
      },
      defaultTextStyle: {
        color: "#fafafa",
        fontSize: 14,
        fontWeight: "medium",
        align: "center",
        verticalAlign: "middle",
        padding: 12,
      },
      inspector:
        definition.category === "annotations"
          ? COMMON_DIAGRAM_INSPECTOR_FIELDS
          : [...COMMON_DIAGRAM_INSPECTOR_FIELDS, technologyField],
      isFrame,
      data: { systemDesignType: type, semanticIcon: type },
      exportSvg: renderSystemDesignShapeSvg,
    };
  },
);

function extended(
  id: string,
  label: string,
  category: SystemDesignNodeCategory | "ai",
  semanticIcon: string,
  keywords: readonly string[],
): DiagramShapeDefinition {
  const semanticChrome: SystemDesignNodeChrome =
    id === "vector_database" || id === "vector_store"
      ? "datastore"
      : id === "reverse_proxy" || id === "model_gateway" || id === "firewall" || id === "guardrail"
        ? "gateway"
        : "compute";
  return {
    id: `system-design.${id}`,
    packId: "system-design",
    label,
    category,
    keywords,
    icon: semanticIcon,
    rendererId: "system-design.semantic",
    defaultSize: { width: 172, height: 88 },
    minimumSize: { width: 104, height: 58 },
    resize: { horizontal: true, vertical: true },
    rotatable: true,
    ports: DEFAULT_DIAGRAM_PORTS,
    defaultStyle: { fill: "#18181b", stroke: category === "ai" ? "#c084fc" : "#60a5fa", strokeWidth: 1.5, strokeStyle: "solid", opacity: 1, cornerRadius: 10 },
    defaultTextStyle: { color: "#fafafa", fontSize: 14, fontWeight: "medium", align: "center", verticalAlign: "middle", padding: 12 },
    inspector: [...COMMON_DIAGRAM_INSPECTOR_FIELDS, technologyField],
    data: { systemDesignType: id, semanticIcon, semanticChrome },
    exportSvg: renderSystemDesignShapeSvg,
  };
}

const extendedShapes = [
  extended("reverse_proxy", "Reverse Proxy", "networking", "reverse-proxy", ["reverse proxy", "nginx", "routing"]),
  extended("firewall", "Firewall", "networking", "firewall", ["firewall", "security", "network"]),
  extended("server", "Server", "compute", "server", ["server", "host", "compute"]),
  extended("kubernetes_workload", "Kubernetes Workload", "compute", "kubernetes", ["kubernetes", "pod", "deployment", "workload"]),
  extended("vector_database", "Vector Database", "data", "vector", ["vector db", "embedding", "similarity", "database"]),
  extended("llm", "LLM", "ai", "llm", ["llm", "large language model", "model"]),
  extended("ai_agent", "AI Agent", "ai", "ai-agent", ["ai agent", "agent", "autonomous"]),
  extended("embedding_model", "Embedding Model", "ai", "embedding-model", ["embedding", "model", "vector"]),
  extended("vector_store", "Vector Store", "ai", "vector", ["vector store", "retrieval", "embedding"]),
  extended("rag", "RAG Pipeline", "ai", "rag", ["rag", "retrieval augmented generation", "pipeline"]),
  extended("mcp_server", "MCP Server", "ai", "mcp-server", ["mcp", "server", "tools"]),
  extended("tool", "Tool", "ai", "tool", ["tool", "function", "action"]),
  extended("guardrail", "Guardrail", "ai", "guardrail", ["guardrail", "safety", "policy"]),
  extended("model_gateway", "Model Gateway", "ai", "gateway", ["model gateway", "routing", "llm"]),
] as const;

export const SYSTEM_DESIGN_PACK_SHAPES = [...legacyShapes, ...extendedShapes];

const categoryIds = [...new Set(SYSTEM_DESIGN_PACK_SHAPES.map((shape) => shape.category))];

export const systemDesignDiagramPack: DiagramPack = {
  id: "system-design",
  label: "System Design",
  description: "Semantic software architecture, infrastructure, data, messaging, and AI components.",
  icon: "network",
  categories: categoryIds.map((id, order) => ({
    id,
    label: CATEGORY_LABELS[id as keyof typeof CATEGORY_LABELS] ?? id,
    order,
  })),
  shapes: SYSTEM_DESIGN_PACK_SHAPES,
  renderers: { "system-design.semantic": SystemDesignPackRenderer },
  inspectorControls: { "system-design.technology": SystemDesignTechnologyField },
};

export function getSystemDesignPackShape(type: SystemDesignNodeType): DiagramShapeDefinition {
  return SYSTEM_DESIGN_PACK_SHAPES.find((shape) => shape.id === `system-design.${type}`)!;
}
