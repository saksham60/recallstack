"use client";

import { Circle, Ellipse, Line, Path, Rect } from "react-konva";
import type { DiagramShapeRendererProps } from "../../core/types";

function dashFor(style: DiagramShapeRendererProps["element"]["style"]): number[] | undefined {
  if (style?.strokeStyle === "dashed") return [8, 5];
  if (style?.strokeStyle === "dotted") return [2, 4];
  return undefined;
}

export function GenericShapeRenderer({
  element,
  definition,
  color,
}: DiagramShapeRendererProps) {
  const { width, height } = element;
  const style = element.style ?? definition.defaultStyle;
  const fill = style.fill ?? "#18181b";
  const stroke = style.stroke ?? color;
  const strokeWidth = style.strokeWidth ?? 1.5;
  const opacity = style.opacity ?? 1;
  const common = {
    fill,
    stroke,
    strokeWidth,
    opacity,
    dash: dashFor(style),
    perfectDrawEnabled: false,
    listening: false,
  };

  switch (definition.rendererId) {
    case "generic.rounded-rectangle":
      return <Rect width={width} height={height} cornerRadius={style.cornerRadius ?? 12} {...common} />;
    case "generic.circle":
      return <Circle x={width / 2} y={height / 2} radius={Math.min(width, height) / 2} {...common} />;
    case "generic.ellipse":
      return <Ellipse x={width / 2} y={height / 2} radiusX={width / 2} radiusY={height / 2} {...common} />;
    case "generic.diamond":
      return <Line points={[width / 2, 0, width, height / 2, width / 2, height, 0, height / 2]} closed {...common} />;
    case "generic.triangle":
      return <Line points={[width / 2, 0, width, height, 0, height]} closed {...common} />;
    case "generic.hexagon":
      return <Line points={[width * .22, 0, width * .78, 0, width, height / 2, width * .78, height, width * .22, height, 0, height / 2]} closed {...common} />;
    case "generic.parallelogram":
      return <Line points={[width * .16, 0, width, 0, width * .84, height, 0, height]} closed {...common} />;
    case "generic.trapezoid":
      return <Line points={[0, 0, width, height * .16, width * .86, height, width * .14, height]} closed {...common} />;
    case "generic.cylinder":
      return (
        <>
          <Rect x={0} y={height * .12} width={width} height={height * .76} fill={fill} opacity={opacity} listening={false} />
          <Ellipse x={width / 2} y={height * .12} radiusX={width / 2} radiusY={height * .12} {...common} />
          <Ellipse x={width / 2} y={height * .88} radiusX={width / 2} radiusY={height * .12} {...common} />
          <Line points={[0, height * .12, 0, height * .88]} stroke={stroke} strokeWidth={strokeWidth} dash={dashFor(style)} listening={false} />
          <Line points={[width, height * .12, width, height * .88]} stroke={stroke} strokeWidth={strokeWidth} dash={dashFor(style)} listening={false} />
        </>
      );
    case "generic.document":
      return (
        <Line
          points={[0, 0, width, 0, width, height * .82, width * .75, height, width * .5, height * .82, width * .25, height, 0, height * .82]}
          closed
          tension={0.22}
          {...common}
        />
      );
    case "generic.cloud": {
      const scaleX = width / 100;
      const scaleY = height / 60;
      return (
        <Path
          data="M25 52C12 52 5 44 5 34C5 24 13 16 24 16C29 7 38 3 48 5C57 6 64 12 68 20C82 18 94 27 95 39C96 47 88 54 79 54H25Z"
          scaleX={scaleX}
          scaleY={scaleY}
          {...common}
        />
      );
    }
    case "generic.person":
      return (
        <>
          <Circle x={width / 2} y={height * .23} radius={Math.min(width, height) * .15} {...common} />
          <Line
            points={[width * .16, height * .9, width * .2, height * .64, width * .36, height * .49, width * .64, height * .49, width * .8, height * .64, width * .84, height * .9]}
            closed
            {...common}
          />
        </>
      );
    case "generic.note":
      return (
        <>
          <Line points={[0, 0, width - 18, 0, width, 18, width, height, 0, height]} closed {...common} />
          <Line points={[width - 18, 0, width - 18, 18, width, 18]} stroke={stroke} strokeWidth={strokeWidth} listening={false} />
        </>
      );
    case "generic.frame":
      return <Rect width={width} height={height} cornerRadius={style.cornerRadius ?? 12} {...common} fillEnabled={Boolean(style.fill)} dash={dashFor(style) ?? [8, 5]} />;
    case "generic.text":
      return <Rect width={width} height={height} fill="transparent" strokeEnabled={false} listening={false} />;
    default:
      return <Rect width={width} height={height} cornerRadius={style.cornerRadius ?? 0} {...common} />;
  }
}
