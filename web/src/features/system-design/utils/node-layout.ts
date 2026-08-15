import type {
  SystemDesignNode,
  SystemDesignPoint,
} from "../types/system-design.types";

export type SystemDesignAlignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

export type SystemDesignDistribution = "horizontal" | "vertical";

export type SystemDesignSizeMatch = "width" | "height";

export function snapSystemDesignPointToGrid(
  point: SystemDesignPoint,
  gridSize: number,
): SystemDesignPoint {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return { ...point };
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

export function snapSystemDesignNodeToObjects(
  node: Pick<SystemDesignNode, "id" | "width" | "height">,
  position: SystemDesignPoint,
  candidates: readonly SystemDesignNode[],
  options: {
    threshold: number;
    ignoredNodeIds?: ReadonlySet<string>;
  },
): SystemDesignPoint {
  if (!Number.isFinite(options.threshold) || options.threshold <= 0) {
    return { ...position };
  }
  const ignored = options.ignoredNodeIds ?? new Set([node.id]);
  const draggedX = [
    position.x,
    position.x + node.width / 2,
    position.x + node.width,
  ];
  const draggedY = [
    position.y,
    position.y + node.height / 2,
    position.y + node.height,
  ];
  let closestDeltaX: number | null = null;
  let closestDeltaY: number | null = null;

  candidates.forEach((candidate) => {
    if (ignored.has(candidate.id) || candidate.visible === false) return;
    const anchorsX = [
      candidate.x,
      candidate.x + candidate.width / 2,
      candidate.x + candidate.width,
    ];
    const anchorsY = [
      candidate.y,
      candidate.y + candidate.height / 2,
      candidate.y + candidate.height,
    ];
    anchorsX.forEach((anchor) => {
      draggedX.forEach((value) => {
        const delta = anchor - value;
        if (
          Math.abs(delta) <= options.threshold &&
          (closestDeltaX === null ||
            Math.abs(delta) < Math.abs(closestDeltaX))
        ) {
          closestDeltaX = delta;
        }
      });
    });
    anchorsY.forEach((anchor) => {
      draggedY.forEach((value) => {
        const delta = anchor - value;
        if (
          Math.abs(delta) <= options.threshold &&
          (closestDeltaY === null ||
            Math.abs(delta) < Math.abs(closestDeltaY))
        ) {
          closestDeltaY = delta;
        }
      });
    });
  });

  return {
    x: position.x + (closestDeltaX ?? 0),
    y: position.y + (closestDeltaY ?? 0),
  };
}

export function alignSystemDesignNodes(
  nodes: readonly SystemDesignNode[],
  alignment: SystemDesignAlignment,
): Readonly<Record<string, SystemDesignPoint>> {
  const movable = nodes.filter((node) => !node.locked);
  if (movable.length < 2) return {};
  const left = Math.min(...movable.map((node) => node.x));
  const top = Math.min(...movable.map((node) => node.y));
  const right = Math.max(
    ...movable.map((node) => node.x + node.width),
  );
  const bottom = Math.max(
    ...movable.map((node) => node.y + node.height),
  );
  const center = (left + right) / 2;
  const middle = (top + bottom) / 2;

  return Object.fromEntries(
    movable.map((node) => {
      let x = node.x;
      let y = node.y;
      if (alignment === "left") x = left;
      if (alignment === "center") x = center - node.width / 2;
      if (alignment === "right") x = right - node.width;
      if (alignment === "top") y = top;
      if (alignment === "middle") y = middle - node.height / 2;
      if (alignment === "bottom") y = bottom - node.height;
      return [node.id, { x, y }];
    }),
  );
}

export function distributeSystemDesignNodes(
  nodes: readonly SystemDesignNode[],
  distribution: SystemDesignDistribution,
): Readonly<Record<string, SystemDesignPoint>> {
  const movable = nodes.filter((node) => !node.locked);
  if (movable.length < 3) return {};

  if (distribution === "horizontal") {
    const sorted = [...movable].sort((left, right) => left.x - right.x);
    const first = sorted[0];
    const last = sorted.at(-1)!;
    const firstCenter = first.x + first.width / 2;
    const lastCenter = last.x + last.width / 2;
    const step = (lastCenter - firstCenter) / (sorted.length - 1);
    return Object.fromEntries(
      sorted.map((node, index) => [
        node.id,
        {
          x: firstCenter + step * index - node.width / 2,
          y: node.y,
        },
      ]),
    );
  }

  const sorted = [...movable].sort((top, bottom) => top.y - bottom.y);
  const first = sorted[0];
  const last = sorted.at(-1)!;
  const firstCenter = first.y + first.height / 2;
  const lastCenter = last.y + last.height / 2;
  const step = (lastCenter - firstCenter) / (sorted.length - 1);
  return Object.fromEntries(
    sorted.map((node, index) => [
      node.id,
      {
        x: node.x,
        y: firstCenter + step * index - node.height / 2,
      },
    ]),
  );
}

export function spaceSystemDesignNodesEvenly(
  nodes: readonly SystemDesignNode[],
  distribution: SystemDesignDistribution,
): Readonly<Record<string, SystemDesignPoint>> {
  const movable = nodes.filter((node) => !node.locked);
  if (movable.length < 3) return {};

  if (distribution === "horizontal") {
    const sorted = [...movable].sort((left, right) => left.x - right.x);
    const first = sorted[0];
    const last = sorted.at(-1)!;
    const totalWidth = sorted.reduce(
      (total, node) => total + node.width,
      0,
    );
    const available = last.x + last.width - first.x - totalWidth;
    const gap = available / (sorted.length - 1);
    let cursor = first.x;
    return Object.fromEntries(
      sorted.map((node) => {
        const point = { x: cursor, y: node.y };
        cursor += node.width + gap;
        return [node.id, point];
      }),
    );
  }

  const sorted = [...movable].sort((top, bottom) => top.y - bottom.y);
  const first = sorted[0];
  const last = sorted.at(-1)!;
  const totalHeight = sorted.reduce(
    (total, node) => total + node.height,
    0,
  );
  const available =
    last.y + last.height - first.y - totalHeight;
  const gap = available / (sorted.length - 1);
  let cursor = first.y;
  return Object.fromEntries(
    sorted.map((node) => {
      const point = { x: node.x, y: cursor };
      cursor += node.height + gap;
      return [node.id, point];
    }),
  );
}

export function matchSystemDesignNodeSizes(
  nodes: readonly SystemDesignNode[],
  dimension: SystemDesignSizeMatch,
): Readonly<
  Record<
    string,
    { width: number; height: number; x: number; y: number }
  >
> {
  const movable = nodes.filter((node) => !node.locked);
  if (movable.length < 2) return {};
  const reference = movable[0];

  return Object.fromEntries(
    movable.map((node) => [
      node.id,
      {
        x: node.x,
        y: node.y,
        width:
          dimension === "width" ? reference.width : node.width,
        height:
          dimension === "height" ? reference.height : node.height,
      },
    ]),
  );
}
