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
  /** Optional richer brief fields; kept outside the canvas document model. */
  problemStatement?: string;
  concepts?: string[];
  followUpQuestions?: string[];
  notes?: string;
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
  | "email_provider"
  | "sms_provider"
  | "identity_provider"
  | "module"
  | "logical_module"
  | "feature_module"
  | "domain_module"
  | "system_boundary"
  | "module_boundary"
  | "vpc_boundary"
  | "region_boundary"
  | "availability_zone_boundary"
  | "kubernetes_cluster_boundary"
  | "deployment_group_boundary"
  | "swimlane_boundary"
  | "container"
  | "text"
  | "note"
  | "warning_note"
  | "assumption_note"
  | "rectangle"
  | "rounded_rectangle"
  | "ellipse"
  | "diamond"
  | "callout"
  | "divider"
  | "label"
  | "image";

export type SystemDesignNodeCategory =
  | "clients"
  | "networking"
  | "compute"
  | "data"
  | "messaging"
  | "external"
  | "modules"
  | "boundaries"
  | "annotations";

export type TechnologyRegistryId =
  | "postgresql"
  | "mysql"
  | "mongodb"
  | "redis"
  | "kafka"
  | "rabbitmq"
  | "elasticsearch"
  | "opensearch"
  | "kubernetes"
  | "docker"
  | "aws_lambda"
  | "azure_functions"
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

export type SystemDesignRasterAssetMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/webp";

interface SystemDesignNodeAssetBase {
  intrinsicWidth: number;
  intrinsicHeight: number;
  name?: string;
}

export interface SystemDesignRasterNodeAsset
  extends SystemDesignNodeAssetBase {
  kind: "raster";
  mimeType: SystemDesignRasterAssetMimeType;
  dataUrl: string;
}

export interface SystemDesignSvgNodeAsset
  extends SystemDesignNodeAssetBase {
  kind: "svg";
  mimeType: "image/svg+xml";
  svg: string;
}

export type SystemDesignNodeAsset =
  | SystemDesignRasterNodeAsset
  | SystemDesignSvgNodeAsset;

export type SystemDesignNodeBorderStyle = "solid" | "dashed" | "dotted";

/** Serializable visual overrides applied on top of a semantic node preset. */
export interface SystemDesignNodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
  borderStyle?: SystemDesignNodeBorderStyle;
  opacity?: number;
}

export type SystemDesignTextHorizontalAlign = "left" | "center" | "right";
export type SystemDesignTextVerticalAlign = "top" | "middle" | "bottom";
export type SystemDesignTextWeight = "normal" | "bold";
export type SystemDesignTextFontStyle = "normal" | "italic";
export type SystemDesignTextDecoration =
  | "none"
  | "underline"
  | "line-through";

/** Serializable typography overrides shared by labels and annotations. */
export interface SystemDesignNodeTextStyle {
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  padding?: number;
  fontWeight?: SystemDesignTextWeight;
  fontStyle?: SystemDesignTextFontStyle;
  textDecoration?: SystemDesignTextDecoration;
  align?: SystemDesignTextHorizontalAlign;
  verticalAlign?: SystemDesignTextVerticalAlign;
}

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
  /** Serializable identity shared by nodes that behave as one selection group. */
  groupId?: string;
  layer: number;
  locked: boolean;
  visible: boolean;
  asset?: SystemDesignNodeAsset;
  style?: SystemDesignNodeStyle;
  textStyle?: SystemDesignNodeTextStyle;
  metadata?: Record<string, string>;
}

export type SystemDesignEdgeType =
  | "http_request"
  | "http_response"
  | "grpc"
  | "websocket"
  | "database_read"
  | "database_write"
  | "async_message"
  | "event_publish"
  | "event_stream"
  | "batch_transfer"
  | "failure_fallback"
  | "custom"
  // Schema-v2 documents created by the prototype use these identifiers.
  // They remain valid aliases so locally saved diagrams continue to load.
  | "request"
  | "response"
  | "async"
  | "event"
  | "data"
  | "replication"
  | "read"
  | "write"
  | "stream";

export type SystemDesignEdgeRouting =
  | "straight"
  | "curved"
  | "elbow"
  | "orthogonal"
  | "step"
  | "bidirectional";

export type SystemDesignEdgeLineStyle =
  | "solid"
  | "dashed"
  | "dotted"
  | "dash_dot";

export type SystemDesignArrowhead =
  | "none"
  | "standard"
  | "open"
  | "filled_triangle"
  | "circle"
  | "diamond";

export type SystemDesignEdgeLabelIcon =
  | "none"
  | "http"
  | "grpc"
  | "websocket"
  | "database"
  | "message"
  | "event"
  | "stream"
  | "replication"
  | "batch"
  | "failure";

export type SystemDesignEdgeAnimationMode =
  | "none"
  | "moving_dash"
  | "moving_dots"
  | "flow_pulse"
  | "direction_pulse";

export type SystemDesignEdgeAnimationDirection =
  | "forward"
  | "reverse"
  | "alternate";

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
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  lineStyle?: SystemDesignEdgeLineStyle;
  dashPattern?: number[];
  startArrowhead?: SystemDesignArrowhead;
  endArrowhead?: SystemDesignArrowhead;
  labelIcon?: SystemDesignEdgeLabelIcon;
  labelPosition?: number;
  labelBackground?: string;
  labelTextColor?: string;
  animationMode?: SystemDesignEdgeAnimationMode;
  animationSpeed?: number;
  animationDirection?: SystemDesignEdgeAnimationDirection;
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
  | "notification"
  | "email"
  | "sms"
  | "identity-provider"
  | "module"
  | "logical-module"
  | "feature-module"
  | "domain-module"
  | "boundary"
  | "module-boundary"
  | "vpc"
  | "region"
  | "availability-zone"
  | "kubernetes-cluster"
  | "deployment-group"
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

export type SystemDesignEditorTool =
  | "select"
  | "pan"
  | "connect"
  | "text"
  | "note"
  | "boundary"
  | "module";

export const SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_VERSION = 1 as const;
export const SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_KIND =
  "recallstack/system-design-fragment" as const;

export interface SystemDesignClipboardFragment {
  kind: typeof SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_KIND;
  version: typeof SYSTEM_DESIGN_CLIPBOARD_FRAGMENT_VERSION;
  id: string;
  sourceDiagramId: string;
  nodes: SystemDesignNode[];
  edges: SystemDesignEdge[];
  diagrams: Record<string, SystemDesignDiagram>;
}

export interface SystemDesignClipboard
  extends SystemDesignClipboardFragment {
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
