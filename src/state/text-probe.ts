// Pure helpers behind "smart" text placement: where the source PDF's own text
// sits in VIEW POINTS, which runs are dotted "write here" zones, and what font
// size / family / colour the neighbouring text uses. Nothing here touches
// pdf.js or the DOM, so it is unit-tested with synthetic items and buffers.
// The pdf.js binding lives in src/engines/pdf/text-probe.ts.

import type { Rect, Rgb, StandardFontKey } from "../core/types";
import { standardFontKey } from "../core/fonts";

/** Affine matrix [a b c d e f], PDF / pdf.js convention. */
export type Matrix = readonly [number, number, number, number, number, number];

/** outer ∘ inner: apply `inner` first, then `outer` (pdf.js Util.transform). */
export function multiply(outer: Matrix, inner: Matrix): Matrix {
  return [
    outer[0] * inner[0] + outer[2] * inner[1],
    outer[1] * inner[0] + outer[3] * inner[1],
    outer[0] * inner[2] + outer[2] * inner[3],
    outer[1] * inner[2] + outer[3] * inner[3],
    outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
    outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
  ];
}

export function toMatrix(values: ReadonlyArray<number>): Matrix | null {
  const [a, b, c, d, e, f] = values;
  if (
    values.length !== 6 ||
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined ||
    e === undefined ||
    f === undefined ||
    ![a, b, c, d, e, f].every(Number.isFinite)
  ) {
    return null;
  }
  return [a, b, c, d, e, f];
}

export type GenericFamily = "serif" | "sans-serif" | "monospace";

/** One run of source text, positioned in view points (top-left origin). */
export type ProbeItem = {
  str: string;
  /** baseline start */
  ox: number;
  oy: number;
  /** unit vector along the baseline */
  ax: number;
  ay: number;
  /** unit vector pointing to the glyphs' top */
  ux: number;
  uy: number;
  /** length of the run along (ax, ay) */
  advance: number;
  fontSize: number;
  /** distance from baseline to glyph top / bottom (both positive) */
  ascent: number;
  descent: number;
  /** axis-aligned bounding box */
  rect: Rect;
  family: GenericFamily;
  bold: boolean;
  italic: boolean;
  /** pdf.js loadedName; also the CSS family pdf.js registered for the face */
  fontName: string;
};

/** The subset of a pdf.js TextItem this module reads. */
export type RawTextItem = {
  str: string;
  transform: ReadonlyArray<number>;
  width: number;
  fontName: string;
};

/** The subset of a pdf.js TextStyle this module reads. */
export type RawStyle = { fontFamily: string; ascent: number; descent: number };

/** What pdf.js exposes about a loaded font (commonObjs), when resolved. */
export type FontFlags = { name: string; bold: boolean; italic: boolean };

const BOLD_RE = /bold|black|heavy|semibold|demibold|extrabold/i;
const ITALIC_RE = /italic|oblique/i;

export function genericFamily(fontFamily: string): GenericFamily {
  const f = fontFamily.toLowerCase();
  if (f.includes("mono")) return "monospace";
  if (f.includes("serif") && !f.includes("sans")) return "serif";
  return "sans-serif";
}

