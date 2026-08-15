import type { DiagramInspectorFieldDefinition } from "../types";

export const COMMON_DIAGRAM_INSPECTOR_FIELDS = [
  { id: "label", label: "Label", section: "content", control: "text", path: "label" },
  { id: "fill", label: "Fill", section: "style", control: "color", path: "style.fill" },
  { id: "stroke", label: "Stroke", section: "style", control: "color", path: "style.stroke" },
  {
    id: "strokeWidth",
    label: "Stroke width",
    section: "style",
    control: "stroke-width",
    path: "style.strokeWidth",
    min: 0,
    max: 12,
    step: 1,
  },
  {
    id: "opacity",
    label: "Opacity",
    section: "style",
    control: "opacity",
    path: "style.opacity",
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  {
    id: "fontSize",
    label: "Font size",
    section: "text",
    control: "font-size",
    path: "textStyle.fontSize",
    min: 8,
    max: 72,
    step: 1,
  },
  {
    id: "fontWeight",
    label: "Weight",
    section: "text",
    control: "font-weight",
    path: "textStyle.fontWeight",
    options: [
      { value: "normal", label: "Normal" },
      { value: "medium", label: "Medium" },
      { value: "semibold", label: "Semibold" },
      { value: "bold", label: "Bold" },
    ],
  },
  {
    id: "align",
    label: "Alignment",
    section: "text",
    control: "alignment",
    path: "textStyle.align",
    options: [
      { value: "left", label: "Left" },
      { value: "center", label: "Center" },
      { value: "right", label: "Right" },
    ],
  },
  { id: "textColor", label: "Text color", section: "text", control: "color", path: "textStyle.color" },
  { id: "x", label: "X", section: "geometry", control: "number", path: "x", step: 1 },
  { id: "y", label: "Y", section: "geometry", control: "number", path: "y", step: 1 },
  { id: "width", label: "Width", section: "geometry", control: "number", path: "width", min: 16, step: 1 },
  { id: "height", label: "Height", section: "geometry", control: "number", path: "height", min: 16, step: 1 },
  { id: "rotation", label: "Rotation", section: "geometry", control: "number", path: "rotation", min: -360, max: 360, step: 1 },
  { id: "locked", label: "Locked", section: "behavior", control: "toggle", path: "locked" },
  { id: "visible", label: "Visible", section: "behavior", control: "toggle", path: "visible" },
] as const satisfies readonly DiagramInspectorFieldDefinition[];

export const DEFAULT_DIAGRAM_PORTS = [
  { id: "top", side: "top", offset: 0.5 },
  { id: "right", side: "right", offset: 0.5 },
  { id: "bottom", side: "bottom", offset: 0.5 },
  { id: "left", side: "left", offset: 0.5 },
] as const;

export const GENERIC_CONNECTOR_INSPECTOR_FIELDS = [
  { id: "connectorLabel", label: "Label", section: "content", control: "text", path: "connectorLabel" },
  { id: "routing", label: "Routing", section: "geometry", control: "select", path: "routing", options: [{ value: "straight", label: "Straight" }, { value: "curved", label: "Curved" }, { value: "orthogonal", label: "Orthogonal" }] },
  { id: "stroke", label: "Stroke", section: "style", control: "color", path: "style.stroke" },
  { id: "strokeWidth", label: "Stroke width", section: "style", control: "stroke-width", path: "style.strokeWidth", min: 1, max: 12, step: 1 },
  { id: "strokeStyle", label: "Line style", section: "style", control: "stroke-style", path: "style.strokeStyle", options: [{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }] },
  { id: "startArrowhead", label: "Start arrow", section: "style", control: "select", path: "style.startArrowhead", options: [{ value: "none", label: "None" }, { value: "standard", label: "Standard" }, { value: "open", label: "Open" }, { value: "diamond", label: "Diamond" }, { value: "circle", label: "Circle" }] },
  { id: "endArrowhead", label: "End arrow", section: "style", control: "select", path: "style.endArrowhead", options: [{ value: "none", label: "None" }, { value: "standard", label: "Standard" }, { value: "open", label: "Open" }, { value: "diamond", label: "Diamond" }, { value: "circle", label: "Circle" }] },
  { id: "locked", label: "Locked", section: "behavior", control: "toggle", path: "locked" },
  { id: "visible", label: "Visible", section: "behavior", control: "toggle", path: "visible" },
] as const satisfies readonly DiagramInspectorFieldDefinition[];
