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
  DiagramElementTransform,
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

function validTransform(transform: DiagramElementTransform | undefined): transform is DiagramElementTransform {
  return Boolean(
    transform &&
    Number.isFinite(transform.x) &&
    Number.isFinite(transform.y) &&
    Number.isFinite(transform.width) &&
    Number.isFinite(transform.height) &&
    Number.isFinite(transform.rotation) &&
    transform.width > 0 &&
    transform.height > 0,
  );
}

function groupDescendantIds(
  elements: readonly DiagramElement[],
  groupId: string,
): Set<string> {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const descendants = new Set<string>();
  const pending = [groupId];
  while (pending.length) {
    const current = byId.get(pending.pop()!);
    if (current?.kind !== "group") continue;
    for (const childId of current.childElementIds) {
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      if (byId.get(childId)?.kind === "group") pending.push(childId);
    }
  }
  return descendants;
}

function rotateAround(point: DiagramPoint, center: DiagramPoint, degrees: number): DiagramPoint {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cosine - dy * sine,
    y: center.y + dx * sine + dy * cosine,
  };
}

function transformPoint(
  point: DiagramPoint,
  before: DiagramPositionedElement,
  after: DiagramElementTransform,
): DiagramPoint {
  const beforeCenter = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  const afterCenter = { x: after.x + after.width / 2, y: after.y + after.height / 2 };
  const local = rotateAround(point, beforeCenter, -before.rotation);
  const scaled = {
    x: afterCenter.x + (local.x - beforeCenter.x) * after.width / before.width,
    y: afterCenter.y + (local.y - beforeCenter.y) * after.height / before.height,
  };
  return rotateAround(scaled, afterCenter, after.rotation);
}

function transformPositioned(
  element: DiagramPositionedElement,
  before: DiagramPositionedElement,
  after: DiagramElementTransform,
): DiagramPositionedElement {
  const center = transformPoint(
    { x: element.x + element.width / 2, y: element.y + element.height / 2 },
    before,
    after,
  );
  const scaleX = after.width / before.width;
  const scaleY = after.height / before.height;
  const width = element.width * Math.abs(scaleX);
  const height = element.height * Math.abs(scaleY);
  return {
    ...element,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    rotation: element.rotation + after.rotation - before.rotation,
  };
}

