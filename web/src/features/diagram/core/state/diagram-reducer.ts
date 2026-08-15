import type {
  DiagramDocument,
  DiagramEditorState,
  DiagramElement,
  DiagramGroupElement,
  DiagramPage,
  DiagramPoint,
  DiagramPositionedElement,
  DiagramSelectionMode,
} from "../types";
import { isDiagramPositionedElement } from "../types";
import {
  DIAGRAM_HISTORY_LIMIT,
  DIAGRAM_PASTE_OFFSET,
  cloneDiagramDocument,
  cloneDiagramElement,
  createDiagramId,
  createDiagramPage,
  createDiagramTimestamp,
  getDiagramPage,
  normalizeDiagramLayers,
  replaceDiagramPage,
} from "./diagram-document";
import type {
  DiagramEditorAction,
  DiagramElementPatch,
  DiagramLayerDirection,
} from "./diagram-actions";

export function createDiagramEditorState(document: DiagramDocument): DiagramEditorState {
  return {
    document: cloneDiagramDocument(document),
    activePageId: document.rootPageId,
    selectedElementIds: [],
    clipboard: null,
    history: [],
    future: [],
    isDirty: false,
  };
}

function page(state: DiagramEditorState): DiagramPage {
  return getDiagramPage(state.document, state.activePageId);
}

function withPage(document: DiagramDocument, nextPage: DiagramPage): DiagramDocument {
  return replaceDiagramPage(document, nextPage);
}

function commit(
  state: DiagramEditorState,
  document: DiagramDocument,
  at?: string,
  selectedElementIds = state.selectedElementIds,
): DiagramEditorState {
  if (document === state.document) return state;
  const updated = {
    ...document,
    updatedAt: at ?? createDiagramTimestamp(state.document.updatedAt),
  };
  return {
    ...state,
    document: updated,
    selectedElementIds,
    history: [...state.history, cloneDiagramDocument(state.document)].slice(-DIAGRAM_HISTORY_LIMIT),
    future: [],
    isDirty: true,
  };
}

