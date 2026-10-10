"use client";

import { Arrow, Group, Rect, Text } from "react-konva";
import { SYSTEM_DESIGN_NODE_DEFINITIONS, isSystemDesignBoundaryNodeType } from "../constants/system-design-palette";
import type { SystemDesignDiagram } from "../types/system-design.types";
import type { ReasonAIProposal } from "./contract";

/** Purely visual overlay inside the canvas Stage. It never enters document state. */
export function ReasonAIGhostLayer({ proposal, diagram, refs = {} }: {
  proposal: ReasonAIProposal;
  diagram: SystemDesignDiagram;
  refs?: Readonly<Record<string, string>>;
}) {
  const positions = new Map(diagram.nodes.map((node) => [node.id, { x: node.x, y: node.y, width: node.width, height: node.height }]));
  for (const [ref, actual] of Object.entries(refs)) {
    const node = diagram.nodes.find((item) => item.id === actual);
    if (node) positions.set(ref, { x: node.x, y: node.y, width: node.width, height: node.height });
  }
  for (const operation of proposal.operations) {
    if (operation.op === "add_node") {
      if (refs[operation.ref]) continue;
      const definition = SYSTEM_DESIGN_NODE_DEFINITIONS[operation.type];
      positions.set(operation.ref, { x: operation.x, y: operation.y, width: definition.defaultWidth, height: definition.defaultHeight });
    }
    if (operation.op === "move_node") {
      const prior = positions.get(operation.nodeId);
      if (prior) positions.set(operation.nodeId, { ...prior, x: operation.x, y: operation.y });
    }
  }
  return <Group listening={false}>
    {proposal.operations.map((operation, index) => {
      if (operation.op !== "add_edge") return null;
      const source = positions.get(operation.sourceNodeId), target = positions.get(operation.targetNodeId);
      if (!source || !target) return null;
      return <Arrow key={`edge-${index}`} points={[source.x + source.width / 2, source.y + source.height / 2, target.x + target.width / 2, target.y + target.height / 2]} stroke="#a78bfa" fill="#a78bfa" strokeWidth={2} dash={[8, 5]} pointerLength={8} pointerWidth={8} opacity={0.75} />;
    })}
    {proposal.operations.map((operation) => {
      if (operation.op !== "add_node" || refs[operation.ref]) return null;
      const definition = SYSTEM_DESIGN_NODE_DEFINITIONS[operation.type];
      const boundary = isSystemDesignBoundaryNodeType(operation.type);
      return <Group key={`node-${operation.ref}`} x={operation.x} y={operation.y}>
        <Rect width={definition.defaultWidth} height={definition.defaultHeight} cornerRadius={boundary ? 12 : 10} fill={boundary ? "rgba(167,139,250,0.05)" : "rgba(167,139,250,0.13)"} stroke="#a78bfa" strokeWidth={2} dash={[8, 5]} />
        <Text x={12} y={12} width={definition.defaultWidth - 24} height={definition.defaultHeight - 24} text={operation.label} fontSize={14} fontStyle="bold" fill="#d8b4fe" ellipsis wrap="word" />
      </Group>;
    })}
    {proposal.operations.map((operation, index) => {
      if (operation.op !== "move_node") return null;
      const box = positions.get(operation.nodeId);
      return box ? <Rect key={`move-${index}`} x={operation.x} y={operation.y} width={box.width} height={box.height} cornerRadius={10} stroke="#38bdf8" strokeWidth={2} dash={[6, 4]} fill="rgba(56,189,248,0.09)" /> : null;
    })}
  </Group>;
}