function transformElements(
  elements: readonly DiagramElement[],
  transforms: Readonly<Record<string, DiagramElementTransform>>,
): { elements: DiagramElement[]; changed: boolean } {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const roots = Object.entries(transforms).flatMap(([id, transform]) => {
    const element = byId.get(id);
    if (!element || !isDiagramPositionedElement(element) || element.locked || !validTransform(transform)) return [];
    if (element.parentGroupId && validTransform(transforms[element.parentGroupId])) return [];
    if (element.kind === "group") {
      const descendants = groupDescendantIds(elements, element.id);
      if ([...descendants].some((childId) => byId.get(childId)?.locked)) return [];
    }
    return [{ element, transform }];
  });
  if (!roots.length) return { elements: [...elements], changed: false };

  const replacements = new Map<string, DiagramElement>();
  const transformedGroupChildren = new Set<string>();
  const groupsNeedingBounds = new Set<string>();
  for (const { element, transform } of roots) {
    replacements.set(element.id, { ...element, ...transform });
    if (element.parentGroupId) groupsNeedingBounds.add(element.parentGroupId);
    if (element.kind !== "group") continue;
    const descendants = groupDescendantIds(elements, element.id);
    for (const childId of descendants) {
      const child = byId.get(childId);
      if (!child || !isDiagramPositionedElement(child)) continue;
      replacements.set(childId, transformPositioned(child, element, transform));
      transformedGroupChildren.add(childId);
    }
    const ownedEndpointIds = new Set([element.id, ...descendants]);
    for (const connector of elements) {
      if (
        connector.kind === "connector" &&
        connector.waypoints.length > 0 &&
        ownedEndpointIds.has(connector.source.elementId) &&
        ownedEndpointIds.has(connector.target.elementId)
      ) {
        replacements.set(connector.id, {
          ...connector,
          waypoints: connector.waypoints.map((point) => transformPoint(point, element, transform)),
        });
      }
    }
  }

  let next = elements.map((element) => replacements.get(element.id) ?? element);
  if (groupsNeedingBounds.size) {
    next = next.map((element) => {
      if (element.kind !== "group" || !groupsNeedingBounds.has(element.id) || transformedGroupChildren.has(element.id)) return element;
      const children = next.filter((candidate): candidate is DiagramPositionedElement =>
        element.childElementIds.includes(candidate.id) && isDiagramPositionedElement(candidate),
      );
      return children.length ? { ...element, ...bounds(children) } : element;
    });
  }
  return { elements: next, changed: replacements.size > 0 };
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
      source: patch.source ? { ...patch.source } : element.source,
      target: patch.target ? { ...patch.target } : element.target,
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

function withoutGeometry(patch: DiagramElementPatch): DiagramElementPatch {
  const rest = { ...patch };
  delete rest.x;
  delete rest.y;
  delete rest.width;
  delete rest.height;
  delete rest.rotation;
  return rest;
}

function patchTransform(
  element: DiagramPositionedElement,
  patch: DiagramElementPatch,
): DiagramElementTransform | undefined {
  if (
    patch.x === undefined &&
    patch.y === undefined &&
    patch.width === undefined &&
    patch.height === undefined &&
    patch.rotation === undefined
  ) return undefined;
  return {
    x: patch.x ?? element.x,
    y: patch.y ?? element.y,
    width: patch.width ?? element.width,
    height: patch.height ?? element.height,
    rotation: patch.rotation ?? element.rotation,
  };
}

function removeElements(current: readonly DiagramElement[], ids: Set<string>): DiagramElement[] {
  const removed = new Set(ids);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const element of current) {
      if (element.kind !== "group" || !removed.has(element.id)) continue;
      for (const childId of element.childElementIds) {
        if (!removed.has(childId)) {
          removed.add(childId);
          expanded = true;
        }
      }
    }
  }
  let next = current
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
  const dissolving = new Set(
    next
      .filter((element): element is DiagramGroupElement => element.kind === "group")
      .filter((group) => group.childElementIds.filter((childId) => !removed.has(childId)).length < 2)
      .map((group) => group.id),
  );
  next = next
    .filter((element) => !dissolving.has(element.id))
    .map((element) => {
      if (element.kind === "group") {
        const childElementIds = element.childElementIds.filter((childId) => !removed.has(childId));
        const children = next.filter((candidate): candidate is DiagramPositionedElement =>
          childElementIds.includes(candidate.id) && isDiagramPositionedElement(candidate),
        );
        return children.length ? { ...element, ...bounds(children), childElementIds } : element;
      }
      return element.parentGroupId && dissolving.has(element.parentGroupId)
        ? { ...element, parentGroupId: undefined }
        : element;
    });
  return next;
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
  const selected = pasted.filter((element) => element.kind === "connector" || !element.parentGroupId).map((element) => element.id);
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

function duplicatePageHierarchy(
  document: DiagramDocument,
  sourcePageId: string,
  rootPageIdOverride?: string,
): { pages: Record<string, DiagramPage>; rootPageId: string } | null {
  const clonedPages: Record<string, DiagramPage> = {};
  const visiting = new Set<string>();
  const clonePage = (pageId: string, parentElementId?: string, idOverride?: string): string | null => {
    const source = document.pages[pageId];
    if (!source || visiting.has(pageId)) return null;
    visiting.add(pageId);
    const nextPageId = idOverride ?? createDiagramId("page");
    const elementIdMap = new Map(source.elements.map((element) => [element.id, createDiagramId(element.kind)]));
    const elements = source.elements.map((element): DiagramElement => {
      const id = elementIdMap.get(element.id)!;
      if (element.kind === "connector") return {
        ...cloneDiagramElement(element),
        id,
        source: { ...element.source, elementId: elementIdMap.get(element.source.elementId) ?? element.source.elementId },
        target: { ...element.target, elementId: elementIdMap.get(element.target.elementId) ?? element.target.elementId },
      };
      const parentGroupId = element.parentGroupId ? elementIdMap.get(element.parentGroupId) : undefined;
      if (element.kind === "group") return { ...cloneDiagramElement(element), id, parentGroupId, childElementIds: element.childElementIds.map((childId) => elementIdMap.get(childId) ?? childId) };
      if (element.kind === "shape") return { ...cloneDiagramElement(element), id, parentGroupId, childPageId: element.childPageId ? clonePage(element.childPageId, id) ?? undefined : undefined };
      if (element.kind === "frame") return { ...cloneDiagramElement(element), id, parentGroupId, childPageId: element.childPageId ? clonePage(element.childPageId, id) ?? undefined : undefined };
      if (element.kind === "text") return { ...cloneDiagramElement(element), id, parentGroupId };
      return { ...cloneDiagramElement(element), id, parentGroupId };
    });
    clonedPages[nextPageId] = {
      ...structuredClone(source),
      id: nextPageId,
      name: parentElementId ? source.name : `${source.name} Copy`,
      parentElementId,
      elements,
    };
    visiting.delete(pageId);
    return nextPageId;
  };
  const rootPageId = clonePage(sourcePageId, undefined, rootPageIdOverride);
  return rootPageId ? { pages: clonedPages, rootPageId } : null;
}

