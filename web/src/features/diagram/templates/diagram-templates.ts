import type { DiagramRegistry } from "../core/registry";
import { createDiagramConnector, createDiagramDocument, createDiagramShape } from "../core/state";
import type { DiagramDocument, DiagramPoint } from "../core/types";

export type DiagramTemplateCategory = "General" | "System Design" | "Flowchart" | "ERD" | "Cloud";

export interface DiagramTemplate {
  id: string;
  label: string;
  description: string;
  category: DiagramTemplateCategory;
  enabledPackIds: readonly string[];
  create: (title: string, registry: DiagramRegistry) => DiagramDocument;
}

interface NodeSpec { key: string; shape: string; label?: string; point: DiagramPoint }
interface EdgeSpec { from: string; to: string; label?: string; routing?: "straight" | "orthogonal" }

function populated(title: string, packs: readonly string[], nodes: readonly NodeSpec[], edges: readonly EdgeSpec[], registry: DiagramRegistry): DiagramDocument {
  const document = createDiagramDocument(title, packs);
  const page = document.pages[document.rootPageId];
  const ids = new Map<string, string>();
  for (const spec of nodes) {
    if (!registry.getShape(spec.shape)) continue;
    const element = createDiagramShape(registry, spec.shape, spec.point, spec.label ? { label: spec.label } : {});
    ids.set(spec.key, element.id);
    page.elements.push(element);
  }
  for (const spec of edges) {
    const source = ids.get(spec.from); const target = ids.get(spec.to);
    if (!source || !target) continue;
    page.elements.push(createDiagramConnector(source, "right", target, "left", { routing: spec.routing ?? "orthogonal", labels: spec.label ? [{ id: `${source}_${target}_label`, text: spec.label, position: 0.5 }] : [] }));
  }
  return document;
}

function template(id: string, label: string, description: string, category: DiagramTemplateCategory, packs: readonly string[], nodes: readonly NodeSpec[] = [], edges: readonly EdgeSpec[] = []): DiagramTemplate {
  return { id, label, description, category, enabledPackIds: packs, create: (title, registry) => populated(title || label, packs, nodes, edges, registry) };
}

export const DIAGRAM_TEMPLATES: readonly DiagramTemplate[] = [
  template("blank", "Blank Diagram", "A clean canvas with general-purpose shapes.", "General", ["generic"]),
  template("web-application", "Web Application", "Client, CDN, gateway, service, cache, and database.", "System Design", ["generic", "system-design"], [
    { key: "user", shape: "system-design.user", point: { x: 40, y: 180 } }, { key: "cdn", shape: "system-design.cdn", point: { x: 230, y: 180 } }, { key: "gateway", shape: "system-design.api_gateway", point: { x: 440, y: 180 } }, { key: "service", shape: "system-design.service", point: { x: 650, y: 110 } }, { key: "cache", shape: "system-design.cache", point: { x: 860, y: 80 } }, { key: "db", shape: "system-design.sql_database", point: { x: 860, y: 230 } },
  ], [
    { from: "user", to: "cdn" }, { from: "cdn", to: "gateway" }, { from: "gateway", to: "service" }, { from: "service", to: "cache", label: "read" }, { from: "service", to: "db", label: "read/write" },
  ]),
  template("microservices", "Microservices", "Gateway with independently deployable services and data stores.", "System Design", ["generic", "system-design"], [
    { key: "gateway", shape: "system-design.api_gateway", point: { x: 80, y: 190 } }, { key: "auth", shape: "system-design.service", label: "Auth Service", point: { x: 320, y: 60 } }, { key: "order", shape: "system-design.service", label: "Order Service", point: { x: 320, y: 190 } }, { key: "payment", shape: "system-design.service", label: "Payment Service", point: { x: 320, y: 320 } }, { key: "db", shape: "system-design.sql_database", point: { x: 580, y: 190 } },
  ], [{ from: "gateway", to: "auth" }, { from: "gateway", to: "order" }, { from: "gateway", to: "payment" }, { from: "order", to: "db" }]),
  template("event-driven", "Event Driven", "Producer, event stream, consumers, and object storage.", "System Design", ["generic", "system-design"], [
    { key: "api", shape: "system-design.service", label: "Producer", point: { x: 80, y: 190 } }, { key: "stream", shape: "system-design.event_stream", point: { x: 330, y: 190 } }, { key: "worker1", shape: "system-design.worker", label: "Notification Worker", point: { x: 590, y: 90 } }, { key: "worker2", shape: "system-design.worker", label: "Analytics Worker", point: { x: 590, y: 290 } }, { key: "storage", shape: "system-design.object_storage", point: { x: 830, y: 290 } },
  ], [{ from: "api", to: "stream", label: "publish" }, { from: "stream", to: "worker1", label: "consume" }, { from: "stream", to: "worker2", label: "consume" }, { from: "worker2", to: "storage" }]),
  template("rag-application", "RAG Application", "Query, model gateway, retrieval, vector database, and LLM.", "System Design", ["generic", "system-design"], [
    { key: "user", shape: "system-design.user", point: { x: 50, y: 190 } }, { key: "gateway", shape: "system-design.model_gateway", point: { x: 260, y: 190 } }, { key: "rag", shape: "system-design.rag", point: { x: 500, y: 190 } }, { key: "vector", shape: "system-design.vector_database", point: { x: 750, y: 90 } }, { key: "llm", shape: "system-design.llm", point: { x: 750, y: 290 } },
  ], [{ from: "user", to: "gateway" }, { from: "gateway", to: "rag" }, { from: "rag", to: "vector", label: "retrieve" }, { from: "rag", to: "llm", label: "prompt" }]),
  template("blank-process", "Blank Process", "Start and end nodes ready for a process flow.", "Flowchart", ["generic", "flowchart"], [{ key: "start", shape: "flowchart.start-end", label: "Start", point: { x: 160, y: 160 } }, { key: "end", shape: "flowchart.start-end", label: "End", point: { x: 520, y: 160 } }], [{ from: "start", to: "end" }]),
  template("decision-flow", "Decision Flow", "A branching yes/no workflow.", "Flowchart", ["generic", "flowchart"], [{ key: "start", shape: "flowchart.start-end", label: "Start", point: { x: 80, y: 180 } }, { key: "validate", shape: "flowchart.process", label: "Validate", point: { x: 300, y: 170 } }, { key: "decision", shape: "flowchart.decision", label: "Valid?", point: { x: 540, y: 155 } }, { key: "yes", shape: "flowchart.process", label: "Continue", point: { x: 780, y: 80 } }, { key: "no", shape: "flowchart.process", label: "Process Error", point: { x: 780, y: 270 } }], [{ from: "start", to: "validate" }, { from: "validate", to: "decision" }, { from: "decision", to: "yes", label: "Yes" }, { from: "decision", to: "no", label: "No" }]),
  template("blank-erd", "Blank ER Diagram", "Entity and relationship tools for a data model.", "ERD", ["generic", "erd"]),
  template("blank-cloud", "Blank Cloud Architecture", "Curated AWS, GCP, and Azure service icons.", "Cloud", ["generic", "cloud"]),
] as const;

export function getDiagramTemplate(id: string): DiagramTemplate | undefined {
  return DIAGRAM_TEMPLATES.find((template) => template.id === id);
}
