// Pure geometry helpers for moving/resizing annotations in VIEW POINTS.

import type { Annotation, Rect } from "../core/types";

/** Bounding rect for the rectangle-shaped annotations, else null. */
export function annotationRect(a: Annotation): Rect | null {
  switch (a.type) {
    case "text":
    case "rect":
    case "ellipse":
    case "highlight":
    case "underline":
    case "strike":
    case "whiteout":
    case "image":
    case "signature":
    case "link":
      return { x: a.x, y: a.y, w: a.w, h: a.h };
    default:
      return null;
  }
}

export function translateAnnotation(
  a: Annotation,
  dx: number,
  dy: number,
): Annotation {
  switch (a.type) {
    case "line":
    case "arrow":
      return {
        ...a,
        x1: a.x1 + dx,
        y1: a.y1 + dy,
        x2: a.x2 + dx,
        y2: a.y2 + dy,
      };
    case "ink":
      return { ...a, points: a.points.map(([x, y]) => [x + dx, y + dy]) };
    default:
      return { ...a, x: a.x + dx, y: a.y + dy };
  }
}

/** Resize a rectangle-shaped annotation to a new rect (view points). */
export function resizeAnnotation(a: Annotation, rect: Rect): Annotation {
  if (annotationRect(a) === null) return a;
  const w = Math.max(4, rect.w);
  const h = Math.max(4, rect.h);
  return { ...a, x: rect.x, y: rect.y, w, h } as Annotation;
}

/** Normalise a drag (start -> current) into a positive-size rect. */
export function rectFromDrag(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Rect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}
