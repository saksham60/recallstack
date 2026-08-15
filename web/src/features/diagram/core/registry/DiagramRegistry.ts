import type {
  DiagramPack,
  DiagramShapeDefinition,
  DiagramShapeRenderer,
} from "../types";

export class DiagramRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagramRegistryError";
  }
}

/**
 * Runtime registry for domain-owned packs and renderers.
 *
 * The canvas resolves stable IDs through this registry; it never branches on
 * a pack name or a domain concept such as database, decision, or queue.
 */
export class DiagramRegistry {
  private readonly packs = new Map<string, DiagramPack>();
  private readonly shapes = new Map<string, DiagramShapeDefinition>();
  private readonly renderers = new Map<string, DiagramShapeRenderer>();

  registerPack(pack: DiagramPack): this {
    if (this.packs.has(pack.id)) {
      throw new DiagramRegistryError(`Diagram pack "${pack.id}" is already registered.`);
    }

    const localShapeIds = new Set<string>();
    for (const shape of pack.shapes) {
      if (shape.packId !== pack.id) {
        throw new DiagramRegistryError(
          `Shape "${shape.id}" must declare packId "${pack.id}".`,
        );
      }
      if (localShapeIds.has(shape.id) || this.shapes.has(shape.id)) {
        throw new DiagramRegistryError(`Shape "${shape.id}" is already registered.`);
      }
      if (!shape.id.startsWith(`${pack.id}.`)) {
        throw new DiagramRegistryError(
          `Shape "${shape.id}" must use the "${pack.id}." namespace.`,
        );
      }
      localShapeIds.add(shape.id);
    }

    for (const [rendererId, renderer] of Object.entries(pack.renderers ?? {})) {
      const existing = this.renderers.get(rendererId);
      if (existing && existing !== renderer) {
        throw new DiagramRegistryError(
          `Renderer "${rendererId}" is already registered by another pack.`,
        );
      }
    }

    this.packs.set(pack.id, pack);
    for (const shape of pack.shapes) this.shapes.set(shape.id, shape);
    for (const [rendererId, renderer] of Object.entries(pack.renderers ?? {})) {
      this.renderers.set(rendererId, renderer);
    }
    return this;
  }

  getPack(id: string): DiagramPack | undefined {
    return this.packs.get(id);
  }

  requirePack(id: string): DiagramPack {
    const pack = this.getPack(id);
    if (!pack) throw new DiagramRegistryError(`Unknown diagram pack "${id}".`);
    return pack;
  }

  listPacks(enabledPackIds?: readonly string[]): DiagramPack[] {
    const enabled = enabledPackIds ? new Set(enabledPackIds) : null;
    return [...this.packs.values()].filter((pack) => !enabled || enabled.has(pack.id));
  }

  getShape(id: string): DiagramShapeDefinition | undefined {
    return this.shapes.get(id);
  }

  requireShape(id: string): DiagramShapeDefinition {
    const shape = this.getShape(id);
    if (!shape) throw new DiagramRegistryError(`Unknown diagram shape "${id}".`);
    return shape;
  }

  listShapes(enabledPackIds?: readonly string[]): DiagramShapeDefinition[] {
    const enabled = enabledPackIds ? new Set(enabledPackIds) : null;
    return [...this.shapes.values()].filter(
      (shape) => !enabled || enabled.has(shape.packId),
    );
  }

  resolveRenderer(definition: DiagramShapeDefinition): DiagramShapeRenderer {
    const renderer = this.renderers.get(definition.rendererId);
    if (!renderer) {
      throw new DiagramRegistryError(
        `Renderer "${definition.rendererId}" for shape "${definition.id}" is not registered.`,
      );
    }
    return renderer;
  }
}

export function createDiagramRegistry(...packs: readonly DiagramPack[]): DiagramRegistry {
  const registry = new DiagramRegistry();
  for (const pack of packs) registry.registerPack(pack);
  return registry;
}
