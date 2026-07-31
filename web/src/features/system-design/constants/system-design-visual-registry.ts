import type {
  SystemDesignNodeCategory,
  SystemDesignNodeType,
  TechnologyCategory,
  TechnologyIdentity,
  TechnologyRegistryId,
} from "../types/system-design.types";

/**
 * Technology marks are intentionally bundled as small vector treatments instead
 * of loading remote logo URLs into Konva. Keeping this list closed makes imports
 * deterministic and prevents a saved diagram from becoming an image proxy.
 */
export const SYSTEM_DESIGN_TECHNOLOGY_IDS = [
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "kafka",
  "rabbitmq",
  "elasticsearch",
  "kubernetes",
  "docker",
  "aws_lambda",
  "aws_s3",
  "aws_cloudfront",
  "nginx",
  "kong",
  "firebase",
  "supabase",
  "gcp_pubsub",
] as const satisfies readonly Exclude<TechnologyRegistryId, "custom">[];

export type SystemDesignTechnologyId =
  (typeof SYSTEM_DESIGN_TECHNOLOGY_IDS)[number];

export interface SystemDesignTechnologyVisual {
  id: SystemDesignTechnologyId;
  name: string;
  shortName: string;
  mark: string;
  color: string;
  onColor: string;
  category: TechnologyCategory;
  aliases: readonly string[];
}

export const SYSTEM_DESIGN_TECHNOLOGY_REGISTRY = {
  postgresql: {
    id: "postgresql",
    name: "PostgreSQL",
    shortName: "Postgres",
    mark: "PG",
    color: "#336791",
    onColor: "#ffffff",
    category: "database",
    aliases: ["postgres", "postgre sql"],
  },
  mysql: {
    id: "mysql",
    name: "MySQL",
    shortName: "MySQL",
    mark: "MY",
    color: "#4479a1",
    onColor: "#ffffff",
    category: "database",
    aliases: ["my sql"],
  },
  mongodb: {
    id: "mongodb",
    name: "MongoDB",
    shortName: "Mongo",
    mark: "M",
    color: "#47a248",
    onColor: "#ffffff",
    category: "database",
    aliases: ["mongo"],
  },
  redis: {
    id: "redis",
    name: "Redis",
    shortName: "Redis",
    mark: "R",
    color: "#dc382d",
    onColor: "#ffffff",
    category: "cache",
    aliases: [],
  },
  kafka: {
    id: "kafka",
    name: "Apache Kafka",
    shortName: "Kafka",
    mark: "K",
    color: "#4b5563",
    onColor: "#ffffff",
    category: "messaging",
    aliases: ["apache kafka"],
  },
  rabbitmq: {
    id: "rabbitmq",
    name: "RabbitMQ",
    shortName: "Rabbit",
    mark: "RM",
    color: "#ff6600",
    onColor: "#ffffff",
    category: "messaging",
    aliases: ["rabbit mq"],
  },
  elasticsearch: {
    id: "elasticsearch",
    name: "Elasticsearch",
    shortName: "Elastic",
    mark: "ES",
    color: "#00bfb3",
    onColor: "#062e3b",
    category: "search",
    aliases: ["elastic search", "elastic"],
  },
  kubernetes: {
    id: "kubernetes",
    name: "Kubernetes",
    shortName: "K8s",
    mark: "K8",
    color: "#326ce5",
    onColor: "#ffffff",
    category: "container",
    aliases: ["k8s"],
  },
  docker: {
    id: "docker",
    name: "Docker",
    shortName: "Docker",
    mark: "D",
    color: "#2496ed",
    onColor: "#ffffff",
    category: "container",
    aliases: [],
  },
  aws_lambda: {
    id: "aws_lambda",
    name: "AWS Lambda",
    shortName: "Lambda",
    mark: "λ",
    color: "#ff9900",
    onColor: "#1f2937",
    category: "compute",
    aliases: ["lambda", "aws-lambda", "aws lambda"],
  },
  aws_s3: {
    id: "aws_s3",
    name: "Amazon S3",
    shortName: "S3",
    mark: "S3",
    color: "#569a31",
    onColor: "#ffffff",
    category: "storage",
    aliases: ["amazon s3", "aws s3"],
  },
  aws_cloudfront: {
    id: "aws_cloudfront",
    name: "Amazon CloudFront",
    shortName: "CloudFront",
    mark: "CF",
    color: "#8c4fff",
    onColor: "#ffffff",
    category: "networking",
    aliases: ["amazon cloudfront", "aws cloudfront"],
  },
  nginx: {
    id: "nginx",
    name: "NGINX",
    shortName: "NGINX",
    mark: "N",
    color: "#009639",
    onColor: "#ffffff",
    category: "networking",
    aliases: [],
  },
  kong: {
    id: "kong",
    name: "Kong Gateway",
    shortName: "Kong",
    mark: "KG",
    color: "#00b5d8",
    onColor: "#062e3b",
    category: "networking",
    aliases: ["kong gateway", "kong api gateway"],
  },
  firebase: {
    id: "firebase",
    name: "Firebase",
    shortName: "Firebase",
    mark: "F",
    color: "#ffca28",
    onColor: "#422006",
    category: "platform",
    aliases: [],
  },
  supabase: {
    id: "supabase",
    name: "Supabase",
    shortName: "Supabase",
    mark: "S",
    color: "#3ecf8e",
    onColor: "#052e25",
    category: "platform",
    aliases: [],
  },
  gcp_pubsub: {
    id: "gcp_pubsub",
    name: "Google Cloud Pub/Sub",
    shortName: "GCP Pub/Sub",
    mark: "PS",
    color: "#4285f4",
    onColor: "#ffffff",
    category: "messaging",
    aliases: [
      "gcp pubsub",
      "gcp pub/sub",
      "google pubsub",
      "google cloud pubsub",
      "google cloud pub/sub",
    ],
  },
} as const satisfies Record<
  Exclude<TechnologyRegistryId, "custom">,
  SystemDesignTechnologyVisual
