export const DIAGRAM_SCHEMA_VERSION = 2 as const;

export type DiagramJsonPrimitive = string | number | boolean | null;
export type DiagramJsonValue =
  | DiagramJsonPrimitive
  | DiagramJsonValue[]
  | { [key: string]: DiagramJsonValue };

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramSize {
  width: number;
  height: number;
}

export interface DiagramRect extends DiagramPoint, DiagramSize {}

export interface DiagramViewport {
  x: number;
  y: number;
  zoom: number;
}

export type DiagramStrokeStyle = "solid" | "dashed" | "dotted";
export type DiagramTextAlign = "left" | "center" | "right";
export type DiagramVerticalAlign = "top" | "middle" | "bottom";
export type DiagramFontWeight = "normal" | "medium" | "semibold" | "bold";

export interface DiagramElementStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: DiagramStrokeStyle;
  opacity?: number;
  cornerRadius?: number;
  shadowColor?: string;
  shadowBlur?: number;
}

export interface DiagramTextStyle {
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: DiagramFontWeight;
  italic?: boolean;
  underline?: boolean;
  align?: DiagramTextAlign;
  verticalAlign?: DiagramVerticalAlign;
  lineHeight?: number;
  padding?: number;
}

export interface DiagramElementBase {
  id: string;
  kind: "shape" | "connector" | "text" | "image" | "group" | "frame";
  layer: number;
  visible: boolean;
  locked: boolean;
  parentGroupId?: string;
  metadata?: Record<string, string>;
  data?: Record<string, DiagramJsonValue>;
}

export interface DiagramPositionedElementBase
  extends DiagramElementBase,
    DiagramRect {
  rotation: number;
  style?: DiagramElementStyle;
}

export interface DiagramShapeElement extends DiagramPositionedElementBase {
  kind: "shape";
  shapeDefinitionId: string;
  label: string;
  textStyle?: DiagramTextStyle;
  childPageId?: string;
}

export interface DiagramTextElement extends DiagramPositionedElementBase {
  kind: "text";
  text: string;
  textStyle?: DiagramTextStyle;
}

export type DiagramRasterMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/webp";

export type DiagramImageAsset =
  | {
      kind: "raster";
      mimeType: DiagramRasterMimeType;
      dataUrl: string;
      intrinsicWidth: number;
      intrinsicHeight: number;
      name?: string;
    }
  | {
      kind: "svg";
      mimeType: "image/svg+xml";
      svg: string;
      intrinsicWidth: number;
      intrinsicHeight: number;
      name?: string;
    };

export interface DiagramImageElement extends DiagramPositionedElementBase {
  kind: "image";
  asset: DiagramImageAsset;
  label?: string;
  textStyle?: DiagramTextStyle;
}

export interface DiagramFrameElement extends DiagramPositionedElementBase {
  kind: "frame";
  frameDefinitionId: string;
  label: string;
  textStyle?: DiagramTextStyle;
  childPageId?: string;
}

export interface DiagramGroupElement extends DiagramPositionedElementBase {
  kind: "group";
  childElementIds: string[];
  label?: string;
}

export type DiagramPortSide = "top" | "right" | "bottom" | "left";

export interface DiagramConnectorEndpoint {
  elementId: string;
  portId: string;
}

export type DiagramConnectorRouting =
  | "straight"
  | "curved"
  | "orthogonal";

export type DiagramArrowhead =
  | "none"
  | "standard"
  | "open"
  | "diamond"
  | "circle"
  | "one"
  | "many";

export interface DiagramConnectorLabel {
  id: string;
  text: string;
  position: number;
  background?: string;
  color?: string;
}

export interface DiagramConnectorStyle {
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  strokeStyle?: DiagramStrokeStyle;
  dashPattern?: number[];
  startArrowhead?: DiagramArrowhead;
  endArrowhead?: DiagramArrowhead;
}

export interface DiagramConnectorElement extends DiagramElementBase {
  kind: "connector";
  source: DiagramConnectorEndpoint;
  target: DiagramConnectorEndpoint;
  routing: DiagramConnectorRouting;
  waypoints: DiagramPoint[];
  style?: DiagramConnectorStyle;
  labels: DiagramConnectorLabel[];
}

export type DiagramPositionedElement =
  | DiagramShapeElement
  | DiagramTextElement
  | DiagramImageElement
  | DiagramFrameElement
  | DiagramGroupElement;

export type DiagramElement = DiagramPositionedElement | DiagramConnectorElement;

export interface DiagramPage {
  id: string;
  name: string;
  elements: DiagramElement[];
  viewport: DiagramViewport;
  parentElementId?: string;
  metadata?: Record<string, string>;
}

export interface DiagramDocument {
  schemaVersion: typeof DIAGRAM_SCHEMA_VERSION;
  id: string;
  title: string;
  revision: number;
  enabledPackIds: string[];
  rootPageId: string;
  /** Ordered top-level pages only. Nested drill-down pages remain owner-linked. */
  pageOrder: string[];
  pages: Record<string, DiagramPage>;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramDocumentSummary {
  id: string;
  title: string;
  revision: number;
  pageCount: number;
  elementCount: number;
  enabledPackIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type DiagramSelectionMode = "replace" | "add" | "toggle";
export type DiagramEditorTool =
  | "select"
  | "pan"
  | "connect"
  | "text"
  | "frame";

export interface DiagramClipboard {
  sourcePageId: string;
  elements: DiagramElement[];
  pasteCount: number;
}

export interface DiagramEditorState {
  document: DiagramDocument;
  activePageId: string;
  selectedElementIds: string[];
  clipboard: DiagramClipboard | null;
  history: DiagramDocument[];
  future: DiagramDocument[];
  isDirty: boolean;
}

export function isDiagramPositionedElement(
  element: DiagramElement,
): element is DiagramPositionedElement {
  return element.kind !== "connector";
}

export function isDiagramConnectorElement(
  element: DiagramElement,
): element is DiagramConnectorElement {
  return element.kind === "connector";
}
