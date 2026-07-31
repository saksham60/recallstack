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
    const totalWidth = sorted.reduce(
      (total, node) => total + node.width,
      0,
    );
    const available =
      last.x + last.width - first.x - totalWidth;
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

