"use client";

import { Fragment } from "react";
import { Line, Rect, Text } from "react-konva";
import type { DiagramShapeRendererProps } from "../../core/types";
import { parseErdFields } from "./ErdFieldsField";

export function ErdEntityRenderer({ element, definition }: DiagramShapeRendererProps) {
  const fields = parseErdFields(element.data?.fields);
  const style = { ...definition.defaultStyle, ...element.style };
  const headerHeight = 34;
  const rowHeight = 24;
  return <>
    <Rect width={element.width} height={element.height} fill={style.fill ?? "#18181b"} stroke={style.stroke ?? "#38bdf8"} strokeWidth={style.strokeWidth ?? 1.5} cornerRadius={style.cornerRadius ?? 8} />
    <Rect width={element.width} height={headerHeight} fill="#0c4a6e" cornerRadius={[8, 8, 0, 0]} />
    <Text x={10} y={9} width={element.width - 20} text={element.label} fill="#f8fafc" fontFamily="Inter" fontSize={14} fontStyle="bold" />
    <Line points={[0, headerHeight, element.width, headerHeight]} stroke={style.stroke ?? "#38bdf8"} strokeWidth={1} />
    {fields.slice(0, Math.max(0, Math.floor((element.height - headerHeight) / rowHeight))).map((field, index) => <Fragment key={`${field.name}-${index}`}>
      <Text x={8} y={headerHeight + index * rowHeight + 6} width={26} text={field.key} fill={field.key === "PK" ? "#fbbf24" : field.key === "FK" ? "#c084fc" : "#71717a"} fontFamily="monospace" fontSize={10} fontStyle="bold" />
      <Text x={36} y={headerHeight + index * rowHeight + 5} width={Math.max(40, element.width - 118)} text={field.name} fill="#e4e4e7" fontFamily="Inter" fontSize={11} />
      <Text x={element.width - 80} y={headerHeight + index * rowHeight + 5} width={70} text={field.dataType} align="right" fill="#94a3b8" fontFamily="monospace" fontSize={9} />
      {index < fields.length - 1 ? <Line points={[8, headerHeight + (index + 1) * rowHeight, element.width - 8, headerHeight + (index + 1) * rowHeight]} stroke="#27272a" strokeWidth={1} /> : null}
    </Fragment>)}
  </>;
}
