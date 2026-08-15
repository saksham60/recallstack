import { createDiagramRegistry } from "../core/registry";
import { flowchartDiagramPack } from "./flowchart";
import { genericDiagramPack } from "./generic";
import { systemDesignDiagramPack } from "./system-design";

export * from "./flowchart";
export * from "./generic";
export * from "./system-design";

export function createDefaultDiagramRegistry() {
  return createDiagramRegistry(genericDiagramPack, flowchartDiagramPack, systemDesignDiagramPack);
}
