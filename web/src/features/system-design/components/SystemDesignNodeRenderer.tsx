"use client";

import { memo, useState } from "react";
import type Konva from "konva";
import { Circle, Group, Line, Rect, Text } from "react-konva";
import type {
  SystemDesignNode,
  SystemDesignPort,
} from "../types/system-design.types";
import {
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
} from "../utils/system-design-defaults";

export interface SystemDesignCanvasTheme {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  foreground: string;
  muted: string;
  accent: string;
  accentForeground: string;
  success: string;
  warning: string;
  danger: string;
}

interface SystemDesignNodeRendererProps {
  node: SystemDesignNode;
  selected: boolean;
  connecting: boolean;
  preview: boolean;
  theme: SystemDesignCanvasTheme;
  registerRef: (nodeId: string, group: Konva.Group | null) => void;
  onSelect: (
    nodeId: string,
    additive: boolean,
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void;
  onDragStart: (nodeId: string, group: Konva.Group) => void;
  onDragMove: (nodeId: string, group: Konva.Group) => void;
  onDragEnd: (nodeId: string, group: Konva.Group) => void;
  onResizeEnd: (
    nodeId: string,
    frame: { x: number; y: number; width: number; height: number },
  ) => void;
  onPortStart: (
    nodeId: string,
    port: SystemDesignPort,
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void;
  onPortEnd: (
    nodeId: string,
    port: SystemDesignPort,
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void;
}

const iconLabels: Record<SystemDesignNode["type"], string> = {
  user: "U",
  web_app: "WEB",
  mobile_app: "APP",
  admin_portal: "ADM",
  dns: "DNS",
  cdn: "CDN",
  load_balancer: "LB",
  api_gateway: "API",
  service: "SVC",
  microservice: "MIC",
  monolith: "MON",
  worker: "WRK",
  serverless_function: "FN",
  sql_database: "SQL",
  nosql_database: "NoSQL",
  cache: "C",
  search_engine: "SRCH",
  object_storage: "OBJ",
  data_warehouse: "DWH",
  message_queue: "Q",
  event_stream: "EVT",
  pubsub: "P/S",
  third_party_api: "3P",
  payment_provider: "$",
  notification_provider: "MSG",
};

function categoryColor(
  type: SystemDesignNode["type"],
  theme: SystemDesignCanvasTheme,
): string {
  if (
    ["user", "web_app", "mobile_app", "admin_portal"].includes(type)
  ) {
    return theme.accent;
  }
  if (["dns", "cdn", "load_balancer", "api_gateway"].includes(type)) {
    return "#38bdf8";
  }
  if (
    [
      "sql_database",
      "nosql_database",
      "cache",
      "search_engine",
      "object_storage",
      "data_warehouse",
    ].includes(type)
  ) {
    return theme.success;
  }
  if (["message_queue", "event_stream", "pubsub"].includes(type)) {
    return theme.warning;
  }
  if (
    ["third_party_api", "payment_provider", "notification_provider"].includes(
      type,
    )
  ) {
    return "#f472b6";
  }
  return "#818cf8";
}

function portPoint(
  node: SystemDesignNode,
  port: SystemDesignPort,
): { x: number; y: number } {
  switch (port) {
    case "top":
      return { x: node.width / 2, y: 0 };
    case "right":
      return { x: node.width, y: node.height / 2 };
    case "bottom":
      return { x: node.width / 2, y: node.height };
    case "left":
      return { x: 0, y: node.height / 2 };
  }
}

function SystemDesignNodeRendererComponent({
  node,
  selected,
  connecting,
  preview,
  theme,
  registerRef,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onResizeEnd,
  onPortStart,
  onPortEnd,
}: SystemDesignNodeRendererProps) {
  const [hovered, setHovered] = useState(false);
  const accent = categoryColor(node.type, theme);
  const ports: SystemDesignPort[] = ["top", "right", "bottom", "left"];

  return (
    <Group
      id={`system-design-node-${node.id}`}
      name="system-design-node"
      ref={(group) => registerRef(node.id, group)}
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      draggable={!preview && !node.locked && !connecting}
      onClick={(event) =>
        !preview &&
        onSelect(
          node.id,
          event.evt.shiftKey,
          event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
        )
      }
      onTap={(event) =>
        !preview &&
        onSelect(
          node.id,
          false,
          event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
        )
      }
      onMouseEnter={(event) => {
        setHovered(true);
        event.target.getStage()?.container().style.setProperty(
          "cursor",
          node.locked || preview ? "default" : "move",
        );
      }}
      onMouseLeave={(event) => {
        setHovered(false);
        event.target.getStage()?.container().style.setProperty(
          "cursor",
          "default",
        );
      }}
      onDragStart={(event) => onDragStart(node.id, event.target as Konva.Group)}
      onDragMove={(event) => onDragMove(node.id, event.target as Konva.Group)}
      onDragEnd={(event) => onDragEnd(node.id, event.target as Konva.Group)}
      onTransformEnd={(event) => {
        const group = event.target as Konva.Group;
        const width = Math.max(MIN_NODE_WIDTH, node.width * group.scaleX());
        const height = Math.max(
          MIN_NODE_HEIGHT,
          node.height * group.scaleY(),
        );
        group.scaleX(1);
        group.scaleY(1);
        onResizeEnd(node.id, {
          x: group.x(),
          y: group.y(),
          width,
          height,
        });
      }}
    >
      <Rect
        width={node.width}
        height={node.height}
        cornerRadius={10}
        fill={hovered ? theme.surfaceElevated : theme.surface}
        stroke={selected ? theme.accent : theme.border}
        strokeWidth={selected ? 2 : 1}
        shadowColor="#000000"
        shadowBlur={selected ? 16 : 8}
        shadowOpacity={selected ? 0.36 : 0.2}
        shadowOffsetY={4}
      />
      <Line
        points={[5, 12, 5, node.height - 12]}
        stroke={accent}
        strokeWidth={4}
        lineCap="round"
      />
      <Circle
        x={27}
        y={node.height / 2}
        radius={16}
        fill={`${accent}24`}
        stroke={accent}
        strokeWidth={1}
      />
      <Text
        x={11}
        y={node.height / 2 - 5}
        width={32}
        align="center"
        text={iconLabels[node.type]}
        fill={accent}
        fontFamily="Arial"
        fontSize={iconLabels[node.type].length > 3 ? 7 : 9}
        fontStyle="bold"
        listening={false}
      />
      <Text
        x={50}
        y={node.height > 76 ? 18 : 14}
        width={Math.max(50, node.width - 62)}
        text={node.label}
        fill={theme.foreground}
        fontFamily="Arial"
        fontSize={14}
        fontStyle="bold"
        ellipsis
        wrap="none"
        listening={false}
      />
      {node.technology && (
        <Text
          x={50}
          y={node.subtitle ? 36 : node.height > 76 ? 42 : 36}
          width={Math.max(50, node.width - 62)}
          text={node.technology}
          fill={theme.muted}
          fontFamily="Arial"
          fontSize={11}
          ellipsis
          wrap="none"
          listening={false}
        />
      )}
      {node.subtitle && (
        <Text
          x={50}
          y={node.technology ? 52 : node.height > 76 ? 42 : 36}
          width={Math.max(50, node.width - 62)}
          text={node.subtitle}
          fill={theme.muted}
          fontFamily="Arial"
          fontSize={node.technology ? 9 : 11}
          ellipsis
          wrap="none"
          listening={false}
        />
      )}
      {node.locked && !preview && (
        <Text
          x={node.width - 22}
          y={7}
          width={14}
          text="L"
          fill={theme.warning}
          fontFamily="Arial"
          fontSize={9}
          fontStyle="bold"
          align="center"
          listening={false}
        />
      )}
      {!preview &&
        ports.map((port) => {
          const point = portPoint(node, port);
          return (
            <Circle
              key={port}
              name={`system-design-port-${port}`}
              x={point.x}
              y={point.y}
              radius={selected || hovered ? 6 : 4}
              fill={theme.background}
              stroke={selected || hovered ? theme.accent : theme.muted}
              strokeWidth={2}
              hitStrokeWidth={12}
              onMouseDown={(event) => {
                event.cancelBubble = true;
                onPortStart(
                  node.id,
                  port,
                  event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
                );
              }}
              onTouchStart={(event) => {
                event.cancelBubble = true;
                onPortStart(
                  node.id,
                  port,
                  event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
                );
              }}
              onMouseUp={(event) => {
                event.cancelBubble = true;
                onPortEnd(
                  node.id,
                  port,
                  event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
                );
              }}
              onTouchEnd={(event) => {
                event.cancelBubble = true;
                onPortEnd(
                  node.id,
                  port,
                  event as Konva.KonvaEventObject<MouseEvent | TouchEvent>,
                );
              }}
              onMouseEnter={(event) =>
                event.target
                  .getStage()
                  ?.container()
                  .style.setProperty("cursor", "crosshair")
              }
              onMouseLeave={(event) =>
                event.target
                  .getStage()
                  ?.container()
                  .style.setProperty("cursor", "default")
              }
            />
          );
        })}
    </Group>
  );
}

export const SystemDesignNodeRenderer = memo(
  SystemDesignNodeRendererComponent,
);
