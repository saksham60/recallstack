"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Konva from "konva";
import { Group, Line, Rect, Text } from "react-konva";
import type { SystemDesignDiagram, SystemDesignNode } from "../types/system-design.types";
import type { SystemDesignCanvasTheme } from "../components/SystemDesignNodeRenderer";
import { getNodePortPosition } from "../components/SystemDesignEdgeRenderer";
import { getSystemDesignConnectionPoints } from "../utils/canvas-geometry";
import { resolveSystemDesignEdgeStyle } from "../constants/system-design-edge-registry";
import type { ReasonAISeverity, ReasonAIVisualization } from "./visualization";

export function ReasonAIAnalysisLayer({ visualization, diagram, nodeRefs, theme }: {
  visualization: ReasonAIVisualization; diagram: SystemDesignDiagram;
  nodeRefs: RefObject<Map<string, Konva.Group>>; theme: SystemDesignCanvasTheme;
}) {
  const overlay = useRef<Konva.Group>(null);
  const groups = useRef(new Map<string, Konva.Group>());
  const lines = useRef(new Map<string, Konva.Line>());
  const colors: Record<ReasonAISeverity, string> = { critical: theme.danger, warning: theme.warning, healthy: theme.success, info: theme.accent };
  const nodes = new Map(diagram.nodes.filter((node) => node.visible !== false).map((node) => [node.id, node]));
  useEffect(() => {
    let animation: number;
    let previous = "";
    function refresh() {
      const frames = new Map<string, SystemDesignNode>();
      for (const node of diagram.nodes) {
        const actual = nodeRefs.current.get(node.id);
        frames.set(node.id, actual ? { ...node, x: actual.x(), y: actual.y(), width: node.width * actual.scaleX(), height: node.height * actual.scaleY() } : node);
      }
      const geometry = JSON.stringify([...frames.values()].map(({ x, y, width, height }) => [x, y, width, height]));
      if (geometry !== previous) {
        previous = geometry;
        for (const annotation of visualization.nodes) {
          const node = frames.get(annotation.nodeId), group = groups.current.get(annotation.nodeId);
          if (!node || !group) continue;
          group.position({ x: node.x, y: node.y });
          group.findOne<Konva.Rect>(".analysis-ring")?.size({ width: node.width + 10, height: node.height + 10 });
        }
        for (const annotation of visualization.edges) {
          const edge = diagram.edges.find((edge) => edge.id === annotation.edgeId);
          if (!edge) continue;
          const from = frames.get(edge.sourceNodeId), to = frames.get(edge.targetNodeId);
          if (from && to) lines.current.get(edge.id)?.points(getSystemDesignConnectionPoints(getNodePortPosition(from, edge.sourcePort), getNodePortPosition(to, edge.targetPort), resolveSystemDesignEdgeStyle(edge).routing));
        }
        overlay.current?.getLayer()?.batchDraw();
      }
      animation = requestAnimationFrame(refresh);
    }
    refresh();
    return () => cancelAnimationFrame(animation);
  }, [diagram.nodes, diagram.edges, nodeRefs, visualization]);
  // Share the existing interaction layer: passive annotations do not allocate
  // another full-size canvas or force static architecture nodes to redraw.
  return <Group ref={overlay} name="reasonai-analysis" listening={false}>
    {visualization.edges.map((annotation) => {
      const edge = diagram.edges.find((edge) => edge.id === annotation.edgeId);
      if (!edge) return null;
      const from = nodes.get(edge.sourceNodeId), to = nodes.get(edge.targetNodeId);
      if (!from || !to) return null;
      const routing = resolveSystemDesignEdgeStyle(edge).routing;
      return <Line key={edge.id} ref={(line) => { if (line) lines.current.set(edge.id, line); else lines.current.delete(edge.id); }} points={getSystemDesignConnectionPoints(getNodePortPosition(from, edge.sourcePort), getNodePortPosition(to, edge.targetPort), routing)} tension={routing === "curved" ? 0.45 : 0} stroke={colors[annotation.severity ?? "info"]} strokeWidth={8} opacity={0.45} lineCap="round" strokeScaleEnabled={false} listening={false} />;
    })}
    {visualization.nodes.map((annotation, index) => {
      const node = nodes.get(annotation.nodeId);
      if (!node) return null;
      const color = colors[annotation.severity ?? "info"];
      return <Group key={node.id} ref={(group) => { if (group) groups.current.set(node.id, group); else groups.current.delete(node.id); }} x={node.x} y={node.y} listening={false}>
        <Rect name="analysis-ring" x={-5} y={-5} width={node.width + 10} height={node.height + 10} cornerRadius={14} stroke={color} strokeWidth={annotation.severity === "critical" ? 3 : 2} strokeScaleEnabled={false} dash={annotation.severity === "info" ? [5, 4] : undefined} opacity={0.9} />
        <Rect x={2} y={-26} width={30} height={20} cornerRadius={6} fill={theme.background} stroke={color} strokeWidth={1} />
        <Text x={2} y={-22} width={30} align="center" text={String(index + 1)} fill={color} fontSize={12} />
      </Group>;
    })}
  </Group>;
}
