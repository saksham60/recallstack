import type {
  DiagramConnectorElement,
  DiagramDocument,
  DiagramElement,
  DiagramElementStyle,
  DiagramImageAsset,
  DiagramJsonValue,
  DiagramPoint,
  DiagramSelectionMode,
  DiagramSize,
  DiagramTextStyle,
  DiagramViewport,
} from "../types";

export interface DiagramElementPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  label?: string;
  text?: string;
  style?: DiagramElementStyle;
  textStyle?: DiagramTextStyle;
  visible?: boolean;
  locked?: boolean;
  layer?: number;
  parentGroupId?: string;
  childPageId?: string;
  metadata?: Record<string, string>;
  data?: Record<string, DiagramJsonValue>;
  asset?: DiagramImageAsset;
  routing?: DiagramConnectorElement["routing"];
  waypoints?: DiagramPoint[];
  labels?: DiagramConnectorElement["labels"];
  connectorStyle?: DiagramConnectorElement["style"];
}

export type DiagramLayerDirection = "forward" | "backward" | "front" | "back";

export type DiagramEditorAction =
  | { type: "document/replace"; document: DiagramDocument; persisted?: boolean }
  | { type: "element/add"; element: DiagramElement; at?: string }
  | { type: "element/update"; elementId: string; changes: DiagramElementPatch; at?: string }
  | { type: "elements/move"; positions: Readonly<Record<string, DiagramPoint>>; at?: string }
  | { type: "elements/update-many"; changes: Readonly<Record<string, DiagramElementPatch>>; at?: string }
  | { type: "element/resize"; elementId: string; size: DiagramSize; position?: DiagramPoint; at?: string }
  | { type: "element/rotate"; elementId: string; rotation: number; at?: string }
  | { type: "elements/delete"; elementIds?: string[]; at?: string }
  | { type: "connector/add"; connector: DiagramConnectorElement; at?: string }
  | { type: "connector/update"; connectorId: string; changes: DiagramElementPatch; at?: string }
  | { type: "selection/set"; elementIds: string[]; mode: DiagramSelectionMode }
  | { type: "selection/all" }
  | { type: "selection/clear" }
  | { type: "clipboard/copy" }
  | { type: "clipboard/cut"; at?: string }
  | { type: "clipboard/paste"; at?: string }
  | { type: "elements/group"; groupId?: string; at?: string }
  | { type: "group/ungroup"; groupIds?: string[]; at?: string }
  | { type: "layer/reorder"; elementIds?: string[]; direction: DiagramLayerDirection; at?: string }
  | { type: "page/add"; pageId?: string; name?: string; at?: string }
  | { type: "page/create-child"; elementId: string; pageId?: string; name?: string; at?: string }
  | { type: "page/activate"; pageId: string }
  | { type: "page/delete"; pageId: string; at?: string }
  | { type: "viewport/set"; viewport: DiagramViewport; pageId?: string }
  | { type: "history/undo" }
  | { type: "history/redo" }
  | { type: "document/mark-saved" };

export const diagramEditorActions = {
  replaceDocument: (document: DiagramDocument, persisted = false): DiagramEditorAction => ({ type: "document/replace", document, persisted }),
  addElement: (element: DiagramElement, at?: string): DiagramEditorAction => ({ type: "element/add", element, at }),
  updateElement: (elementId: string, changes: DiagramElementPatch, at?: string): DiagramEditorAction => ({ type: "element/update", elementId, changes, at }),
  moveElements: (positions: Readonly<Record<string, DiagramPoint>>, at?: string): DiagramEditorAction => ({ type: "elements/move", positions, at }),
  updateElements: (changes: Readonly<Record<string, DiagramElementPatch>>, at?: string): DiagramEditorAction => ({ type: "elements/update-many", changes, at }),
  resizeElement: (elementId: string, size: DiagramSize, position?: DiagramPoint, at?: string): DiagramEditorAction => ({ type: "element/resize", elementId, size, position, at }),
  rotateElement: (elementId: string, rotation: number, at?: string): DiagramEditorAction => ({ type: "element/rotate", elementId, rotation, at }),
  deleteElements: (elementIds?: string[], at?: string): DiagramEditorAction => ({ type: "elements/delete", elementIds, at }),
  addConnector: (connector: DiagramConnectorElement, at?: string): DiagramEditorAction => ({ type: "connector/add", connector, at }),
  updateConnector: (connectorId: string, changes: DiagramElementPatch, at?: string): DiagramEditorAction => ({ type: "connector/update", connectorId, changes, at }),
  select: (elementIds: string[], mode: DiagramSelectionMode = "replace"): DiagramEditorAction => ({ type: "selection/set", elementIds, mode }),
  selectAll: (): DiagramEditorAction => ({ type: "selection/all" }),
  clearSelection: (): DiagramEditorAction => ({ type: "selection/clear" }),
  copy: (): DiagramEditorAction => ({ type: "clipboard/copy" }),
  cut: (at?: string): DiagramEditorAction => ({ type: "clipboard/cut", at }),
  paste: (at?: string): DiagramEditorAction => ({ type: "clipboard/paste", at }),
  group: (groupId?: string, at?: string): DiagramEditorAction => ({ type: "elements/group", groupId, at }),
  ungroup: (groupIds?: string[], at?: string): DiagramEditorAction => ({ type: "group/ungroup", groupIds, at }),
  reorder: (direction: DiagramLayerDirection, elementIds?: string[], at?: string): DiagramEditorAction => ({ type: "layer/reorder", elementIds, direction, at }),
  addPage: (name?: string, pageId?: string, at?: string): DiagramEditorAction => ({ type: "page/add", name, pageId, at }),
  createChildPage: (elementId: string, name?: string, pageId?: string, at?: string): DiagramEditorAction => ({ type: "page/create-child", elementId, name, pageId, at }),
  activatePage: (pageId: string): DiagramEditorAction => ({ type: "page/activate", pageId }),
  deletePage: (pageId: string, at?: string): DiagramEditorAction => ({ type: "page/delete", pageId, at }),
  setViewport: (viewport: DiagramViewport, pageId?: string): DiagramEditorAction => ({ type: "viewport/set", viewport, pageId }),
  undo: (): DiagramEditorAction => ({ type: "history/undo" }),
  redo: (): DiagramEditorAction => ({ type: "history/redo" }),
  markSaved: (): DiagramEditorAction => ({ type: "document/mark-saved" }),
};
