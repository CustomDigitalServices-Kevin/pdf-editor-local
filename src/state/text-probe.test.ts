import { describe, it, expect } from "vitest";
import {
  multiply,
  toMatrix,
  mapTextItem,
  findDotRuns,
  isDotOnly,
  subRunRect,
  dotRunAt,
  rectDistance,
  nearestStyleSource,
  styleFromItem,
  sampleTextColor,
  genericFamily,
} from "./text-probe";
import type { Matrix, ProbeItem, RawTextItem } from "./text-probe";

// pdf.js viewport at scale 1, rotation 0, for a page of height H:
// PDF (y up) -> view (y down).
const H = 800;
const VIEW0: Matrix = [1, 0, 0, -1, 0, H];
// rotation 90 (clockwise) for a W x H page: x' = H - y ... pdf.js gives
// [0, 1, 1, 0, 0, 0] with width/height swapped. Real matrix from pdf.js:
const VIEW90: Matrix = [0, 1, 1, 0, 0, 0];

function item(str: string, x: number, y: number, size: number, width: number): RawTextItem {
  return { str, transform: [size, 0, 0, size, x, y], width, fontName: "g_d0_f1" };
}

const STYLE = { fontFamily: "sans-serif", ascent: 0.9, descent: -0.25 };

describe("matrices", () => {
  it("multiplies in pdf.js Util.transform order (inner first)", () => {
    const translate: Matrix = [1, 0, 0, 1, 10, 20];
    const scale: Matrix = [2, 0, 0, 2, 0, 0];
    // scale then translate: (1,1) -> (2,2) -> (12,22)
    const m = multiply(translate, scale);
    expect([m[0] * 1 + m[2] * 1 + m[4], m[1] * 1 + m[3] * 1 + m[5]]).toEqual([12, 22]);
  });
  it("rejects malformed matrices", () => {
    expect(toMatrix([1, 2, 3])).toBeNull();
    expect(toMatrix([1, 0, 0, 1, NaN, 0])).toBeNull();
    expect(toMatrix([1, 0, 0, 1, 5, 6])).toEqual([1, 0, 0, 1, 5, 6]);
  });
});

describe("mapTextItem", () => {
  it("maps an upright run to a top-left bbox with font metrics", () => {
    const p = mapTextItem(item("Nom :", 100, 700, 12, 40), VIEW0, STYLE, null);
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p.fontSize).toBeCloseTo(12);
    expect(p.ox).toBe(100);
    expect(p.oy).toBe(H - 700); // baseline in view space
    expect(p.ascent).toBeCloseTo(0.9 * 12);
    expect(p.descent).toBeCloseTo(0.25 * 12);
    expect(p.rect.x).toBeCloseTo(100);
    expect(p.rect.w).toBeCloseTo(40);
    expect(p.rect.y).toBeCloseTo(100 - 10.8); // baseline - ascent
    expect(p.rect.h).toBeCloseTo(10.8 + 3);
    expect(p.family).toBe("sans-serif");
    expect(p.bold).toBe(false);
  });

  it("is rotation-safe: a 90-degree page swaps the run along the y axis", () => {
    const p = mapTextItem(item("Texte", 100, 700, 12, 40), VIEW90, STYLE, null);
    expect(p).not.toBeNull();
    if (!p) return;
    // baseline direction now vertical
    expect(Math.abs(p.ay)).toBeCloseTo(1);
    expect(p.rect.h).toBeCloseTo(40);
    expect(p.rect.w).toBeCloseTo(10.8 + 3);
  });

  it("reads bold / italic from the font object and from the font name", () => {
    const flagged = mapTextItem(item("A", 0, 0, 10, 5), VIEW0, STYLE, {
      name: "Arial",
      bold: true,
      italic: false,
    });
    expect(flagged?.bold).toBe(true);
    const named = mapTextItem(item("A", 0, 0, 10, 5), VIEW0, STYLE, {
      name: "ABCDEF+Times-BoldItalic",
      bold: false,
      italic: false,
    });
    expect(named?.bold).toBe(true);
    expect(named?.italic).toBe(true);
  });

  it("falls back to typical metrics when the style is missing", () => {
    const p = mapTextItem(item("A", 0, 0, 10, 5), VIEW0, undefined, null);
    expect(p?.ascent).toBeCloseTo(8);
    expect(p?.descent).toBeCloseTo(2);
  });

  it("skips blank items and degenerate transforms", () => {
    expect(mapTextItem(item("   ", 0, 0, 10, 5), VIEW0, STYLE, null)).toBeNull();
    expect(mapTextItem(item("A", 0, 0, 0, 5), VIEW0, STYLE, null)).toBeNull();
  });

  it("maps generic family names", () => {
    expect(genericFamily("serif")).toBe("serif");
    expect(genericFamily("sans-serif")).toBe("sans-serif");
    expect(genericFamily("monospace")).toBe("monospace");
    expect(genericFamily("Calibri, sans-serif")).toBe("sans-serif");
  });
});

