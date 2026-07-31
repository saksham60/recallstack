"use client";

import {
  Circle,
  Ellipse,
  Group,
  Line,
  Rect,
  Text,
} from "react-konva";
import type { SystemDesignNodeType } from "../types/system-design.types";

interface SystemDesignSemanticGlyphProps {
  type: SystemDesignNodeType;
  x?: number;
  y?: number;
  size?: number;
  color: string;
}

export function SystemDesignSemanticGlyph({
  type,
  x = 0,
  y = 0,
  size = 32,
  color,
}: SystemDesignSemanticGlyphProps) {
  const scale = size / 32;
  const stroke = {
    stroke: color,
    strokeWidth: 1.8,
    lineCap: "round" as const,
    lineJoin: "round" as const,
    perfectDrawEnabled: false,
  };

  const glyph = (() => {
    switch (type as string) {
      case "user":
        return (
          <>
            <Circle x={16} y={9} radius={5} {...stroke} />
            <Line points={[5, 27, 7, 21, 11, 18, 21, 18, 25, 21, 27, 27]} {...stroke} />
          </>
        );
      case "web_app":
        return (
          <>
            <Rect x={3} y={5} width={26} height={21} cornerRadius={3} {...stroke} />
            <Line points={[3, 11, 29, 11]} {...stroke} />
            <Circle x={7} y={8} radius={1} fill={color} />
            <Circle x={11} y={8} radius={1} fill={color} />
          </>
        );
      case "mobile_app":
        return (
          <>
            <Rect x={8} y={2} width={16} height={28} cornerRadius={4} {...stroke} />
            <Line points={[13, 6, 19, 6]} {...stroke} />
            <Circle x={16} y={26} radius={1.2} fill={color} />
          </>
        );
      case "admin_portal":
        return (
          <>
            <Line points={[16, 2, 27, 7, 25, 20, 16, 29, 7, 20, 5, 7, 16, 2]} closed {...stroke} />
            <Line points={[10, 16, 14, 20, 22, 11]} {...stroke} />
          </>
        );
      case "dns":
        return (
          <>
            <Circle x={16} y={16} radius={13} {...stroke} />
            <Ellipse x={16} y={16} radiusX={6} radiusY={13} {...stroke} />
            <Line points={[3, 16, 29, 16]} {...stroke} />
            <Line points={[6, 9, 26, 9]} {...stroke} />
            <Line points={[6, 23, 26, 23]} {...stroke} />
          </>
        );
      case "cdn":
        return (
          <>
            <Circle x={16} y={16} radius={4} {...stroke} />
            <Circle x={5} y={7} radius={3} {...stroke} />
            <Circle x={27} y={7} radius={3} {...stroke} />
            <Circle x={5} y={25} radius={3} {...stroke} />
            <Circle x={27} y={25} radius={3} {...stroke} />
            <Line points={[8, 9, 13, 13, 8, 23]} {...stroke} />
            <Line points={[24, 9, 19, 13, 24, 23]} {...stroke} />
          </>
        );
      case "load_balancer":
        return (
          <>
            <Line points={[3, 16, 11, 16, 16, 7, 23, 7]} {...stroke} />
            <Line points={[11, 16, 16, 25, 23, 25]} {...stroke} />
            <Line points={[21, 4, 27, 7, 21, 10]} {...stroke} />
            <Line points={[21, 22, 27, 25, 21, 28]} {...stroke} />
          </>
        );
      case "api_gateway":
        return (
          <>
            <Line points={[10, 4, 4, 4, 4, 28, 10, 28]} {...stroke} />
            <Line points={[22, 4, 28, 4, 28, 28, 22, 28]} {...stroke} />
            <Circle x={11} y={16} radius={3} {...stroke} />
            <Circle x={21} y={10} radius={2.5} {...stroke} />
            <Circle x={21} y={22} radius={2.5} {...stroke} />
            <Line points={[14, 15, 18.5, 11.5, 14, 17, 18.5, 20.5]} {...stroke} />
          </>
        );
      case "microservice":
        return (
          <>
            <Rect x={3} y={4} width={11} height={10} cornerRadius={2} {...stroke} />
            <Rect x={18} y={4} width={11} height={10} cornerRadius={2} {...stroke} />
            <Rect x={10.5} y={19} width={11} height={10} cornerRadius={2} {...stroke} />
            <Line points={[9, 14, 13, 19, 23, 14, 19, 19]} {...stroke} />
          </>
        );
      case "monolith":
        return (
          <>
            <Rect x={5} y={3} width={22} height={26} cornerRadius={2} {...stroke} />
            <Line points={[5, 11, 27, 11]} {...stroke} />
            <Line points={[5, 20, 27, 20]} {...stroke} />
            <Circle x={10} y={7} radius={1.3} fill={color} />
          </>
        );
      case "worker":
        return (
          <>
            <Circle x={16} y={16} radius={7} {...stroke} />
            <Circle x={16} y={16} radius={2.5} {...stroke} />
            {[0, 45, 90, 135].map((angle) => {
              const radians = (angle * Math.PI) / 180;
              const dx = Math.cos(radians) * 12;
              const dy = Math.sin(radians) * 12;
              return (
                <Line
                  key={angle}
                  points={[16 - dx, 16 - dy, 16 + dx, 16 + dy]}
                  {...stroke}
                />
              );
            })}
          </>
        );
      case "serverless_function":
        return (
          <>
            <Line points={[7, 27, 13, 4, 18, 4]} {...stroke} />
            <Line points={[9, 14, 18, 14]} {...stroke} />
            <Text x={16} y={13} width={14} text="ƒ" fill={color} fontSize={15} fontStyle="bold" />
          </>
        );
      case "sql_database":
        return (
          <>
            <Ellipse x={16} y={7} radiusX={11} radiusY={4} {...stroke} />
            <Line points={[5, 7, 5, 24]} {...stroke} />
            <Line points={[27, 7, 27, 24]} {...stroke} />
            <Line points={[5, 15, 7, 18, 16, 20, 25, 18, 27, 15]} {...stroke} />
            <Line points={[5, 23, 7, 26, 16, 28, 25, 26, 27, 23]} {...stroke} />
          </>
        );
      case "nosql_database":
        return (
          <>
            <Rect x={4} y={5} width={18} height={20} cornerRadius={2} {...stroke} />
            <Rect x={10} y={8} width={18} height={20} cornerRadius={2} {...stroke} />
            <Line points={[14, 14, 24, 14]} {...stroke} />
            <Line points={[14, 19, 24, 19]} {...stroke} />
          </>
        );
      case "cache":
        return (
          <>
            <Rect x={6} y={6} width={20} height={20} cornerRadius={4} {...stroke} />
            {[9, 14, 19, 24].map((position) => (
              <Line key={`v-${position}`} points={[position, 3, position, 6, position, 29, position, 26]} {...stroke} />
            ))}
            {[9, 14, 19, 24].map((position) => (
              <Line key={`h-${position}`} points={[3, position, 6, position, 29, position, 26, position]} {...stroke} />
            ))}
            <Line points={[11, 12, 21, 12, 11, 17, 21, 17, 11, 22, 21, 22]} {...stroke} />
          </>
        );
      case "search_engine":
        return (
          <>
            <Circle x={13} y={13} radius={9} {...stroke} />
            <Line points={[20, 20, 29, 29]} {...stroke} />
            <Line points={[9, 9, 17, 9, 9, 13, 16, 13]} {...stroke} />
          </>
        );
      case "object_storage":
        return (
          <>
            <Line points={[5, 7, 27, 7, 24, 28, 8, 28, 5, 7]} closed {...stroke} />
            <Ellipse x={16} y={7} radiusX={11} radiusY={4} {...stroke} />
            <Line points={[8, 17, 24, 17]} {...stroke} />
          </>
        );
      case "data_warehouse":
        return (
          <>
            <Line points={[4, 11, 16, 3, 28, 11]} closed {...stroke} />
            <Line points={[6, 11, 6, 28, 26, 28, 26, 11]} {...stroke} />
            <Line points={[11, 13, 11, 25, 16, 25, 16, 13, 21, 13, 21, 25]} {...stroke} />
          </>
        );
      case "message_queue":
        return (
          <>
            <Rect x={3} y={5} width={26} height={22} cornerRadius={11} {...stroke} />
            <Circle x={9} y={16} radius={2.5} fill={color} />
            <Circle x={16} y={16} radius={2.5} fill={color} />
            <Circle x={23} y={16} radius={2.5} fill={color} />
          </>
        );
      case "event_stream":
        return (
          <>
            <Line points={[2, 8, 8, 8, 12, 16, 16, 16, 20, 24, 30, 24]} {...stroke} />
            <Line points={[2, 24, 8, 24, 12, 16, 16, 16, 20, 8, 30, 8]} {...stroke} />
            <Circle x={16} y={16} radius={2.5} fill={color} />
          </>
        );
      case "pubsub":
        return (
          <>
            <Circle x={16} y={16} radius={4} {...stroke} />
            <Circle x={16} y={16} radius={9} {...stroke} dash={[2, 3]} />
            <Circle x={16} y={16} radius={14} {...stroke} dash={[3, 4]} />
          </>
        );
      case "third_party_api":
        return (
          <>
            <Rect x={4} y={8} width={19} height={20} cornerRadius={3} {...stroke} />
            <Line points={[15, 17, 28, 4, 28, 12, 28, 4, 20, 4]} {...stroke} />
          </>
        );
      case "payment_provider":
        return (
          <>
            <Rect x={3} y={6} width={26} height={20} cornerRadius={3} {...stroke} />
            <Line points={[3, 12, 29, 12]} {...stroke} />
            <Line points={[8, 20, 14, 20]} {...stroke} />
          </>
        );
      case "notification_provider":
        return (
          <>
            <Rect x={3} y={7} width={26} height={19} cornerRadius={3} {...stroke} />
            <Line points={[4, 9, 16, 18, 28, 9]} {...stroke} />
            <Line points={[4, 24, 12, 16]} {...stroke} />
            <Line points={[28, 24, 20, 16]} {...stroke} />
          </>
        );
      case "module":
        return (
          <>
            <Rect x={3} y={8} width={22} height={20} cornerRadius={3} {...stroke} />
            <Rect x={8} y={3} width={21} height={20} cornerRadius={3} {...stroke} />
            <Line points={[13, 10, 24, 10, 24, 17, 13, 17, 13, 10]} {...stroke} />
          </>
        );
      case "system_boundary":
        return (
          <>
            <Rect x={3} y={3} width={26} height={26} cornerRadius={3} dash={[4, 3]} {...stroke} />
            <Rect x={7} y={7} width={18} height={18} cornerRadius={2} {...stroke} />
          </>
        );
      case "container":
        return (
          <>
            <Line points={[16, 3, 28, 9, 16, 15, 4, 9, 16, 3]} closed {...stroke} />
            <Line points={[4, 9, 4, 23, 16, 29, 28, 23, 28, 9]} {...stroke} />
            <Line points={[16, 15, 16, 29]} {...stroke} />
          </>
        );
      case "text":
        return (
          <>
            <Line points={[5, 6, 27, 6]} {...stroke} />
            <Line points={[16, 6, 16, 27]} {...stroke} />
            <Line points={[11, 27, 21, 27]} {...stroke} />
          </>
        );
      case "note":
        return (
          <>
            <Line points={[5, 3, 22, 3, 28, 9, 28, 29, 5, 29, 5, 3]} closed {...stroke} />
            <Line points={[22, 3, 22, 9, 28, 9]} {...stroke} />
            <Line points={[10, 15, 23, 15, 10, 20, 20, 20]} {...stroke} />
          </>
        );
      case "service":
      default:
        return (
          <>
            <Rect x={4} y={4} width={24} height={24} cornerRadius={3} {...stroke} />
            <Line points={[4, 12, 28, 12]} {...stroke} />
            <Line points={[4, 20, 28, 20]} {...stroke} />
            <Circle x={9} y={8} radius={1.3} fill={color} />
            <Circle x={9} y={16} radius={1.3} fill={color} />
            <Circle x={9} y={24} radius={1.3} fill={color} />
          </>
        );
    }
  })();

  return (
    <Group x={x} y={y} scaleX={scale} scaleY={scale} listening={false}>
      {glyph}
    </Group>
  );
}
