// Tool definitions and annotation factories. All geometry is in VIEW POINTS
// (scale-independent); the UI multiplies by the render scale for display and
// the exporter reads them back at scale 1.

import type {
  Annotation,
  Rgb,
  StandardFontKey,
  TextAlign,
  TextAnnot,
  ShapeAnnot,
  LineAnnot,
  InkAnnot,
  MarkupAnnot,
  WhiteoutAnnot,
  ImageAnnot,
  LinkAnnot,
  Rect,
} from "../core/types";

export type ToolId =
  | "select"
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "ink"
  | "highlight"
  | "underline"
  | "strike"
  | "whiteout"
  | "image"
  | "signature"
  | "link";

/** Tools created by dragging a rectangle. */
export const RECT_TOOLS: ReadonlyArray<ToolId> = [
  "rect",
  "ellipse",
  "highlight",
  "underline",
  "strike",
  "whiteout",
  "link",
];

/** Tools placed by a single click (ghost-follows-cursor). Strokes stay drag. */
export const PLACEMENT_TOOLS: ReadonlyArray<ToolId> = [
  "text",
  "rect",
  "ellipse",
  "highlight",
  "underline",
  "strike",
  "whiteout",
  "link",
  "image",
  "signature",
];

/** Default footprint (view points) of a placement tool, before resizing. */
export function defaultBoxSize(tool: ToolId, s: Style): { w: number; h: number } {
  switch (tool) {
    case "text":
      return { w: 220, h: Math.round(s.fontSize * 1.6) };
    case "ellipse":
      return { w: 130, h: 96 };
    case "highlight":
      return { w: 190, h: 20 };
    case "underline":
    case "strike":
      return { w: 170, h: 16 };
    case "whiteout":
      return { w: 150, h: 30 };
    case "link":
      return { w: 160, h: 28 };
    default:
      return { w: 150, h: 96 };
  }
}

export type Style = {
  color: Rgb; // text + line + shape stroke
  fill: Rgb | null;
  strokeWidth: number;
  opacity: number;
  fontFamily: StandardFontKey;
  fontSize: number;
  align: TextAlign;
  highlightColor: Rgb;
};

export const DEFAULT_STYLE: Style = {
  color: { r: 0.05, g: 0.05, b: 0.05 },
  fill: null,
  strokeWidth: 2,
  opacity: 1,
  fontFamily: "Helvetica",
  fontSize: 14,
  align: "left",
  highlightColor: { r: 1, g: 0.9, b: 0.2 },
};

export function uid(): string {
  return crypto.randomUUID();
}

export function createTextAnnotation(page: number, x: number, y: number, s: Style): TextAnnot {
  return {
    id: uid(),
    type: "text",
    page,
    x,
    y,
    w: 220,
    h: s.fontSize * 1.6,
    rotation: 0,
    text: "Texte",
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    color: s.color,
    align: s.align,
  };
}

export function createRectTool(tool: ToolId, page: number, r: Rect, s: Style): Annotation {
  switch (tool) {
    case "rect":
    case "ellipse":
      return {
        id: uid(),
        type: tool,
        page,
        ...r,
        rotation: 0,
        stroke: s.color,
        strokeWidth: s.strokeWidth,
        fill: s.fill,
        opacity: s.opacity,
      } satisfies ShapeAnnot;
    case "highlight":
      return {
        id: uid(),
        type: "highlight",
        page,
        ...r,
        color: s.highlightColor,
      } satisfies MarkupAnnot;
    case "underline":
    case "strike":
      return {
        id: uid(),
        type: tool,
        page,
        ...r,
        color: s.color,
      } satisfies MarkupAnnot;
    case "whiteout":
      return {
        id: uid(),
        type: "whiteout",
        page,
        ...r,
      } satisfies WhiteoutAnnot;
    case "link":
      return {
        id: uid(),
        type: "link",
        page,
        ...r,
        target: { kind: "url", value: "https://" },
      } satisfies LinkAnnot;
    default:
      throw new Error(`createRectTool: ${tool} is not a rectangle tool`);
  }
}

export function createLineTool(
  tool: "line" | "arrow",
  page: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  s: Style,
): LineAnnot {
  return {
    id: uid(),
    type: tool,
    page,
    x1,
    y1,
    x2,
    y2,
    stroke: s.color,
    strokeWidth: s.strokeWidth,
  };
}

export function createInkAnnotation(
  page: number,
  points: Array<[number, number]>,
  s: Style,
): InkAnnot {
  return {
    id: uid(),
    type: "ink",
    page,
    points,
    stroke: s.color,
    strokeWidth: s.strokeWidth,
  };
}

export function createImageAnnotation(
  type: "image" | "signature",
  page: number,
  r: Rect,
  bytes: Uint8Array,
  mime: "image/png" | "image/jpeg",
): ImageAnnot {
  return { id: uid(), type, page, ...r, rotation: 0, bytes, mime };
}
