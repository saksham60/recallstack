import type { ComponentType } from "react";
import type {
  DiagramElementStyle,
  DiagramJsonValue,
  DiagramPortSide,
  DiagramShapeElement,
  DiagramSize,
  DiagramTextStyle,
} from "./diagram.types";

export type DiagramInspectorControl =
  | "text"
  | "textarea"
  | "number"
  | "slider"
  | "toggle"
  | "select"
  | "color"
  | "icon"
  | "stroke-width"
  | "stroke-style"
  | "font-size"
  | "font-weight"
  | "alignment"
  | "opacity";

export interface DiagramInspectorOption {
  value: string;
  label: string;
}

export interface DiagramInspectorFieldDefinition {
  id: string;
  label: string;
  section: "content" | "style" | "text" | "geometry" | "behavior" | string;
  control: DiagramInspectorControl;
  path: string;
  options?: readonly DiagramInspectorOption[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface DiagramPortDefinition {
  id: string;
  side: DiagramPortSide;
  offset?: number;
  accepts?: readonly string[];
}

export interface DiagramResizeCapabilities {
  horizontal: boolean;
  vertical: boolean;
  preserveAspectRatio?: boolean;
}

export interface DiagramShapeRendererProps {
  element: DiagramShapeElement;
  definition: DiagramShapeDefinition;
  selected: boolean;
  color: string;
}

export type DiagramShapeRenderer = ComponentType<DiagramShapeRendererProps>;

export interface DiagramShapeDefinition {
  id: string;
  packId: string;
  label: string;
  category: string;
  keywords: readonly string[];
  icon: string;
  rendererId: string;
  defaultSize: DiagramSize;
  minimumSize: DiagramSize;
  resize: DiagramResizeCapabilities;
  rotatable: boolean;
  ports: readonly DiagramPortDefinition[];
  defaultStyle: DiagramElementStyle;
  defaultTextStyle?: DiagramTextStyle;
  inspector: readonly DiagramInspectorFieldDefinition[];
  isFrame?: boolean;
  data?: Record<string, DiagramJsonValue>;
  validate?: (element: DiagramShapeElement) => readonly string[];
}

export interface DiagramPackCategory {
  id: string;
  label: string;
  order: number;
}

export interface DiagramPack {
  id: string;
  label: string;
  description: string;
  icon: string;
  categories: readonly DiagramPackCategory[];
  shapes: readonly DiagramShapeDefinition[];
  renderers?: Readonly<Record<string, DiagramShapeRenderer>>;
}
