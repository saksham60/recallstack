import { createEmptySystemDesignDocument, createEmptySystemDesignDiagram, createSystemDesignEdge, createSystemDesignNode } from "../../src/features/system-design/utils/system-design-defaults";
import type { ReasonAIVisualization } from "../../src/features/system-design/reasonai/visualization";

export function analysisDocument() {
  const document = createEmptySystemDesignDocument({ id: "url-shortener", title: "URL Shortener" });
  const root = document.diagrams[document.rootDiagramId];
  root.viewport = { x: 0, y: 0, zoom: 1 };
  root.nodes = [createSystemDesignNode("service", { x: 150, y: 350 }, { id: "api", label: "API" }), createSystemDesignNode("sql_database", { x: 460, y: 350 }, { id: "postgres", label: "Postgres" }), createSystemDesignNode("module", { x: 480, y: 100 }, { id: "module", label: "Analytics", isExpandable: true, childDiagramId: "child" })];
  root.edges = [createSystemDesignEdge("api", "postgres", "right", "left", { id: "edge_reads" })];
  const child = createEmptySystemDesignDiagram("Analytics", { id: "child", parentNodeId: "module" });
  child.nodes = [createSystemDesignNode("service", { x: 150, y: 200 }, { id: "nested-worker", label: "Worker", parentModuleId: "module" })];
  document.diagrams[child.id] = child;
  return document;
}

export const analysisResponse: ReasonAIVisualization = {
  type: "failure", title: "Postgres unavailable", summary: "Hypothetical: API reads fail if Postgres is unavailable and there is no alternate read path.",
  assumptions: ["Failover and replicas are not shown; their absence is not established."],
  nodes: [{ nodeId: "postgres", severity: "critical", label: "Assumed unavailable", reason: "This scenario assumes database reads fail." }, { nodeId: "api", severity: "warning", reason: "Reads depend on Postgres in the supplied graph." }],
  edges: [{ edgeId: "edge_reads", severity: "critical", reason: "The read dependency may fail in this scenario." }],
};
