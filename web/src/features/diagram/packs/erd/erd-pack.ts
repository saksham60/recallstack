import type { DiagramInspectorFieldDefinition, DiagramPack, DiagramShapeDefinition } from "../../core/types";
import { COMMON_DIAGRAM_INSPECTOR_FIELDS, DEFAULT_DIAGRAM_PORTS } from "../../core/registry";
import { GenericShapeRenderer } from "../generic";
import { ErdEntityRenderer } from "./ErdEntityRenderer";
import { ErdFieldsField } from "./ErdFieldsField";
import { renderErdEntitySvg, renderErdSimpleSvg } from "./erd-svg";

const fieldsControl: DiagramInspectorFieldDefinition = { id: "fields", label: "Fields", section: "content", control: "erd.fields", path: "data.fields" };
const style = { fill: "#18181b", stroke: "#38bdf8", strokeWidth: 1.5, opacity: 1, cornerRadius: 8 } as const;

const entity: DiagramShapeDefinition = {
  id: "erd.entity", packId: "erd", label: "Entity / Table", category: "entities", keywords: ["entity", "table", "database", "fields", "columns"], icon: "table", rendererId: "erd.entity", defaultSize: { width: 250, height: 154 }, minimumSize: { width: 190, height: 80 }, resize: { horizontal: true, vertical: true }, rotatable: false, ports: DEFAULT_DIAGRAM_PORTS, defaultStyle: style, defaultTextStyle: { color: "#f8fafc", fontSize: 14, fontWeight: "bold", align: "left", verticalAlign: "top", padding: 10 }, inspector: [COMMON_DIAGRAM_INSPECTOR_FIELDS[0], fieldsControl, ...COMMON_DIAGRAM_INSPECTOR_FIELDS.slice(1)], rendersOwnLabel: true, data: { fields: [{ key: "PK", name: "id", dataType: "UUID" }, { key: "", name: "name", dataType: "TEXT" }] }, exportSvg: renderErdEntitySvg,
};

function keyShape(id: string, label: string, key: "" | "PK" | "FK", icon: string): DiagramShapeDefinition {
  return { id: `erd.${id}`, packId: "erd", label, category: "fields", keywords: [label.toLowerCase(), key.toLowerCase(), "attribute", "field"], icon, rendererId: "generic.rounded-rectangle", defaultSize: { width: 150, height: 52 }, minimumSize: { width: 80, height: 36 }, resize: { horizontal: true, vertical: true }, rotatable: true, ports: DEFAULT_DIAGRAM_PORTS, defaultStyle: { ...style, stroke: key === "PK" ? "#fbbf24" : key === "FK" ? "#c084fc" : "#38bdf8" }, defaultTextStyle: { color: "#f4f4f5", fontSize: 12, fontWeight: "medium", align: "center", verticalAlign: "middle", padding: 8 }, inspector: COMMON_DIAGRAM_INSPECTOR_FIELDS, data: { erdKey: key }, exportSvg: renderErdSimpleSvg };
}

export const ERD_PACK_SHAPES = [entity, keyShape("attribute", "Attribute / Field", "", "key"), keyShape("primary-key", "Primary Key", "PK", "key-round"), keyShape("foreign-key", "Foreign Key", "FK", "key")] as const;

export const erdDiagramPack: DiagramPack = {
  id: "erd", label: "ER Diagram", description: "Entities, typed fields, primary and foreign keys, and crow's-foot relationships.", icon: "table",
  categories: [{ id: "entities", label: "Entities", order: 0 }, { id: "fields", label: "Fields & Keys", order: 1 }], shapes: ERD_PACK_SHAPES,
  renderers: { "erd.entity": ErdEntityRenderer, "generic.rounded-rectangle": GenericShapeRenderer },
  inspectorControls: { "erd.fields": ErdFieldsField },
  decorateConnector: (connector) => ({ ...connector, routing: "orthogonal", style: { ...connector.style, startArrowhead: "one", endArrowhead: "many" }, data: { ...connector.data, packId: "erd", cardinality: "1:N" } }),
};