>;

export interface SystemDesignTechnologyBrandPath {
  path: string;
  style: "fill" | "stroke";
}

/**
 * Local, code-native brand silhouettes shared by the DOM and Konva renderers.
 * The paths use a 24×24 view box and never resolve user-provided URLs.
 */
export const SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS = {
  postgresql: {
    path: "M6 4C3 6 3 12 5 16C6 19 9 21 12 19L13 15C15 16 18 16 20 14C22 12 21 7 18 5C15 3 9 2 6 4ZM8 7C9 6 11 6 12 8C13 6 16 6 17 8C18 10 17 12 15 13L13 12L12 17L10 18L10 12C7 12 6 9 8 7Z",
    style: "fill",
  },
  mysql: {
    path: "M3 15C6 9 11 5 20 6C17 8 15 10 14 13C13 17 10 20 6 20C8 17 8 15 3 15ZM13 9C10 9 8 11 7 13C10 14 12 12 13 9Z",
    style: "fill",
  },
  mongodb: {
    path: "M12 2C7 6 6 12 9 17C10 19 11 21 12 22C13 20 15 18 16 16C18 11 16 6 12 2ZM11.2 7H12.8V18H11.2Z",
    style: "fill",
  },
  redis: {
    path: "M12 2L22 7L12 12L2 7L12 2ZM2 11L12 16L22 11V14L12 19L2 14V11ZM2 16L12 21L22 16V19L12 24L2 19V16Z",
    style: "fill",
  },
  kafka: {
    path: "M12 3V12M5 8L12 3L19 8M5 8V16L12 21M19 8V16L12 21M5 16L12 12L19 16",
    style: "stroke",
  },
  rabbitmq: {
    path: "M7 3C7 1 10 1 10 4V8H14V4C14 1 17 1 17 3V9C20 11 21 15 19 19C17 23 7 23 5 19C3 15 4 11 7 9V3ZM8 14A1.5 1.5 0 1 0 8 17A1.5 1.5 0 0 0 8 14ZM16 14A1.5 1.5 0 1 0 16 17A1.5 1.5 0 0 0 16 14Z",
    style: "fill",
  },
  elasticsearch: {
    path: "M12 2A10 10 0 0 0 3 8H14L18 12L14 16H3A10 10 0 1 0 12 2ZM4 10H13L15 12L13 14H4A8 8 0 0 1 4 10Z",
    style: "fill",
  },
  kubernetes: {
    path: "M12 2L20 6V16L12 22L4 16V6L12 2ZM12 6A6 6 0 1 0 12 18A6 6 0 0 0 12 6ZM11 7H13V10.2L16 8.5L17 10.2L14 12L17 13.8L16 15.5L13 13.8V17H11V13.8L8 15.5L7 13.8L10 12L7 10.2L8 8.5L11 10.2V7Z",
    style: "fill",
  },
  docker: {
    path: "M3 11H6V8H9V11H12V8H15V11H18V8H21V12H23C22 17 18 20 12 20C7 20 4 17 3 13H1V11H3ZM6 4H9V7H6V4ZM10 4H13V7H10V4ZM14 4H17V7H14V4Z",
    style: "fill",
  },
  aws_lambda: {
    path: "M8 2H13L21 21H16L12 11L8 21H3L10 6L8 2Z",
    style: "fill",
  },
  aws_s3: {
    path: "M12 2L21 7V17L12 22L3 17V7L12 2ZM6 8V16L12 19V11L6 8ZM18 8L13 11V19L18 16V8ZM7 7L12 10L17 7L12 4L7 7Z",
    style: "fill",
  },
  aws_cloudfront: {
    path: "M12 3A9 9 0 1 0 21 12H18A6 6 0 1 1 12 6V3ZM11 7H13V11H17V13H11V7ZM15 2H22V9L19.5 6.5L16 10L14 8L17.5 4.5L15 2Z",
    style: "fill",
  },
  nginx: {
    path: "M12 2L21 7V17L12 22L3 17V7L12 2ZM7 17V7H10L15 14V7H18V17H15L10 10V17H7Z",
    style: "fill",
  },
  kong: {
    path: "M12 2L20 6V11H17V8L12 5L7 8V16L12 19L17 16V13H20V18L12 22L4 18V6L12 2ZM9 9H15V15H9V9Z",
    style: "fill",
  },
  firebase: {
    path: "M5 20L8 4L12 11L15 2L20 20L12 23L5 20ZM9 17L12 20L16 17L14 10L12 15L10 11L9 17Z",
    style: "fill",
  },
  supabase: {
    path: "M13 2L4 14H11L10 22L20 9H13V2ZM12 7V11H16L13 15L14 12H8L12 7Z",
    style: "fill",
  },
  gcp_pubsub: {
    path: "M12 3V9M6 15L10 10M18 15L14 10M8 18H16M12 2A3 3 0 1 0 12 8A3 3 0 0 0 12 2ZM5 15A3 3 0 1 0 5 21A3 3 0 0 0 5 15ZM19 15A3 3 0 1 0 19 21A3 3 0 0 0 19 15Z",
    style: "stroke",
  },
} as const satisfies Record<
  SystemDesignTechnologyId,
  SystemDesignTechnologyBrandPath
