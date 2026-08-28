import {
  systemDesignEditorActions,
  type SystemDesignEditorAction,
} from "../state/system-design-editor-actions";
import {
  createSystemDesignEditorState,
  systemDesignEditorReducer,
} from "../state/system-design-editor-reducer";
import type {
  SystemDesignDocument,
  SystemDesignEditorState,
} from "../types/system-design.types";
import { parseSystemDesignDocument } from "../utils/diagram-validation";
import {
  CanvasOperationError,
  parseCanvasOperation,
  type CanvasOperation,
} from "./canvas-operation";
import type { RealtimeCommittedOperation } from "./realtime.types";

export interface AppliedCanvasOperation {
  action: SystemDesignEditorAction;
  state: SystemDesignEditorState;
  operation: CanvasOperation;
}

function createAction(
  operation: CanvasOperation,
  selectAddedNode: boolean,
): SystemDesignEditorAction {
  if (operation.kind === "node.add") {
    return systemDesignEditorActions.addNodeToDiagram(
      operation.diagramId,
      operation.node,
      { select: selectAddedNode },
    );
  }
  if (operation.kind === "node.move") {
    return systemDesignEditorActions.moveNodesInDiagram(
      operation.diagramId,
      operation.positions,
    );
  }
  return systemDesignEditorActions.deleteNodesFromDiagram(
    operation.diagramId,
    operation.nodeIds,
  );
}

export function applyCanvasOperation(
  editorState: SystemDesignEditorState,
  value: unknown,
  options: { selectAddedNode?: boolean } = {},
): AppliedCanvasOperation {
  const operation = parseCanvasOperation(value);
  if (!editorState.document.diagrams[operation.diagramId]) {
    throw new CanvasOperationError("Canvas operation targets an unknown diagram.");
  }
  let action = createAction(operation, options.selectAddedNode === true);
  let state = systemDesignEditorReducer(editorState, action);

  try {
    const validatedDocument = parseSystemDesignDocument(state.document);
    if (operation.kind === "node.add") {
      const validatedNode = validatedDocument.diagrams[
        operation.diagramId
      ]?.nodes.find((node) => node.id === operation.node.id);
      if (!validatedNode) {
        throw new CanvasOperationError("The node could not be added safely.");
      }
      const sanitizedOperation: CanvasOperation = {
        ...operation,
        node: validatedNode,
      };
      action = createAction(
        sanitizedOperation,
        options.selectAddedNode === true,
      );
      state = systemDesignEditorReducer(editorState, action);
      return { action, state, operation: sanitizedOperation };
    }
  } catch (error) {
    if (error instanceof CanvasOperationError) throw error;
    throw new CanvasOperationError(
      error instanceof Error
        ? error.message
        : "The canvas operation would create an invalid document.",
    );
  }

  return { action, state, operation };
}

export function reconstructRoomDocument(
  snapshot: unknown,
  operations: readonly RealtimeCommittedOperation[],
): SystemDesignDocument {
  const document = parseSystemDesignDocument(snapshot);
  let state = createSystemDesignEditorState(document, {
    persisted: false,
    loadStatus: "ready",
  });
  for (const committed of operations) {
    state = applyCanvasOperation(state, committed.payload).state;
  }
  return state.document;
}

export function applyCanvasOperationsToDocument(
  document: SystemDesignDocument,
  operations: readonly CanvasOperation[],
): SystemDesignDocument {
  let state = createSystemDesignEditorState(document, {
    persisted: false,
    loadStatus: "ready",
  });
  for (const operation of operations) {
    state = applyCanvasOperation(state, operation).state;
  }
  return state.document;
}
