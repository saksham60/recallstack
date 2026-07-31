export const SYSTEM_DESIGN_SCHEMA_VERSION = 2 as const;
export const SYSTEM_DESIGN_LEGACY_SCHEMA_VERSION = 1 as const;

export type SystemDesignDifficulty = "easy" | "medium" | "hard";

export type ProblemStatus = "not_started" | "in_progress" | "completed";

export interface SystemDesignProblem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  difficulty: SystemDesignDifficulty;
  estimatedMinutes: number;
  requirements: string[];
  scaleAssumptions: string[];
  tags: string[];
}

export type SystemDesignNodeType =
  | "user"
  | "web_app"
  | "mobile_app"
  | "admin_portal"
  | "dns"
  | "cdn"
  | "load_balancer"
  | "api_gateway"
  | "service"
  | "microservice"
  | "monolith"
  | "worker"
  | "serverless_function"
  | "sql_database"
  | "nosql_database"
  | "cache"
  | "search_engine"
  | "object_storage"
  | "data_warehouse"
  | "message_queue"
  | "event_stream"
  | "pubsub"
  | "third_party_api"
  | "payment_provider"
  | "notification_provider"
  | "module"
  | "system_boundary"
  | "container"
  | "text"
  | "note";

export type SystemDesignNodeCategory =
  | "clients"
  | "networking"
  | "compute"
  | "data"
  | "messaging"
  | "external"
  | "architecture"
  | "annotations";

export type TechnologyRegistryId =
  | "postgresql"
  | "mysql"
  | "mongodb"
  | "redis"
  | "kafka"
  | "rabbitmq"
  | "elasticsearch"
  | "kubernetes"
  | "docker"
  | "aws_lambda"
  | "aws_s3"
  | "aws_cloudfront"
  | "nginx"
  | "kong"
  | "firebase"
  | "supabase"
  | "gcp_pubsub"
  | "custom";

export type TechnologyCategory =
  | "database"
  | "cache"
  | "messaging"
  | "search"
  | "compute"
  | "container"
  | "storage"
  | "networking"
  | "platform"
  | "custom";

/**
 * A safe reference into the bundled technology-icon registry.
 *
 * `id` is deliberately not a URL. Renderers resolve it to an approved local
 * asset, while `name` keeps imported legacy/custom technology labels intact.
 */
export interface TechnologyIdentity {
  id: TechnologyRegistryId;
  name: string;
  category: TechnologyCategory;
}

export type SystemDesignPort = "top" | "right" | "bottom" | "left";

export interface SystemDesignPoint {
  x: number;
  y: number;
}

export interface SystemDesignSize {
  width: number;
  height: number;
}

export interface SystemDesignRect extends SystemDesignPoint, SystemDesignSize {}

export interface SystemDesignNode {
  id: string;
  type: SystemDesignNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  subtitle?: string;
  technology?: TechnologyIdentity;
  description?: string;
  childDiagramId?: string;
  isExpandable?: boolean;
  isCollapsed?: boolean;
  parentModuleId?: string;
  layer: number;
  locked: boolean;
  visible: boolean;
  metadata?: Record<string, string>;
}

export type SystemDesignEdgeType =
  | "request"
  | "response"
  | "async"
  | "event"
  | "data"
  | "replication"
  | "read"
  | "write"
  | "stream";

export type SystemDesignEdgeRouting = "straight" | "curved";

export interface SystemDesignEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: SystemDesignPort;
  targetPort: SystemDesignPort;
  type: SystemDesignEdgeType;
  label?: string;
  protocol?: string;
  description?: string;
  routing?: SystemDesignEdgeRouting;
}

export interface SystemDesignViewport {
  x: number;
  y: number;
  zoom: number;
}

export type SystemDesignDocumentStatus = Exclude<
  ProblemStatus,
  "not_started"
>;

export interface SystemDesignDiagram {
  id: string;
  name: string;
  parentNodeId?: string;
  nodes: SystemDesignNode[];
  edges: SystemDesignEdge[];
  viewport: SystemDesignViewport;
}

export interface SystemDesignDocument {
  schemaVersion: typeof SYSTEM_DESIGN_SCHEMA_VERSION;
  id: string;
  problemId: string;
  title: string;
  status: SystemDesignDocumentStatus;
  rootDiagramId: string;
  diagrams: Record<string, SystemDesignDiagram>;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface SystemDesignDocumentSummary {
  problemId: string;
  title: string;
  status: ProblemStatus;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
}

export type SystemDesignIconKey =
  | "user"
  | "browser"
  | "mobile"
  | "admin"
  | "globe"
  | "network"
  | "route"
  | "gateway"
  | "server"
  | "boxes"
  | "box"
  | "worker"
  | "function"
  | "database"
  | "document-database"
  | "cache"
  | "search"
  | "storage"
  | "warehouse"
  | "queue"
  | "stream"
  | "broadcast"
  | "external-link"
  | "payment"
  | "notification";

export interface SystemDesignNodeDefinition {
  type: SystemDesignNodeType;
  category: SystemDesignNodeCategory;
  label: string;
  tooltip: string;
  iconKey: SystemDesignIconKey;
  defaultWidth: number;
  defaultHeight: number;
}

export interface SystemDesignPaletteCategory {
  id: SystemDesignNodeCategory;
  label: string;
  items: readonly SystemDesignNodeDefinition[];
}

export type SystemDesignSelectionMode = "replace" | "add" | "toggle";

export interface SystemDesignClipboard {
  nodes: SystemDesignNode[];
  edges: SystemDesignEdge[];
  pasteCount: number;
}

export type SystemDesignLoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export type SystemDesignSaveStatus =
  | "idle"
  | "unsaved"
  | "saving"
  | "saved"
  | "error";

export interface SystemDesignEditorState {
  problemId: string;
  document: SystemDesignDocument;
  activeDiagramId: string;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  clipboard: SystemDesignClipboard | null;
  isDirty: boolean;
  isPreviewMode: boolean;
  history: SystemDesignDocument[];
  future: SystemDesignDocument[];
  loadStatus: SystemDesignLoadStatus;
  loadError: string | null;
  saveStatus: SystemDesignSaveStatus;
  saveError: string | null;
  lastSavedAt: string | null;
  lastSavedDocumentUpdatedAt: string | null;
  savingDocumentUpdatedAt: string | null;
}

export type SystemDesignLayerDirection =
  | "forward"
  | "backward"
  | "front"
  | "back";