>;

const TECHNOLOGY_BY_NORMALIZED_NAME = new Map<
  string,
  SystemDesignTechnologyVisual
>();

for (const definition of Object.values(
  SYSTEM_DESIGN_TECHNOLOGY_REGISTRY,
)) {
  const searchableNames = [
    definition.id,
    definition.name,
    definition.shortName,
    ...definition.aliases,
  ];
  for (const name of searchableNames) {
    TECHNOLOGY_BY_NORMALIZED_NAME.set(normalizeTechnologyName(name), definition);
  }
}

function normalizeTechnologyName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[._/\s-]+/g, "");
}

/**
 * Accepts both the legacy technology string and the structured identity used by
 * new documents. Unknown values deliberately return null and never become URLs.
 */
export function resolveSystemDesignTechnology(
  value: unknown,
): SystemDesignTechnologyVisual | null {
  if (typeof value === "string") {
    return TECHNOLOGY_BY_NORMALIZED_NAME.get(normalizeTechnologyName(value)) ?? null;
  }

  if (value && typeof value === "object") {
    const candidate = value as { id?: unknown; name?: unknown };
    if (typeof candidate.id === "string") {
      const byId = TECHNOLOGY_BY_NORMALIZED_NAME.get(
        normalizeTechnologyName(candidate.id),
      );
      if (byId) return byId;
    }
    if (typeof candidate.name === "string") {
      return (
        TECHNOLOGY_BY_NORMALIZED_NAME.get(
          normalizeTechnologyName(candidate.name),
        ) ?? null
      );
    }
  }

  return null;
}

export function getSystemDesignTechnologyName(
  value: unknown,
): string | undefined {
  const controlled = resolveSystemDesignTechnology(value);
  if (controlled) return controlled.name;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return undefined;
}

export function createSystemDesignTechnologyIdentity(
  id: SystemDesignTechnologyId,
): TechnologyIdentity {
  const definition = SYSTEM_DESIGN_TECHNOLOGY_REGISTRY[id];
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
  };
}

export type SystemDesignSemanticCategory =
  | SystemDesignNodeCategory
  | "modules"
  | "containers"
  | "annotations";

export type SystemDesignNodeChrome =
  | "identity"
  | "client"
  | "network"
  | "gateway"
  | "compute"
  | "datastore"
  | "cache"
  | "object-storage"
  | "messaging"
  | "external"
  | "module"
  | "boundary"
  | "container"
  | "text"
  | "note";

export interface SystemDesignNodeVisualDefinition {
  category: SystemDesignSemanticCategory;
  chrome: SystemDesignNodeChrome;
  accent: string;
  softAccent: string;
}

