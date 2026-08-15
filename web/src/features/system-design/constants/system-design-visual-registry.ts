import type {
  SystemDesignNodeCategory,
  SystemDesignNodeType,
  TechnologyCategory,
  TechnologyIdentity,
  TechnologyRegistryId,
} from "../types/system-design.types";
import {
  siApachekafka,
  siDocker,
  siElasticsearch,
  siFirebase,
  siGooglepubsub,
  siKong,
  siKubernetes,
  siMongodb,
  siMysql,
  siNginx,
  siOpensearch,
  siPostgresql,
  siRabbitmq,
  siRedis,
  siSupabase,
} from "simple-icons";

/**
 * Technology marks are bundled vectors. Recognized vendor marks use the
 * authoritative Simple Icons path data at build time; cloud-service symbols
 * without a Simple Icons mark use our code-native service glyphs. No runtime
 * request or user-provided URL can enter this closed registry.
 */
export const SYSTEM_DESIGN_TECHNOLOGY_IDS = [
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "kafka",
  "rabbitmq",
  "elasticsearch",
  "opensearch",
  "kubernetes",
  "docker",
  "aws_lambda",
  "azure_functions",
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
    color: `#${siPostgresql.hex}`,
    onColor: "#ffffff",
    category: "database",
    aliases: ["postgres", "postgre sql"],
  },
  mysql: {
    id: "mysql",
    name: "MySQL",
    shortName: "MySQL",
    mark: "MY",
    color: `#${siMysql.hex}`,
    onColor: "#ffffff",
    category: "database",
    aliases: ["my sql"],
  },
  mongodb: {
    id: "mongodb",
    name: "MongoDB",
    shortName: "Mongo",
    mark: "M",
    color: `#${siMongodb.hex}`,
    onColor: "#ffffff",
    category: "database",
    aliases: ["mongo"],
  },
  redis: {
    id: "redis",
    name: "Redis",
    shortName: "Redis",
    mark: "R",
    color: `#${siRedis.hex}`,
    onColor: "#ffffff",
    category: "cache",
    aliases: [],
  },
  kafka: {
    id: "kafka",
    name: "Apache Kafka",
    shortName: "Kafka",
    mark: "K",
    color: `#${siApachekafka.hex}`,
    onColor: "#ffffff",
    category: "messaging",
    aliases: ["apache kafka"],
  },
  rabbitmq: {
    id: "rabbitmq",
    name: "RabbitMQ",
    shortName: "Rabbit",
    mark: "RM",
    color: `#${siRabbitmq.hex}`,
    onColor: "#ffffff",
    category: "messaging",
    aliases: ["rabbit mq"],
  },
  elasticsearch: {
    id: "elasticsearch",
    name: "Elasticsearch",
    shortName: "Elastic",
    mark: "ES",
    color: `#${siElasticsearch.hex}`,
    onColor: "#ffffff",
    category: "search",
    aliases: ["elastic search", "elastic"],
  },
  opensearch: {
    id: "opensearch",
    name: "OpenSearch",
    shortName: "OpenSearch",
    mark: "OS",
    color: `#${siOpensearch.hex}`,
    onColor: "#ffffff",
    category: "search",
    aliases: ["open search", "amazon opensearch", "aws opensearch"],
  },
  kubernetes: {
    id: "kubernetes",
    name: "Kubernetes",
    shortName: "K8s",
    mark: "K8",
    color: `#${siKubernetes.hex}`,
    onColor: "#ffffff",
    category: "container",
    aliases: ["k8s"],
  },
  docker: {
    id: "docker",
    name: "Docker",
    shortName: "Docker",
    mark: "D",
    color: `#${siDocker.hex}`,
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
  azure_functions: {
    id: "azure_functions",
    name: "Azure Functions",
    shortName: "Functions",
    mark: "AF",
    color: "#0078d4",
    onColor: "#ffffff",
    category: "compute",
    aliases: [
      "azure function",
      "microsoft azure functions",
      "azure-functions",
    ],
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
    color: `#${siNginx.hex}`,
    onColor: "#ffffff",
    category: "networking",
    aliases: [],
  },
  kong: {
    id: "kong",
    name: "Kong Gateway",
    shortName: "Kong",
    mark: "KG",
    color: `#${siKong.hex}`,
    onColor: "#ffffff",
    category: "networking",
    aliases: ["kong gateway", "kong api gateway"],
  },
  firebase: {
    id: "firebase",
    name: "Firebase",
    shortName: "Firebase",
    mark: "F",
    color: `#${siFirebase.hex}`,
    onColor: "#ffffff",
    category: "platform",
    aliases: [],
  },
  supabase: {
    id: "supabase",
    name: "Supabase",
    shortName: "Supabase",
    mark: "S",
    color: `#${siSupabase.hex}`,
    onColor: "#052e25",
    category: "platform",
    aliases: [],
  },
  gcp_pubsub: {
    id: "gcp_pubsub",
    name: "Google Cloud Pub/Sub",
    shortName: "GCP Pub/Sub",
    mark: "PS",
    color: `#${siGooglepubsub.hex}`,
    onColor: "#1f2937",
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
    path: siPostgresql.path,
    style: "fill",
  },
  mysql: {
    path: siMysql.path,
    style: "fill",
  },
  mongodb: {
    path: siMongodb.path,
    style: "fill",
  },
  redis: {
    path: siRedis.path,
    style: "fill",
  },
  kafka: {
    path: siApachekafka.path,
    style: "fill",
  },
  rabbitmq: {
    path: siRabbitmq.path,
    style: "fill",
  },
  elasticsearch: {
    path: siElasticsearch.path,
    style: "fill",
  },
  opensearch: {
    path: siOpensearch.path,
    style: "fill",
  },
  kubernetes: {
    path: siKubernetes.path,
    style: "fill",
  },
  docker: {
    path: siDocker.path,
    style: "fill",
  },
  aws_lambda: {
    path: "M8 2H13L21 21H16L12 11L8 21H3L10 6L8 2Z",
    style: "fill",
  },
  azure_functions: {
    path: "M8 3L3 12L8 21M16 3L21 12L16 21M14 4L9 13H14L10 21",
    style: "stroke",
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
    path: siNginx.path,
    style: "fill",
  },
  kong: {
    path: siKong.path,
    style: "fill",
  },
  firebase: {
    path: siFirebase.path,
    style: "fill",
  },
  supabase: {
    path: siSupabase.path,
    style: "fill",
  },
  gcp_pubsub: {
    path: siGooglepubsub.path,
    style: "fill",
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
    const candidate = value as {
      id?: unknown;
      name?: unknown;
      category?: unknown;
    };
    if (typeof candidate.id === "string") {
      if (candidate.id === "custom") return null;
      const definition = TECHNOLOGY_BY_NORMALIZED_NAME.get(
        normalizeTechnologyName(candidate.id),
      );
      if (
        !definition ||
        candidate.name !== definition.name ||
        candidate.category !== definition.category
      ) {
        return null;
      }
      return definition;
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

export type SystemDesignSemanticCategory = SystemDesignNodeCategory;

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
  | "module-boundary"
  | "vpc-boundary"
  | "region-boundary"
  | "availability-zone-boundary"
  | "cluster-boundary"
  | "deployment-boundary"
  | "swimlane"
  | "container"
  | "text"
  | "note"
  | "warning-note"
  | "assumption-note"
  | "rectangle"
  | "rounded-rectangle"
  | "ellipse"
  | "diamond"
  | "callout"
  | "divider"
  | "label"
  | "image";

export interface SystemDesignNodeVisualDefinition {
  category: SystemDesignSemanticCategory;
  chrome: SystemDesignNodeChrome;
  accent: string;
  softAccent: string;
}

const NODE_VISUALS = {
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
  email_provider: {
    category: "external",
    chrome: "external",
    accent: "#f472b6",
    softAccent: "#500724",
  },
  sms_provider: {
    category: "external",
    chrome: "external",
    accent: "#fb7185",
    softAccent: "#4c0519",
  },
  identity_provider: {
    category: "external",
    chrome: "external",
    accent: "#a78bfa",
    softAccent: "#2e2350",
  },
  module: {
    category: "modules",
    chrome: "module",
    accent: "#c084fc",
    softAccent: "#3b0764",
  },
  logical_module: {
    category: "modules",
    chrome: "module",
    accent: "#a78bfa",
    softAccent: "#312e81",
  },
  feature_module: {
    category: "modules",
    chrome: "module",
    accent: "#f472b6",
    softAccent: "#500724",
  },
  domain_module: {
    category: "modules",
    chrome: "module",
    accent: "#fb923c",
    softAccent: "#431407",
  },
  system_boundary: {
    category: "boundaries",
    chrome: "boundary",
    accent: "#94a3b8",
    softAccent: "#1e293b",
  },
  module_boundary: {
    category: "boundaries",
    chrome: "module-boundary",
    accent: "#c084fc",
    softAccent: "#3b0764",
  },
  vpc_boundary: {
    category: "boundaries",
    chrome: "vpc-boundary",
    accent: "#38bdf8",
    softAccent: "#082f49",
  },
  region_boundary: {
    category: "boundaries",
    chrome: "region-boundary",
    accent: "#60a5fa",
    softAccent: "#172554",
  },
  availability_zone_boundary: {
    category: "boundaries",
    chrome: "availability-zone-boundary",
    accent: "#22d3ee",
    softAccent: "#083344",
  },
  kubernetes_cluster_boundary: {
    category: "boundaries",
    chrome: "cluster-boundary",
    accent: "#326ce5",
    softAccent: "#172554",
  },
  deployment_group_boundary: {
    category: "boundaries",
    chrome: "deployment-boundary",
    accent: "#34d399",
    softAccent: "#052e2b",
  },
  swimlane_boundary: {
    category: "boundaries",
    chrome: "swimlane",
    accent: "#f59e0b",
    softAccent: "#451a03",
  },
  container: {
    category: "boundaries",
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
  warning_note: {
    category: "annotations",
    chrome: "warning-note",
    accent: "#fb7185",
    softAccent: "#4c0519",
  },
  assumption_note: {
    category: "annotations",
    chrome: "assumption-note",
    accent: "#38bdf8",
    softAccent: "#082f49",
  },
  rectangle: {
    category: "annotations",
    chrome: "rectangle",
    accent: "#94a3b8",
    softAccent: "#1e293b",
  },
  rounded_rectangle: {
    category: "annotations",
    chrome: "rounded-rectangle",
    accent: "#a78bfa",
    softAccent: "#2e2350",
  },
  ellipse: {
    category: "annotations",
    chrome: "ellipse",
    accent: "#22d3ee",
    softAccent: "#083344",
  },
  diamond: {
    category: "annotations",
    chrome: "diamond",
    accent: "#f59e0b",
    softAccent: "#451a03",
  },
  callout: {
    category: "annotations",
    chrome: "callout",
    accent: "#f472b6",
    softAccent: "#500724",
  },
  divider: {
    category: "annotations",
    chrome: "divider",
    accent: "#64748b",
    softAccent: "#1e293b",
  },
  label: {
    category: "annotations",
    chrome: "label",
    accent: "#e2e8f0",
    softAccent: "#1e293b",
  },
  image: {
    category: "annotations",
    chrome: "image",
    accent: "#a78bfa",
    softAccent: "#2e2350",
  },
} as const satisfies Record<
  SystemDesignNodeType,
  SystemDesignNodeVisualDefinition
>;

export function getSystemDesignNodeVisual(
  type: SystemDesignNodeType,
): SystemDesignNodeVisualDefinition {
  return NODE_VISUALS[type];
}