describe("dotted zones", () => {
  it("finds dot, spaced-dot, ellipsis and underscore runs", () => {
    expect(findDotRuns("Nom : ..........")).toEqual([{ start: 6, end: 16 }]);
    expect(findDotRuns("Date : . . . . .")).toEqual([{ start: 7, end: 16 }]);
    expect(findDotRuns("Lieu ……")).toEqual([{ start: 5, end: 7 }]);
    expect(findDotRuns("Signature ______")).toEqual([{ start: 10, end: 16 }]);
  });
  it("ignores ordinary punctuation", () => {
    expect(findDotRuns("Fin de phrase. Suite.")).toEqual([]);
    expect(findDotRuns("v1.2.3")).toEqual([]);
  });
  it("flags dot-only items", () => {
    expect(isDotOnly("..........")).toBe(true);
    expect(isDotOnly("  ......  ")).toBe(true);
    expect(isDotOnly("Nom : .....")).toBe(false);
    expect(isDotOnly("")).toBe(false);
  });

  const nom = mapTextItem(item("Nom : ..........", 100, 700, 12, 160), VIEW0, STYLE, null);

  it("computes the sub-run rect proportionally without a measurer", () => {
    if (!nom) throw new Error("fixture");
    const r = subRunRect(nom, { start: 6, end: 16 }, null, 0);
    // 6/16 of 160 = 60 -> x from 160 to 260
    expect(r.x).toBeCloseTo(160);
    expect(r.w).toBeCloseTo(100);
    expect(r.y).toBeCloseTo(100 - 10.8);
  });

  it("uses glyph widths when a measurer is available", () => {
    if (!nom) throw new Error("fixture");
    // label chars are twice as wide as dots
    const measure = (t: string) => Array.from(t).reduce((s, c) => s + (c === "." ? 1 : 2), 0);
    const r = subRunRect(nom, { start: 6, end: 16 }, measure, 0);
    // label "Nom : " = 12 units, dots = 10 units, total 22 -> start at 12/22
    expect(r.x).toBeCloseTo(100 + (12 / 22) * 160);
    expect(r.x + r.w).toBeCloseTo(260);
  });

  it("hits the dotted run under the pointer, not the label", () => {
    if (!nom) throw new Error("fixture");
    const items = [nom];
    expect(dotRunAt(items, 120, 95, () => null)).toBeNull(); // on "Nom :"
    const hit = dotRunAt(items, 200, 95, () => null);
    expect(hit?.range).toEqual({ start: 6, end: 16 });
    expect(hit && hit.rect.x <= 200 && hit.rect.x + hit.rect.w >= 200).toBe(true);
    expect(dotRunAt(items, 200, 300, () => null)).toBeNull(); // far away
  });
});

describe("style detection", () => {
  it("measures point-to-rect distance", () => {
    const r = { x: 10, y: 10, w: 20, h: 10 };
    expect(rectDistance(r, 15, 15)).toBe(0);
    expect(rectDistance(r, 40, 15)).toBe(10);
    expect(rectDistance(r, 40, 30)).toBeCloseTo(Math.hypot(10, 10));
  });

  it("picks the closest readable run, ignoring dot-only runs", () => {
    const label = mapTextItem(item("Nom :", 100, 700, 12, 40), VIEW0, STYLE, null);
    const dots = mapTextItem(item("..........", 150, 700, 12, 100), VIEW0, STYLE, null);
    const far = mapTextItem(item("Titre", 100, 200, 24, 80), VIEW0, STYLE, null);
    const items = [label, dots, far].filter((x): x is ProbeItem => x !== null);
    expect(nearestStyleSource(items, 200, 95)?.str).toBe("Nom :");
    expect(nearestStyleSource(items, 100, 400)).toBeNull(); // beyond radius
  });

  it("derives a standard font key and a half-point size", () => {
    const base = mapTextItem(item("A", 0, 0, 11.3, 5), VIEW0, STYLE, null);
    if (!base) throw new Error("fixture");
    expect(styleFromItem(base)).toEqual({ fontFamily: "Helvetica", fontSize: 11.5 });
    expect(styleFromItem({ ...base, family: "serif", bold: true, italic: true })).toEqual({
      fontFamily: "Times-BoldItalic",
      fontSize: 11.5,
    });
    expect(styleFromItem({ ...base, family: "monospace", bold: true }).fontFamily).toBe(
      "Courier-Bold",
    );
    expect(styleFromItem({ ...base, fontSize: 200 }).fontSize).toBe(96);
  });
});

describe("sampleTextColor", () => {
  function buffer(w: number, h: number, paint: (x: number, y: number) => [number, number, number]) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = paint(x, y);
        const o = (y * w + x) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
    return data;
  }

  it("returns the ink colour of anti-aliased red text on white", () => {
    // 20x10: a red 4px-wide stroke with lighter (blended) edges.
    const data = buffer(20, 10, (x) => {
      if (x >= 8 && x < 12) return [200, 20, 20];
      if (x === 7 || x === 12) return [235, 160, 160];
      return [255, 255, 255];
    });
    const c = sampleTextColor(data, 20, 10);
    expect(c).not.toBeNull();
    if (!c) return;
    expect(c.r * 255).toBeCloseTo(200, 0);
    expect(c.g * 255).toBeCloseTo(20, 0);
  });

  it("returns null on a flat area", () => {
    expect(
      sampleTextColor(
        buffer(8, 8, () => [255, 255, 255]),
        8,
        8,
      ),
    ).toBeNull();
  });

  it("ignores single stray pixels and transparent pixels", () => {
    const data = buffer(10, 10, (x, y) => (x === 3 && y === 3 ? [0, 0, 0] : [255, 255, 255]));
    expect(sampleTextColor(data, 10, 10)).toBeNull();
    const transparent = new Uint8ClampedArray(10 * 10 * 4); // alpha 0 everywhere
    expect(sampleTextColor(transparent, 10, 10)).toBeNull();
  });
});