function applySelection(
  current: readonly string[],
  incoming: readonly string[],
  mode: DiagramSelectionMode,
): string[] {
  if (mode === "replace") return [...new Set(incoming)];
  const selected = new Set(current);
  for (const id of incoming) {
    if (mode === "toggle" && selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
  return [...selected];
}

function bounds(elements: readonly DiagramPositionedElement[]) {
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(...elements.map((element) => element.x + element.width));
  const bottom = Math.max(...elements.map((element) => element.y + element.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function expandGroups(elements: readonly DiagramElement[], selectedIds: readonly string[]): Set<string> {
  const expanded = new Set(selectedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of elements) {
      if (element.kind === "group" && expanded.has(element.id)) {
        for (const childId of element.childElementIds) {
          if (!expanded.has(childId)) {
            expanded.add(childId);
            changed = true;
          }
        }
      }
      if (element.parentGroupId && expanded.has(element.id) && !expanded.has(element.parentGroupId)) {
        expanded.add(element.parentGroupId);
        changed = true;
      }
    }
  }
  return expanded;
}

function updateElement(element: DiagramElement, patch: DiagramElementPatch): DiagramElement {
  if (element.kind === "connector") {
    return {
      ...element,
      visible: patch.visible ?? element.visible,
      locked: patch.locked ?? element.locked,
      layer: patch.layer ?? element.layer,
      parentGroupId: patch.parentGroupId ?? element.parentGroupId,
      metadata: patch.metadata ?? element.metadata,
      data: patch.data ?? element.data,
      routing: patch.routing ?? element.routing,
      waypoints: patch.waypoints ? [...patch.waypoints] : element.waypoints,
      labels: patch.labels ? structuredClone(patch.labels) : element.labels,
      style: patch.connectorStyle ? { ...element.style, ...patch.connectorStyle } : element.style,
    };
  }
  const positioned = {
    ...element,
    visible: patch.visible ?? element.visible,
    locked: patch.locked ?? element.locked,
    layer: patch.layer ?? element.layer,
    parentGroupId: patch.parentGroupId ?? element.parentGroupId,
    metadata: patch.metadata ?? element.metadata,
    data: patch.data ?? element.data,
    x: patch.x ?? element.x,
    y: patch.y ?? element.y,
    width: patch.width ?? element.width,
    height: patch.height ?? element.height,
    rotation: patch.rotation ?? element.rotation,
    style: patch.style ?? element.style,
  };
  if (element.kind === "shape") return { ...positioned, kind: "shape", shapeDefinitionId: element.shapeDefinitionId, label: patch.label ?? element.label, textStyle: patch.textStyle ?? element.textStyle, childPageId: patch.childPageId ?? element.childPageId };
  if (element.kind === "frame") return { ...positioned, kind: "frame", frameDefinitionId: element.frameDefinitionId, label: patch.label ?? element.label, textStyle: patch.textStyle ?? element.textStyle, childPageId: patch.childPageId ?? element.childPageId };
  if (element.kind === "text") return { ...positioned, kind: "text", text: patch.text ?? patch.label ?? element.text, textStyle: patch.textStyle ?? element.textStyle };
  if (element.kind === "image") return { ...positioned, kind: "image", asset: patch.asset ?? element.asset, label: patch.label ?? element.label, textStyle: patch.textStyle ?? element.textStyle };
  return { ...positioned, kind: "group", childElementIds: [...element.childElementIds], label: patch.label ?? element.label };
}

function removeElements(current: readonly DiagramElement[], ids: Set<string>): DiagramElement[] {
  const removed = new Set(ids);
  for (const element of current) {
    if (element.kind === "group" && removed.has(element.id)) {
      for (const childId of element.childElementIds) removed.add(childId);
    }
  }
  return current
    .filter((element) => {
      if (removed.has(element.id)) return false;
      if (element.kind === "connector") {
        return !removed.has(element.source.elementId) && !removed.has(element.target.elementId);
      }
      return true;
    })
    .map((element) =>
      element.parentGroupId && removed.has(element.parentGroupId)
        ? { ...element, parentGroupId: undefined }
        : element,
    );
}

function reorder(
  elements: readonly DiagramElement[],
  ids: Set<string>,
  direction: DiagramLayerDirection,
): DiagramElement[] {
  const ordered = [...elements].sort((a, b) => a.layer - b.layer);
  if (direction === "front" || direction === "back") {
    const selected = ordered.filter((element) => ids.has(element.id));
    const rest = ordered.filter((element) => !ids.has(element.id));
    return normalizeDiagramLayers(direction === "front" ? [...rest, ...selected] : [...selected, ...rest]);
  }
  const step = direction === "forward" ? 1 : -1;
  const indexes = direction === "forward"
    ? [...ordered.keys()].reverse()
    : [...ordered.keys()];
  for (const index of indexes) {
    const target = index + step;
    if (!ids.has(ordered[index]?.id) || target < 0 || target >= ordered.length || ids.has(ordered[target]?.id)) continue;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  }
  return normalizeDiagramLayers(ordered);
}

function copySelection(state: DiagramEditorState) {
  const current = page(state);
  const ids = expandGroups(current.elements, state.selectedElementIds);
  const positionedIds = new Set(
    current.elements.filter((element) => ids.has(element.id) && element.kind !== "connector").map((element) => element.id),
  );
  const elements = current.elements.filter((element) => {
    if (ids.has(element.id)) return true;
    return element.kind === "connector" && positionedIds.has(element.source.elementId) && positionedIds.has(element.target.elementId);
  });
  return elements.map(cloneDiagramElement);
}

function pasteElements(state: DiagramEditorState, at?: string): DiagramEditorState {
  if (!state.clipboard?.elements.length) return state;
  const current = page(state);
  const idMap = new Map<string, string>();
  for (const element of state.clipboard.elements) idMap.set(element.id, createDiagramId(element.kind));
  const offset = DIAGRAM_PASTE_OFFSET * (state.clipboard.pasteCount + 1);
  const startLayer = current.elements.reduce((maximum, element) => Math.max(maximum, element.layer), -1) + 1;
  const pasted = state.clipboard.elements.map((element, index): DiagramElement => {
    const id = idMap.get(element.id)!;
    if (element.kind === "connector") {
      return {
        ...cloneDiagramElement(element),
        id,
        source: { ...element.source, elementId: idMap.get(element.source.elementId) ?? element.source.elementId },
        target: { ...element.target, elementId: idMap.get(element.target.elementId) ?? element.target.elementId },
        layer: startLayer + index,
      };
    }
    if (element.kind === "group") {
      return {
        ...cloneDiagramElement(element),
        id,
        x: element.x + offset,
        y: element.y + offset,
        childElementIds: element.childElementIds.map((childId) => idMap.get(childId) ?? childId),
        parentGroupId: element.parentGroupId ? idMap.get(element.parentGroupId) : undefined,
        layer: startLayer + index,
      };
    }
    return {
      ...cloneDiagramElement(element),
      id,
      x: element.x + offset,
      y: element.y + offset,
      parentGroupId: element.parentGroupId ? idMap.get(element.parentGroupId) : undefined,
      layer: startLayer + index,
    };
  });
  const selected = pasted.filter((element) => element.kind !== "connector" && !element.parentGroupId).map((element) => element.id);
  const next = commit(
    state,
    withPage(state.document, { ...current, elements: [...current.elements, ...pasted] }),
    at,
    selected,
  );
  return {
    ...next,
    clipboard: { ...state.clipboard, pasteCount: state.clipboard.pasteCount + 1 },
  };
}

export function diagramEditorReducer(
  state: DiagramEditorState,
  action: DiagramEditorAction,
): DiagramEditorState {
  switch (action.type) {
    case "document/replace":
      return { ...createDiagramEditorState(action.document), isDirty: !action.persisted };
    case "element/add":
    case "connector/add": {
      const element = action.type === "element/add" ? action.element : action.connector;
      const current = page(state);
      if (current.elements.some((candidate) => candidate.id === element.id)) return state;
      const next = { ...cloneDiagramElement(element), layer: current.elements.length };
      return commit(state, withPage(state.document, { ...current, elements: [...current.elements, next] }), action.at, [next.id]);
    }
    case "element/update":
    case "connector/update": {
      const id = action.type === "element/update" ? action.elementId : action.connectorId;
      const current = page(state);
      let changed = false;
      const elements = current.elements.map((element) => {
        if (element.id !== id || (element.locked && action.changes.locked !== false)) return element;
        changed = true;
        return updateElement(element, action.changes);
      });
      return changed ? commit(state, withPage(state.document, { ...current, elements }), action.at) : state;
    }
    case "elements/move": {
      const current = page(state);
      const groupDeltas = new Map<string, DiagramPoint>();
      for (const element of current.elements) {
        const position = action.positions[element.id];
        if (element.kind === "group" && position) groupDeltas.set(element.id, { x: position.x - element.x, y: position.y - element.y });
      }
      let changed = false;
      const elements = current.elements.map((element) => {
        if (!isDiagramPositionedElement(element) || element.locked) return element;
        const own = action.positions[element.id];
        const delta = element.parentGroupId ? groupDeltas.get(element.parentGroupId) : undefined;
        const position = own ?? (delta ? { x: element.x + delta.x, y: element.y + delta.y } : undefined);
        if (!position) return element;
        changed = true;
        return { ...element, ...position };
      });
      return changed ? commit(state, withPage(state.document, { ...current, elements }), action.at) : state;
    }
    case "elements/update-many": {
      const current = page(state);
      let changed = false;
      const elements = current.elements.map((element) => {
        const changes = action.changes[element.id];
        if (!changes || (element.locked && changes.locked !== false)) return element;
        changed = true;
        return updateElement(element, changes);
      });
      return changed ? commit(state, withPage(state.document, { ...current, elements }), action.at) : state;
    }
    case "element/resize": {
      const current = page(state);
      const target = current.elements.find((element) => element.id === action.elementId);
      if (!target || !isDiagramPositionedElement(target) || target.locked) return state;
      const position = action.position ?? { x: target.x, y: target.y };
      const scaleX = action.size.width / Math.max(1, target.width);
      const scaleY = action.size.height / Math.max(1, target.height);
      const elements = current.elements.map((element) => {
        if (element.id === target.id) return { ...element, ...position, ...action.size };
        if (target.kind === "group" && element.parentGroupId === target.id && isDiagramPositionedElement(element) && !element.locked) {
          return {
            ...element,
            x: position.x + (element.x - target.x) * scaleX,
            y: position.y + (element.y - target.y) * scaleY,
            width: element.width * scaleX,
            height: element.height * scaleY,
          };
        }
        return element;
      });
      return commit(state, withPage(state.document, { ...current, elements }), action.at);
    }
    case "element/rotate":
      return diagramEditorReducer(state, { type: "element/update", elementId: action.elementId, changes: { rotation: action.rotation }, at: action.at });
    case "elements/delete": {
      const current = page(state);
      const ids = new Set(action.elementIds ?? state.selectedElementIds);
      if (!ids.size) return state;
      return commit(state, withPage(state.document, { ...current, elements: normalizeDiagramLayers(removeElements(current.elements, ids)) }), action.at, []);
    }
    case "selection/set": {
      const valid = new Set(page(state).elements.map((element) => element.id));
      return { ...state, selectedElementIds: applySelection(state.selectedElementIds, action.elementIds.filter((id) => valid.has(id)), action.mode) };
    }
    case "selection/all":
      return { ...state, selectedElementIds: page(state).elements.filter((element) => element.visible).map((element) => element.id) };
    case "selection/clear":
      return state.selectedElementIds.length ? { ...state, selectedElementIds: [] } : state;
    case "clipboard/copy": {
      const elements = copySelection(state);
      return elements.length ? { ...state, clipboard: { sourcePageId: state.activePageId, elements, pasteCount: 0 } } : state;
    }
    case "clipboard/cut": {
      const elements = copySelection(state);
      if (!elements.length) return state;
      const copied = { ...state, clipboard: { sourcePageId: state.activePageId, elements, pasteCount: 0 } };
      return diagramEditorReducer(copied, { type: "elements/delete", at: action.at });
    }
    case "clipboard/paste":
      return pasteElements(state, action.at);
    case "elements/group": {
      const current = page(state);
      const selected = current.elements.filter((element): element is DiagramPositionedElement => state.selectedElementIds.includes(element.id) && isDiagramPositionedElement(element) && element.kind !== "group" && !element.parentGroupId);
      if (selected.length < 2) return state;
      const frame = bounds(selected);
      const groupId = action.groupId ?? createDiagramId("group");
      const group: DiagramGroupElement = { id: groupId, kind: "group", ...frame, rotation: 0, childElementIds: selected.map((element) => element.id), layer: current.elements.length, visible: true, locked: false, style: { fill: "transparent", stroke: "#a78bfa", strokeWidth: 1, strokeStyle: "dashed" } };
      const childIds = new Set(group.childElementIds);
      const elements = current.elements.map((element) => childIds.has(element.id) ? { ...element, parentGroupId: groupId } : element);
      return commit(state, withPage(state.document, { ...current, elements: [...elements, group] }), action.at, [groupId]);
    }
    case "group/ungroup": {
      const current = page(state);
      const groupIds = new Set(action.groupIds ?? state.selectedElementIds.filter((id) => current.elements.some((element) => element.id === id && element.kind === "group")));
      if (!groupIds.size) return state;
      const childIds: string[] = [];
      const elements = current.elements.flatMap((element) => {
        if (element.kind === "group" && groupIds.has(element.id)) {
          childIds.push(...element.childElementIds);
          return [];
        }
        return [{ ...element, parentGroupId: element.parentGroupId && groupIds.has(element.parentGroupId) ? undefined : element.parentGroupId }];
      });
      return commit(state, withPage(state.document, { ...current, elements: normalizeDiagramLayers(elements) }), action.at, childIds);
    }
    case "layer/reorder": {
      const current = page(state);
      const ids = expandGroups(current.elements, action.elementIds ?? state.selectedElementIds);
      return ids.size ? commit(state, withPage(state.document, { ...current, elements: reorder(current.elements, ids, action.direction) }), action.at) : state;
    }
    case "page/add": {
      const nextPage = createDiagramPage(action.name ?? `Page ${Object.keys(state.document.pages).length + 1}`, action.pageId);
      const next = commit(
        state,
        { ...state.document, pages: { ...state.document.pages, [nextPage.id]: nextPage } },
        action.at,
        [],
      );
      return { ...next, activePageId: nextPage.id };
    }
    case "page/create-child": {
      const current = page(state);
      const owner = current.elements.find((element) => element.id === action.elementId);
      if (!owner || (owner.kind !== "shape" && owner.kind !== "frame")) return state;
      if (owner.childPageId && state.document.pages[owner.childPageId]) {
        return { ...state, activePageId: owner.childPageId, selectedElementIds: [] };
      }
      const child = {
        ...createDiagramPage(action.name ?? `${owner.label || "Nested"} detail`, action.pageId),
        parentElementId: owner.id,
      };
      const elements = current.elements.map((element) => element.id === owner.id ? { ...owner, childPageId: child.id } : element);
      const document = {
        ...state.document,
        pages: {
          ...state.document.pages,
          [current.id]: { ...current, elements },
          [child.id]: child,
        },
      };
      return { ...commit(state, document, action.at, []), activePageId: child.id };
    }
    case "page/activate":
      return state.document.pages[action.pageId] ? { ...state, activePageId: action.pageId, selectedElementIds: [] } : state;
    case "page/delete": {
      if (action.pageId === state.document.rootPageId || !state.document.pages[action.pageId]) return state;
      const pages = { ...state.document.pages };
      delete pages[action.pageId];
      for (const [pageId, candidate] of Object.entries(pages)) {
        pages[pageId] = {
          ...candidate,
          elements: candidate.elements.map((element) =>
            (element.kind === "shape" || element.kind === "frame") && element.childPageId === action.pageId
              ? { ...element, childPageId: undefined }
              : element,
          ),
        };
      }
      return { ...commit(state, { ...state.document, pages }, action.at, []), activePageId: state.document.rootPageId };
    }
    case "viewport/set": {
      const pageId = action.pageId ?? state.activePageId;
      const target = state.document.pages[pageId];
      if (!target) return state;
      return { ...state, document: withPage(state.document, { ...target, viewport: { ...action.viewport } }), isDirty: true };
    }
    case "history/undo": {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return { ...state, document: cloneDiagramDocument(previous), activePageId: previous.pages[state.activePageId] ? state.activePageId : previous.rootPageId, selectedElementIds: [], history: state.history.slice(0, -1), future: [cloneDiagramDocument(state.document), ...state.future].slice(0, DIAGRAM_HISTORY_LIMIT), isDirty: true };
    }
    case "history/redo": {
      const next = state.future[0];
      if (!next) return state;
      return { ...state, document: cloneDiagramDocument(next), activePageId: next.pages[state.activePageId] ? state.activePageId : next.rootPageId, selectedElementIds: [], history: [...state.history, cloneDiagramDocument(state.document)].slice(-DIAGRAM_HISTORY_LIMIT), future: state.future.slice(1), isDirty: true };
    }
    case "document/mark-saved":
      return { ...state, isDirty: false };
  }
}
