// Coordinate conversion between OVERLAY space and PDF space.
//
// Overlay space (what the user manipulates, what pdf.js renders into):
//   - origin top-left, y grows downward
//   - unit = CSS pixel, where  overlayPx = viewportPt * scale
//   - it is the ROTATED view: a page with /Rotate=90 is already rendered
//     rotated, so the overlay canvas has the rotated (swapped) dimensions.
//
// PDF space (what @cantoo/pdf-lib draws into):
//   - origin bottom-left, y grows upward
//   - unit = PDF point
//   - the UNROTATED media box; the viewer re-applies /Rotate at display time.
//
// So a point the user places in the rotated view must be mapped back into the
// unrotated media box, or it lands in the wrong corner on a rotated page.

import type { PageGeometry, Rect } from "./types";

/** Viewport (rotated view) dimensions in PDF points. */
export function viewportDims(
  geom: Pick<PageGeometry, "widthPt" | "heightPt" | "rotation">,
): {
  Wv: number;
  Hv: number;
} {
  if (geom.rotation === 90 || geom.rotation === 270) {
    return { Wv: geom.heightPt, Hv: geom.widthPt };
  }
  return { Wv: geom.widthPt, Hv: geom.heightPt };
}

/** overlay pixels -> viewport points (still top-left origin). */
export function pxToPt(value: number, scale: number): number {
  return value / scale;
}

/** viewport points -> overlay pixels. */
export function ptToPx(value: number, scale: number): number {
  return value * scale;
}

/**
 * Map one overlay point (top-left origin, px, in the rotated view) to a PDF
 * point (bottom-left origin, points, in the unrotated media box).
 */
export function pointOverlayToPdf(
  px: number,
  py: number,
  geom: PageGeometry,
): { x: number; y: number } {
  const vx = pxToPt(px, geom.scale); // view coords, top-left origin
  const vy = pxToPt(py, geom.scale);
  const Wm = geom.widthPt;
  const Hm = geom.heightPt;

  // Inverse of the display rotation: view (top-left) -> media (top-left).
  let mx: number;
  let my: number;
  switch (geom.rotation) {
    case 90:
      mx = vy;
      my = Hm - vx;
      break;
    case 180:
      mx = Wm - vx;
      my = Hm - vy;
      break;
    case 270:
      mx = Wm - vy;
      my = vx;
      break;
    default: // 0
      mx = vx;
      my = vy;
      break;
  }

  // media top-left -> media bottom-left (pdf-lib origin).
  return { x: mx, y: Hm - my };
}

/**
 * Map an axis-aligned overlay rectangle to a PDF-space rectangle
 * ({ x, y } = bottom-left corner, width, height), rotation-safe.
 *
 * Because every rotation is a multiple of 90 degrees, the transformed rectangle
 * stays axis-aligned, so its bounding box over the four mapped corners is exact.
 */
export function rectOverlayToPdf(
  rect: Rect,
  geom: PageGeometry,
): { x: number; y: number; width: number; height: number } {
  const corners: Array<[number, number]> = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x, rect.y + rect.h],
    [rect.x + rect.w, rect.y + rect.h],
  ];
  const mapped = corners.map(([cx, cy]) => pointOverlayToPdf(cx, cy, geom));
  const xs = mapped.map((p) => p.x);
  const ys = mapped.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Overlay length (px) along either axis, expressed in PDF points. */
export function lengthOverlayToPdf(px: number, geom: PageGeometry): number {
  return pxToPt(px, geom.scale);
}

/**
 * Extra clockwise rotation (degrees) that pdf-lib content must carry so that,
 * after the viewer applies the page /Rotate, it appears rotated by
 * `userRotation` in the view. Draw APIs take counterclockwise positive, hence
 * the sign handling lives with the caller; this returns the normalised 0..359
 * clockwise value userRotation - pageRotation.
 */
export function effectiveRotation(
  userRotation: number,
  geom: PageGeometry,
): number {
  const raw = userRotation - geom.rotation;
  return ((raw % 360) + 360) % 360;
}
