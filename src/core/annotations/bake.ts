// Bake overlay annotations onto a PDF page (@cantoo/pdf-lib).
//
// Every geometric annotation is placed through coords.ts, so page rotation is
// handled uniformly. The one documented v1 limitation is TEXT ORIENTATION on a
// rotated page: baked text follows the page's media orientation. On the common
// case (page rotation 0) text honours its own `rotation` field exactly.

import { rgb, degrees } from "@cantoo/pdf-lib";
import type { PDFPage, PDFFont, PDFImage } from "@cantoo/pdf-lib";
import {
  pointOverlayToPdf,
  rectOverlayToPdf,
  lengthOverlayToPdf,
} from "../coords";
import type {
  PageGeometry,
  Rgb,
  ShapeAnnot,
  LineAnnot,
  InkAnnot,
  MarkupAnnot,
  WhiteoutAnnot,
  ImageAnnot,
  TextAnnot,
} from "../types";

const color = (c: Rgb) => rgb(c.r, c.g, c.b);
const HIGHLIGHT_OPACITY = 0.4;

export function bakeShape(
  page: PDFPage,
  a: ShapeAnnot,
  geom: PageGeometry,
): void {
  const r = rectOverlayToPdf(a, geom);
  // Assemble only the defined options: exactOptionalPropertyTypes forbids
  // passing an explicit `undefined` for an optional Color property.
  const strokeOpts = a.stroke
    ? {
        borderColor: color(a.stroke),
        borderWidth: lengthOverlayToPdf(a.strokeWidth, geom),
        borderOpacity: a.opacity,
      }
    : {};
  const fillOpts = a.fill ? { color: color(a.fill), opacity: a.opacity } : {};
  if (a.type === "ellipse") {
    page.drawEllipse({
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      xScale: r.width / 2,
      yScale: r.height / 2,
      ...strokeOpts,
      ...fillOpts,
    });
  } else {
    page.drawRectangle({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      ...strokeOpts,
      ...fillOpts,
    });
  }
}

function drawSegment(
  page: PDFPage,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  stroke: Rgb,
  thickness: number,
): void {
  page.drawLine({ start: p1, end: p2, thickness, color: color(stroke) });
}

export function bakeLine(
  page: PDFPage,
  a: LineAnnot,
  geom: PageGeometry,
): void {
  const p1 = pointOverlayToPdf(a.x1, a.y1, geom);
  const p2 = pointOverlayToPdf(a.x2, a.y2, geom);
  const thickness = lengthOverlayToPdf(a.strokeWidth, geom);
  drawSegment(page, p1, p2, a.stroke, thickness);

  if (a.type === "arrow") {
    // Two head segments at 25 degrees off the shaft, length scaled to the line.
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const head = Math.max(6, thickness * 4);
    const spread = (25 * Math.PI) / 180;
    for (const sign of [1, -1]) {
      const a2 = angle + Math.PI + sign * spread;
      drawSegment(
        page,
        p2,
        { x: p2.x + head * Math.cos(a2), y: p2.y + head * Math.sin(a2) },
        a.stroke,
        thickness,
      );
    }
  }
}

export function bakeInk(page: PDFPage, a: InkAnnot, geom: PageGeometry): void {
  if (a.points.length < 2) return;
  const thickness = lengthOverlayToPdf(a.strokeWidth, geom);
  const pts = a.points.map(([x, y]) => pointOverlayToPdf(x, y, geom));
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    if (prev && cur) drawSegment(page, prev, cur, a.stroke, thickness);
  }
}

export function bakeMarkup(
  page: PDFPage,
  a: MarkupAnnot,
  geom: PageGeometry,
): void {
  const r = rectOverlayToPdf(a, geom);
  if (a.type === "highlight") {
    page.drawRectangle({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      color: color(a.color),
      opacity: HIGHLIGHT_OPACITY,
    });
    return;
  }
  // underline sits near the bottom, strike through the middle.
  const y = a.type === "underline" ? r.y + r.height * 0.08 : r.y + r.height / 2;
  page.drawLine({
    start: { x: r.x, y },
    end: { x: r.x + r.width, y },
    thickness: Math.max(1, r.height * 0.06),
    color: color(a.color),
  });
}

export function bakeWhiteout(
  page: PDFPage,
  a: WhiteoutAnnot,
  geom: PageGeometry,
): void {
  const r = rectOverlayToPdf(a, geom);
  page.drawRectangle({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    color: rgb(1, 1, 1),
    opacity: 1,
  });
}

export function bakeImage(
  page: PDFPage,
  a: ImageAnnot,
  geom: PageGeometry,
  image: PDFImage,
): void {
  const r = rectOverlayToPdf(a, geom);
  page.drawImage(image, {
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    rotate: degrees(a.rotation === 0 ? 0 : 360 - (a.rotation % 360)),
  });
}

export function bakeText(
  page: PDFPage,
  a: TextAnnot,
  geom: PageGeometry,
  font: PDFFont,
): void {
  const r = rectOverlayToPdf(a, geom);
  const size = lengthOverlayToPdf(a.fontSize, geom);
  const ascent = font.heightAtSize(size, { descender: false });
  const lineHeight = font.heightAtSize(size);
  const lines = a.text.split("\n");
  const topY = r.y + r.height;

  lines.forEach((line, i) => {
    const textWidth = font.widthOfTextAtSize(line, size);
    let x = r.x;
    if (a.align === "center") x = r.x + (r.width - textWidth) / 2;
    else if (a.align === "right") x = r.x + r.width - textWidth;
    const y = topY - ascent - i * lineHeight;
    page.drawText(line, {
      x,
      y,
      size,
      font,
      color: color(a.color),
      rotate: degrees(a.rotation === 0 ? 0 : 360 - (a.rotation % 360)),
    });
  });
}
