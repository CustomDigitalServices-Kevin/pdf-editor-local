import { describe, it, expect } from "vitest";
import {
  viewportDims,
  pxToPt,
  ptToPx,
  pointOverlayToPdf,
  rectOverlayToPdf,
  effectiveRotation,
} from "./coords";
import type { PageGeometry } from "./types";

// A 600 x 800 pt page (portrait media box).
const base = (rotation: PageGeometry["rotation"], scale = 1): PageGeometry => ({
  widthPt: 600,
  heightPt: 800,
  scale,
  rotation,
});

describe("pxToPt / ptToPx", () => {
  it("round-trips through a non-unit scale", () => {
    expect(pxToPt(300, 1.5)).toBe(200);
    expect(ptToPx(200, 1.5)).toBe(300);
  });
});

describe("viewportDims", () => {
  it("keeps media dims at 0/180", () => {
    expect(viewportDims(base(0))).toEqual({ Wv: 600, Hv: 800 });
    expect(viewportDims(base(180))).toEqual({ Wv: 600, Hv: 800 });
  });
  it("swaps dims at 90/270", () => {
    expect(viewportDims(base(90))).toEqual({ Wv: 800, Hv: 600 });
    expect(viewportDims(base(270))).toEqual({ Wv: 800, Hv: 600 });
  });
});

describe("pointOverlayToPdf — rotation 0", () => {
  it("top-left of the view maps to the top-left of the media box", () => {
    // 50 px from the top, on a 800 tall page => 750 pt from the bottom.
    expect(pointOverlayToPdf(100, 50, base(0))).toEqual({ x: 100, y: 750 });
  });
  it("honours scale", () => {
    // scale 2: 200 px = 100 pt across, 100 px = 50 pt down => y = 800-50.
    expect(pointOverlayToPdf(200, 100, base(0, 2))).toEqual({ x: 100, y: 750 });
  });
});

describe("pointOverlayToPdf — rotation 90", () => {
  // View is 800 (Wv) x 600 (Hv). View top-left must land on media bottom-left.
  it("view top-left -> media bottom-left", () => {
    expect(pointOverlayToPdf(0, 0, base(90))).toEqual({ x: 0, y: 0 });
  });
  it("view top-right -> media top-left", () => {
    // view x max = 800 px (=Wv)
    expect(pointOverlayToPdf(800, 0, base(90))).toEqual({ x: 0, y: 800 });
  });
});

describe("pointOverlayToPdf — rotation 180", () => {
  it("view top-left -> media top-right", () => {
    expect(pointOverlayToPdf(0, 0, base(180))).toEqual({ x: 600, y: 0 });
  });
});

describe("pointOverlayToPdf — rotation 270", () => {
  it("view top-left -> media top-right corner", () => {
    // Wv=800,Hv=600. (0,0) -> mx=Wm-vy=600, my=vx=0 -> pdf {600, 800}
    expect(pointOverlayToPdf(0, 0, base(270))).toEqual({ x: 600, y: 800 });
  });
});

describe("rectOverlayToPdf — rotation 0", () => {
  it("keeps width/height and places the bottom-left corner", () => {
    expect(rectOverlayToPdf({ x: 100, y: 50, w: 200, h: 30 }, base(0))).toEqual(
      {
        x: 100,
        y: 720,
        width: 200,
        height: 30,
      },
    );
  });
});

describe("rectOverlayToPdf — rotation 90 swaps the extent", () => {
  it("a wide overlay rect becomes a tall media rect", () => {
    // overlay rect near the view top-left, 200 wide x 30 tall
    const r = rectOverlayToPdf({ x: 0, y: 0, w: 200, h: 30 }, base(90));
    // corners (view px) -> media pdf:
    //  (0,0)     -> (0,0)
    //  (200,0)   -> (0,200)
    //  (0,30)    -> (30,0)
    //  (200,30)  -> (30,200)
    expect(r).toEqual({ x: 0, y: 0, width: 30, height: 200 });
  });
});

describe("effectiveRotation", () => {
  it("subtracts the page rotation and normalises to 0..359", () => {
    expect(effectiveRotation(0, base(0))).toBe(0);
    expect(effectiveRotation(0, base(90))).toBe(270);
    expect(effectiveRotation(45, base(90))).toBe(315);
    expect(effectiveRotation(90, base(0))).toBe(90);
  });
});
