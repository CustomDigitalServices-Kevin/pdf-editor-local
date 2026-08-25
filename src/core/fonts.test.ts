import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  HANDWRITING_FONTS,
  STANDARD_FONTS,
  DEFAULT_HANDWRITING_FONT,
  handwritingFont,
  isHandwritingFont,
  standardFontKey,
  fontCss,
} from "./fonts";

const FR = "éèêëàâäçùûüîïôöœÉÈÊÀÇÙÔÎŒ€°'’«»0123456789";

/** True when the TrueType table directory lists `tag`. */
function hasTable(bytes: Uint8Array, tag: string): boolean {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint16(4);
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 16;
    const t = String.fromCharCode(
      bytes[o] ?? 0,
      bytes[o + 1] ?? 0,
      bytes[o + 2] ?? 0,
      bytes[o + 3] ?? 0,
    );
    if (t === tag) return true;
  }
  return false;
}

describe("handwriting font registry", () => {
  it("bundles exactly ten distinct fonts", () => {
    expect(HANDWRITING_FONTS).toHaveLength(10);
    expect(new Set(HANDWRITING_FONTS.map((f) => f.key)).size).toBe(10);
    expect(new Set(HANDWRITING_FONTS.map((f) => f.cssFamily)).size).toBe(10);
  });

  it("only ships permissive licenses", () => {
    for (const f of HANDWRITING_FONTS) {
      expect(["OFL-1.1", "Apache-2.0"]).toContain(f.license);
    }
  });

  it("every file exists, is a static TrueType font and covers French accents", async () => {
    for (const f of HANDWRITING_FONTS) {
      const bytes = new Uint8Array(await readFile(resolve(process.cwd(), "src/fonts", f.file)));
      const font = fontkit.create(bytes);
      expect(font.postscriptName, f.key).toBeTruthy();
      // Variable fonts carry an fvar table: fontkit cannot subset them.
      expect(hasTable(bytes, "fvar"), `${f.key} is a variable font`).toBe(false);
      expect(hasTable(bytes, "glyf"), `${f.key} is not TrueType`).toBe(true);
      const missing = Array.from(FR).filter(
        (c) => !font.hasGlyphForCodePoint(c.codePointAt(0) ?? 0),
      );
      expect(missing, `${f.key} lacks ${missing.join("")}`).toEqual([]);
    }
  });

  it("resolves keys", () => {
    expect(isHandwritingFont("PatrickHand")).toBe(true);
    expect(isHandwritingFont("Helvetica")).toBe(false);
    expect(handwritingFont(DEFAULT_HANDWRITING_FONT).label).toBe("Patrick Hand");
    expect(STANDARD_FONTS).toHaveLength(12);
  });
});

describe("standardFontKey", () => {
  it("composes the 12 standard keys", () => {
    expect(standardFontKey("Helvetica", false, false)).toBe("Helvetica");
    expect(standardFontKey("Helvetica", true, true)).toBe("Helvetica-BoldOblique");
    expect(standardFontKey("Times", false, false)).toBe("Times-Roman");
    expect(standardFontKey("Times", false, true)).toBe("Times-Italic");
    expect(standardFontKey("Courier", true, false)).toBe("Courier-Bold");
  });
});

describe("fontCss", () => {
  it("maps standard keys to generic families with weight and slant", () => {
    expect(fontCss("Times-BoldItalic")).toEqual({
      fontFamily: "serif",
      fontWeight: "bold",
      fontStyle: "italic",
    });
    expect(fontCss("Courier-Oblique")).toEqual({
      fontFamily: "monospace",
      fontWeight: "normal",
      fontStyle: "italic",
    });
    expect(fontCss("Helvetica").fontFamily).toBe("sans-serif");
  });
  it("uses the registered family for handwriting keys", () => {
    expect(fontCss("Sacramento")).toEqual({
      fontFamily: '"Sacramento", cursive',
      fontWeight: "normal",
      fontStyle: "normal",
    });
  });
});