function pageDeletionSet(document: DiagramDocument, pageId: string): Set<string> {
  const deleting = new Set([pageId]);
  let changed = true;
  while (changed) {
    changed = false;
    const ownerIds = new Set([...deleting].flatMap((id) => document.pages[id]?.elements.map((element) => element.id) ?? []));
    for (const candidate of Object.values(document.pages)) {
      if (candidate.parentElementId && ownerIds.has(candidate.parentElementId) && !deleting.has(candidate.id)) {
        deleting.add(candidate.id);
        changed = true;
      }
    }
  }
  return deleting;
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
      if (element.kind === "connector") {
        const source = current.elements.find((candidate) => candidate.id === element.source.elementId);
        const target = current.elements.find((candidate) => candidate.id === element.target.elementId);
        if (!source || !target || !isDiagramPositionedElement(source) || !isDiagramPositionedElement(target) || source.id === target.id) return state;
      }
      const next = { ...cloneDiagramElement(element), layer: current.elements.length };
      return commit(state, withPage(state.document, { ...current, elements: [...current.elements, next] }), action.at, [next.id]);
    }
    case "element/update":
    case "connector/update": {
      const id = action.type === "element/update" ? action.elementId : action.connectorId;
      const current = page(state);
      const original = current.elements.find((element) => element.id === id);
      if (!original || (original.locked && action.changes.locked !== false)) return state;
      if (original.kind === "connector" && (action.changes.source || action.changes.target)) {
        const sourceId = action.changes.source?.elementId ?? original.source.elementId;
        const targetId = action.changes.target?.elementId ?? original.target.elementId;
        const source = current.elements.find((element) => element.id === sourceId);
        const target = current.elements.find((element) => element.id === targetId);
        if (!source || !target || !isDiagramPositionedElement(source) || !isDiagramPositionedElement(target) || sourceId === targetId) return state;
      }
      const transform = isDiagramPositionedElement(original)
        ? patchTransform(original, action.changes)
        : undefined;
      const transformed = transform
        ? transformElements(current.elements, { [id]: transform })
        : { elements: [...current.elements], changed: false };
      const contentPatch = transform ? withoutGeometry(action.changes) : action.changes;
      const hasContentPatch = Object.keys(contentPatch).length > 0;
      let changed = transformed.changed;
      const elements = transformed.elements.map((element) => {
        if (element.id !== id || (element.locked && action.changes.locked !== false)) return element;
        if (!hasContentPatch) return element;
        changed = true;
        return updateElement(element, contentPatch);
      });
      return changed ? commit(state, withPage(state.document, { ...current, elements }), action.at) : state;
    }
    case "elements/move": {
      const current = page(state);
      const transforms = Object.fromEntries(current.elements.flatMap((element) => {
        const position = action.positions[element.id];
        return position && isDiagramPositionedElement(element)
          ? [[element.id, { ...position, width: element.width, height: element.height, rotation: element.rotation }]]
          : [];
      }));
      const result = transformElements(current.elements, transforms);
      return result.changed ? commit(state, withPage(state.document, { ...current, elements: result.elements }), action.at) : state;
    }
    case "elements/transform": {
      const current = page(state);
      const result = transformElements(current.elements, action.transforms);
      return result.changed ? commit(state, withPage(state.document, { ...current, elements: result.elements }), action.at) : state;
    }
    case "elements/update-many": {
      const current = page(state);
      const transforms: Record<string, DiagramElementTransform> = {};
      for (const element of current.elements) {
        if (!isDiagramPositionedElement(element)) continue;
        const transform = patchTransform(element, action.changes[element.id] ?? {});
        if (transform) transforms[element.id] = transform;
      }
      const transformed = transformElements(current.elements, transforms);
      let changed = transformed.changed;
      const elements = transformed.elements.map((element) => {
        const changes = action.changes[element.id];
        if (!changes || (element.locked && changes.locked !== false)) return element;
        const contentPatch = transforms[element.id] ? withoutGeometry(changes) : changes;
        if (!Object.keys(contentPatch).length) return element;
        changed = true;
        return updateElement(element, contentPatch);
      });
      return changed ? commit(state, withPage(state.document, { ...current, elements }), action.at) : state;
    }
    case "element/resize": {
      const current = page(state);
      const target = current.elements.find((element) => element.id === action.elementId);
      if (!target || !isDiagramPositionedElement(target) || target.locked) return state;
      const transform = {
        ...(action.position ?? { x: target.x, y: target.y }),
        ...action.size,
        rotation: target.rotation,
      };
      const result = transformElements(current.elements, { [target.id]: transform });
      return result.changed ? commit(state, withPage(state.document, { ...current, elements: result.elements }), action.at) : state;
    }
    case "element/rotate": {
      const current = page(state);
      const target = current.elements.find((element) => element.id === action.elementId);
      if (!target || !isDiagramPositionedElement(target)) return state;
      const result = transformElements(current.elements, {
        [target.id]: { x: target.x, y: target.y, width: target.width, height: target.height, rotation: action.rotation },
      });
      return result.changed ? commit(state, withPage(state.document, { ...current, elements: result.elements }), action.at) : state;
    }
    case "elements/delete": {
      const current = page(state);
      const requested = new Set(action.elementIds ?? state.selectedElementIds);
      const ids = new Set(
        current.elements.flatMap((element) => {
          if (!requested.has(element.id) || element.locked) return [];
          if (element.kind === "group") {
            const descendants = groupDescendantIds(current.elements, element.id);
            if ([...descendants].some((childId) => current.elements.find((candidate) => candidate.id === childId)?.locked)) return [];
          }
          return [element.id];
        }),
      );
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
      const selected = current.elements.filter((element): element is DiagramPositionedElement => state.selectedElementIds.includes(element.id) && isDiagramPositionedElement(element) && element.kind !== "group" && !element.parentGroupId && !element.locked);
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
      const groupIds = new Set(action.groupIds ?? state.selectedElementIds.filter((id) => current.elements.some((element) => element.id === id && element.kind === "group" && !element.locked)));
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
      const nextPage = createDiagramPage(action.name ?? `Page ${state.document.pageOrder.length + 1}`, action.pageId);
      const next = commit(
        state,
        { ...state.document, pageOrder: [...state.document.pageOrder, nextPage.id], pages: { ...state.document.pages, [nextPage.id]: nextPage } },
        action.at,
        [],
      );
      return { ...next, activePageId: nextPage.id };
    }
    case "page/rename": {
      const target = state.document.pages[action.pageId];
      const name = action.name.trim();
      if (!target || !name || target.name === name) return state;
      return commit(state, withPage(state.document, { ...target, name }), action.at);
    }
    case "page/duplicate": {
      if (!state.document.pageOrder.includes(action.pageId)) return state;
      const duplicate = duplicatePageHierarchy(state.document, action.pageId, action.pageIdOverride);
      if (!duplicate) return state;
      const sourceIndex = state.document.pageOrder.indexOf(action.pageId);
      const pageOrder = [...state.document.pageOrder];
      pageOrder.splice(sourceIndex + 1, 0, duplicate.rootPageId);
      const document = { ...state.document, pageOrder, pages: { ...state.document.pages, ...duplicate.pages } };
      return { ...commit(state, document, action.at, []), activePageId: duplicate.rootPageId };
    }
    case "page/reorder": {
      const fromIndex = state.document.pageOrder.indexOf(action.pageId);
      if (fromIndex <= 0) return state;
      const toIndex = Math.max(1, Math.min(state.document.pageOrder.length - 1, Math.trunc(action.toIndex)));
      if (fromIndex === toIndex) return state;
      const pageOrder = [...state.document.pageOrder];
      const [moved] = pageOrder.splice(fromIndex, 1);
      pageOrder.splice(toIndex, 0, moved);
      return commit(state, { ...state.document, pageOrder }, action.at);
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
      const deleting = pageDeletionSet(state.document, action.pageId);
      const pages = Object.fromEntries(Object.entries(state.document.pages).filter(([pageId]) => !deleting.has(pageId)));
      for (const [pageId, candidate] of Object.entries(pages)) {
        pages[pageId] = {
          ...candidate,
          elements: candidate.elements.map((element) =>
            (element.kind === "shape" || element.kind === "frame") && element.childPageId && deleting.has(element.childPageId)
              ? { ...element, childPageId: undefined }
              : element,
          ),
        };
      }
      const pageOrder = state.document.pageOrder.filter((pageId) => !deleting.has(pageId));
      return { ...commit(state, { ...state.document, pageOrder, pages }, action.at, []), activePageId: deleting.has(state.activePageId) ? state.document.rootPageId : state.activePageId };
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
      return {
        ...state,
        document: action.persistedDocument?.id === state.document.id
          ? {
              ...state.document,
              revision: action.persistedDocument.revision,
              title: action.persistedDocument.title,
              createdAt: action.persistedDocument.createdAt,
              updatedAt: action.persistedDocument.updatedAt,
            }
          : state.document,
        isDirty: false,
      };
  }
}
