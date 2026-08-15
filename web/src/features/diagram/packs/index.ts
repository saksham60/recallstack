import { createDiagramRegistry } from "../core/registry";
import { flowchartDiagramPack } from "./flowchart";
import { genericDiagramPack } from "./generic";
import { systemDesignDiagramPack } from "./system-design";
import { erdDiagramPack } from "./erd";
import { cloudDiagramPack } from "./cloud";

export * from "./flowchart";
export * from "./generic";
export * from "./system-design";
export * from "./erd";
export * from "./cloud";

export function createDefaultDiagramRegistry() {
  return createDiagramRegistry(genericDiagramPack, flowchartDiagramPack, systemDesignDiagramPack, erdDiagramPack, cloudDiagramPack);
}