function quadBounds(
  ox: number,
  oy: number,
  ax: number,
  ay: number,
  ux: number,
  uy: number,
  t0: number,
  t1: number,
  s0: number,
  s1: number,
): Rect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const t of [t0, t1]) {
    for (const s of [s0, s1]) {
      xs.push(ox + ax * t + ux * s);
      ys.push(oy + ay * t + uy * s);
    }
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Map one pdf.js text item into view space through the viewport matrix
 * (rotation-safe: the run keeps its own along/up axes, the rect is the bbox).
 */
export function mapTextItem(
  item: RawTextItem,
  viewport: Matrix,
  style: RawStyle | undefined,
  flags: FontFlags | null,
): ProbeItem | null {
  if (item.str.trim() === "") return null;
  const local = toMatrix(item.transform);
  if (!local) return null;
  const tx = multiply(viewport, local);
  const fontSize = Math.hypot(tx[2], tx[3]);
  const alongLen = Math.hypot(tx[0], tx[1]);
  if (!(fontSize > 0) || !(alongLen > 0)) return null;

  const ax = tx[0] / alongLen;
  const ay = tx[1] / alongLen;
  const ux = tx[2] / fontSize;
  const uy = tx[3] / fontSize;
  const viewportScale = Math.hypot(viewport[0], viewport[1]);
  const advance = item.width * viewportScale;

  // pdf.js font metrics are ratios of the em; fall back to typical values.
  let ascentRatio = 0.8;
  if (style && style.ascent > 0) ascentRatio = style.ascent;
  else if (style && style.descent < 0) ascentRatio = 1 + style.descent;
  ascentRatio = Math.min(1.2, Math.max(0.5, ascentRatio));
  let descentRatio = 0.2;
  if (style && style.descent < 0) descentRatio = -style.descent;
  descentRatio = Math.min(0.5, Math.max(0, descentRatio));
  const ascent = ascentRatio * fontSize;
  const descent = descentRatio * fontSize;

  const name = flags?.name ?? "";
  return {
    str: item.str,
    ox: tx[4],
    oy: tx[5],
    ax,
    ay,
    ux,
    uy,
    advance,
    fontSize,
    ascent,
    descent,
    rect: quadBounds(tx[4], tx[5], ax, ay, ux, uy, 0, advance, -descent, ascent),
    family: genericFamily(style?.fontFamily ?? "sans-serif"),
    bold: (flags?.bold ?? false) || BOLD_RE.test(name),
    italic: (flags?.italic ?? false) || ITALIC_RE.test(name),
    fontName: item.fontName,
  };
}

// ---- dotted "write here" zones ------------------------------------------

/** Runs of dots (optionally spaced), ellipses or underscores. */
export const DOT_RUN_RE = /(?:[.·•]\s?){3,}|…+|_{3,}/g;

export type CharRange = { start: number; end: number }; // [start, end)

export function findDotRuns(str: string): CharRange[] {
  const runs: CharRange[] = [];
  for (const m of str.matchAll(DOT_RUN_RE)) {
    const text = m[0];
    // Trim a trailing space captured by the "dot then optional space" group.
    const trimmed = text.trimEnd();
    if (trimmed.length === 0) continue;
    runs.push({ start: m.index, end: m.index + trimmed.length });
  }
  return runs;
}

/** True when the item is nothing but a dotted zone (no label text). */
export function isDotOnly(str: string): boolean {
  const s = str.trim();
  if (s === "") return false;
  const runs = findDotRuns(s);
  return runs.length === 1 && runs[0]?.start === 0 && runs[0].end === s.length;
}

/** Width of a text in the item's font; only ratios are used. */
export type Measure = (text: string) => number;

/**
 * Rect of a character range inside an item. `measure` (real glyph widths)
 * gives exact bounds; without it the range is split proportionally.
 */
export function subRunRect(
  item: ProbeItem,
  range: CharRange,
  measure: Measure | null,
  pad = 1,
): Rect {
  const len = item.str.length;
  let f0 = len > 0 ? range.start / len : 0;
  let f1 = len > 0 ? range.end / len : 1;
  if (measure) {
    const total = measure(item.str);
    if (total > 0) {
      f0 = measure(item.str.slice(0, range.start)) / total;
      f1 = measure(item.str.slice(0, range.end)) / total;
    }
  }
  f0 = Math.min(1, Math.max(0, f0));
  f1 = Math.min(1, Math.max(f0, f1));
  return quadBounds(
    item.ox,
    item.oy,
    item.ax,
    item.ay,
    item.ux,
    item.uy,
    f0 * item.advance - pad,
    f1 * item.advance + pad,
    -item.descent - pad,
    item.ascent + pad,
  );
}

export function rectContains(r: Rect, x: number, y: number, tolerance = 0): boolean {
  return (
    x >= r.x - tolerance &&
    x <= r.x + r.w + tolerance &&
    y >= r.y - tolerance &&
    y <= r.y + r.h + tolerance
  );
}

export type DotHit = { item: ProbeItem; range: CharRange; rect: Rect };

/**
 * The dotted zone under a view point, if any. `measurerFor` returns a glyph
 * measurer for an item (or null to fall back to a proportional split).
 */
export function dotRunAt(
  items: ReadonlyArray<ProbeItem>,
  vx: number,
  vy: number,
  measurerFor: (item: ProbeItem) => Measure | null,
  tolerance = 3,
): DotHit | null {
  let best: DotHit | null = null;
  for (const item of items) {
    if (!rectContains(item.rect, vx, vy, tolerance)) continue;
    const runs = findDotRuns(item.str);
    if (runs.length === 0) continue;
    const measure = measurerFor(item);
    for (const range of runs) {
      const rect = subRunRect(item, range, measure);
      if (!rectContains(rect, vx, vy, tolerance)) continue;
      if (!best || rect.w * rect.h < best.rect.w * best.rect.h) {
        best = { item, range, rect };
      }
    }
  }
  return best;
}

// ---- style of the surrounding text ---------------------------------------

/** Distance from a point to a rect (0 inside). */
export function rectDistance(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * The text run whose style a new text box should copy: the closest one within
 * `radius`, same-line runs preferred, dotted zones ignored (they carry no
 * readable style of their own).
 */
export function nearestStyleSource(
  items: ReadonlyArray<ProbeItem>,
  vx: number,
  vy: number,
  radius = 80,
): ProbeItem | null {
  let best: ProbeItem | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    if (isDotOnly(item.str)) continue;
    const d = rectDistance(item.rect, vx, vy);
    if (d > radius) continue;
    const cy = item.rect.y + item.rect.h / 2;
    const score = d + 0.2 * Math.abs(cy - vy);
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

export type DetectedStyle = { fontFamily: StandardFontKey; fontSize: number };

export function styleFromItem(item: ProbeItem): DetectedStyle {
  const family =
    item.family === "serif" ? "Times" : item.family === "monospace" ? "Courier" : "Helvetica";
  const size = Math.min(96, Math.max(6, Math.round(item.fontSize * 2) / 2));
  return { fontFamily: standardFontKey(family, item.bold, item.italic), fontSize: size };
}

// ---- colour sampling -------------------------------------------------------

type Bin = { count: number; r: number; g: number; b: number };

/**
 * Dominant ink colour of a rendered text area (RGBA pixels). The background is
 * the most frequent colour; the ink is the well-populated colour farthest from
 * it, which skips anti-aliased edge pixels. Null when the area is flat.
 */
export function sampleTextColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Rgb | null {
  const bins = new Map<number, Bin>();
  const n = Math.min(width * height, Math.floor(data.length / 4));
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3] ?? 0;
    if (a < 128) continue;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key);
    if (bin) {
      bin.count++;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    } else {
      bins.set(key, { count: 1, r, g, b });
    }
  }
  if (bins.size < 2) return null;
  let bg: Bin | null = null;
  for (const bin of bins.values()) if (!bg || bin.count > bg.count) bg = bin;
  if (!bg) return null;
  const bgR = bg.r / bg.count;
  const bgG = bg.g / bg.count;
  const bgB = bg.b / bg.count;
  let ink: Bin | null = null;
  let inkDist = 0;
  for (const bin of bins.values()) {
    if (bin === bg || bin.count < 2) continue;
    const d = Math.hypot(bin.r / bin.count - bgR, bin.g / bin.count - bgG, bin.b / bin.count - bgB);
    if (d > inkDist) {
      inkDist = d;
      ink = bin;
    }
  }
  if (!ink || inkDist < 48) return null;
  return {
    r: ink.r / ink.count / 255,
    g: ink.g / ink.count / 255,
    b: ink.b / ink.count / 255,
  };
}