const NODE_VISUALS: Record<string, SystemDesignNodeVisualDefinition> = {
  user: {
    category: "clients",
    chrome: "identity",
    accent: "#a78bfa",
    softAccent: "#2e2350",
  },
  web_app: {
    category: "clients",
    chrome: "client",
    accent: "#a78bfa",
    softAccent: "#2e2350",
  },
  mobile_app: {
    category: "clients",
    chrome: "client",
    accent: "#a78bfa",
    softAccent: "#2e2350",
  },
  admin_portal: {
    category: "clients",
    chrome: "client",
    accent: "#a78bfa",
    softAccent: "#2e2350",
  },
  dns: {
    category: "networking",
    chrome: "network",
    accent: "#38bdf8",
    softAccent: "#082f49",
  },
  cdn: {
    category: "networking",
    chrome: "network",
    accent: "#38bdf8",
    softAccent: "#082f49",
  },
  load_balancer: {
    category: "networking",
    chrome: "network",
    accent: "#38bdf8",
    softAccent: "#082f49",
  },
  api_gateway: {
    category: "networking",
    chrome: "gateway",
    accent: "#22d3ee",
    softAccent: "#083344",
  },
  service: {
    category: "compute",
    chrome: "compute",
    accent: "#818cf8",
    softAccent: "#252553",
  },
  microservice: {
    category: "compute",
    chrome: "compute",
    accent: "#818cf8",
    softAccent: "#252553",
  },
  monolith: {
    category: "compute",
    chrome: "compute",
    accent: "#818cf8",
    softAccent: "#252553",
  },
  worker: {
    category: "compute",
    chrome: "compute",
    accent: "#818cf8",
    softAccent: "#252553",
  },
  serverless_function: {
    category: "compute",
    chrome: "compute",
    accent: "#818cf8",
    softAccent: "#252553",
  },
  sql_database: {
    category: "data",
    chrome: "datastore",
    accent: "#34d399",
    softAccent: "#052e2b",
  },
  nosql_database: {
    category: "data",
    chrome: "datastore",
    accent: "#34d399",
    softAccent: "#052e2b",
  },
  data_warehouse: {
    category: "data",
    chrome: "datastore",
    accent: "#34d399",
    softAccent: "#052e2b",
  },
  cache: {
    category: "data",
    chrome: "cache",
    accent: "#fbbf24",
    softAccent: "#422006",
  },
  search_engine: {
    category: "data",
    chrome: "compute",
    accent: "#34d399",
    softAccent: "#052e2b",
  },
  object_storage: {
    category: "data",
    chrome: "object-storage",
    accent: "#84cc16",
    softAccent: "#1a2e05",
  },
  message_queue: {
    category: "messaging",
    chrome: "messaging",
    accent: "#f59e0b",
    softAccent: "#451a03",
  },
  event_stream: {
    category: "messaging",
    chrome: "messaging",
    accent: "#f59e0b",
    softAccent: "#451a03",
  },
  pubsub: {
    category: "messaging",
    chrome: "messaging",
    accent: "#f59e0b",
    softAccent: "#451a03",
  },
  third_party_api: {
    category: "external",
    chrome: "external",
    accent: "#f472b6",
    softAccent: "#500724",
  },
  payment_provider: {
    category: "external",
    chrome: "external",
    accent: "#f472b6",
    softAccent: "#500724",
  },
  notification_provider: {
    category: "external",
    chrome: "external",
    accent: "#f472b6",
    softAccent: "#500724",
  },
  module: {
    category: "modules",
    chrome: "module",
    accent: "#c084fc",
    softAccent: "#3b0764",
  },
  system_boundary: {
    category: "containers",
    chrome: "boundary",
    accent: "#94a3b8",
    softAccent: "#1e293b",
  },
  container: {
    category: "containers",
    chrome: "container",
    accent: "#60a5fa",
    softAccent: "#172554",
  },
  text: {
    category: "annotations",
    chrome: "text",
    accent: "#e2e8f0",
    softAccent: "#1e293b",
  },
  note: {
    category: "annotations",
    chrome: "note",
    accent: "#facc15",
    softAccent: "#422006",
  },
};

const FALLBACK_NODE_VISUAL: SystemDesignNodeVisualDefinition = {
  category: "compute",
  chrome: "compute",
  accent: "#818cf8",
  softAccent: "#252553",
};

export function getSystemDesignNodeVisual(
  type: SystemDesignNodeType | string,
): SystemDesignNodeVisualDefinition {
  return NODE_VISUALS[type] ?? FALLBACK_NODE_VISUAL;
}
