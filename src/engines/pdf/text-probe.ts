// pdf.js binding for the text probe: extracts a page's text runs in view
// points (see src/state/text-probe.ts for the pure maths) and provides the two
// DOM-bound helpers (glyph measurer, canvas colour sampling).
//
// Call probePageText AFTER the page has been rendered: pdf.js only resolves
// font objects (commonObjs) and registers their FontFace while rendering.

import type { PdfDoc } from "./render";
import type { Rect, Rgb } from "../../core/types";
import {
  mapTextItem,
  sampleTextColor,
  toMatrix,
  type FontFlags,
  type Measure,
  type ProbeItem,
  type RawStyle,
} from "../../state/text-probe";

type CommonObjs = { has(id: string): boolean; get(id: string): unknown };

function readFontFlags(objs: CommonObjs, fontName: string): FontFlags | null {
  if (!objs.has(fontName)) return null;
  const obj: unknown = objs.get(fontName);
  if (typeof obj !== "object" || obj === null) return null;
  const rec = obj as Record<string, unknown>;
  return {
    name: typeof rec["name"] === "string" ? rec["name"] : "",
    bold: rec["bold"] === true,
    italic: rec["italic"] === true,
  };
}

export async function probePageText(
  doc: PdfDoc,
  pageNumber: number,
  rotation: number,
): Promise<ProbeItem[]> {
  const page = await doc.getPage(pageNumber);
  const viewport = toMatrix(page.getViewport({ scale: 1, rotation }).transform);
  if (!viewport) return [];
  const content = await page.getTextContent();
  const styles: Record<string, RawStyle | undefined> = content.styles;
  const out: ProbeItem[] = [];
  for (const raw of content.items) {
    if (!("str" in raw)) continue; // marked-content entry, no glyphs
    const item = mapTextItem(
      raw,
      viewport,
      styles[raw.fontName],
      readFontFlags(page.commonObjs, raw.fontName),
    );
    if (item) out.push(item);
  }
  return out;
}

/**
 * Glyph measurer for an item: uses the FontFace pdf.js registered for the
 * font when it is loaded (exact widths), else the generic family (pdf.js's
 * own text layer measures the same way). Null when no 2D context exists.
 */
export function makeMeasurer(): (item: ProbeItem) => Measure | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => null;
  const loadedFaces = new Set<string>();
  document.fonts.forEach((face) => {
    if (face.status === "loaded") loadedFaces.add(face.family.replace(/^"|"$/g, ""));
  });
  return (item) => {
    const family = loadedFaces.has(item.fontName) ? `"${item.fontName}"` : item.family;
    const size = Math.max(4, item.fontSize);
    ctx.font = `${item.italic ? "italic " : ""}${item.bold ? "bold " : ""}${size}px ${family}`;
    return (text) => ctx.measureText(text).width;
  };
}

/** Ink colour inside a view-point rect of the rendered page canvas. */
export function sampleColorAt(canvas: HTMLCanvasElement, rect: Rect, scale: number): Rgb | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const x0 = Math.max(0, Math.floor(rect.x * scale));
  const y0 = Math.max(0, Math.floor(rect.y * scale));
  const x1 = Math.min(canvas.width, Math.ceil((rect.x + rect.w) * scale));
  const y1 = Math.min(canvas.height, Math.ceil((rect.y + rect.h) * scale));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return null;
  const img = ctx.getImageData(x0, y0, w, h);
  return sampleTextColor(img.data, w, h);
}
