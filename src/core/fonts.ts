// Font registry: the 12 standard PDF fonts (never embedded, WinAnsi) plus the
// bundled handwriting fonts (static TTF, embedded as a subset at export).
//
// The TTF assets are resolved by Vite (?url): content-hashed, served from
// 'self' under the strict CSP and only fetched when a handwriting font is
// actually used on screen or exported (never on first load).

import type { FontKey, HandwritingFontKey, StandardFontKey } from "./types";
import patrickHandUrl from "../fonts/PatrickHand-Regular.ttf?url";
import indieFlowerUrl from "../fonts/IndieFlower-Regular.ttf?url";
import shadowsIntoLightUrl from "../fonts/ShadowsIntoLight.ttf?url";
import gloriaHallelujahUrl from "../fonts/GloriaHallelujah.ttf?url";
import architectsDaughterUrl from "../fonts/ArchitectsDaughter-Regular.ttf?url";
import handleeUrl from "../fonts/Handlee-Regular.ttf?url";
import homemadeAppleUrl from "../fonts/HomemadeApple-Regular.ttf?url";
import sacramentoUrl from "../fonts/Sacramento-Regular.ttf?url";
import marckScriptUrl from "../fonts/MarckScript-Regular.ttf?url";
import nothingYouCouldDoUrl from "../fonts/NothingYouCouldDo.ttf?url";

export type HandwritingFont = {
  key: HandwritingFontKey;
  /** Human name shown in the gallery. */
  label: string;
  /** CSS font-family used on screen once the FontFace is registered. */
  cssFamily: string;
  /** File name under src/fonts (Node tests read the bytes from disk). */
  file: string;
  /** Asset URL resolved by Vite (browser fetch for FontFace + embedding). */
  url: string;
  license: "OFL-1.1" | "Apache-2.0";
  author: string;
};

export const HANDWRITING_FONTS: ReadonlyArray<HandwritingFont> = [
  {
    key: "PatrickHand",
    label: "Patrick Hand",
    cssFamily: "Patrick Hand",
    file: "PatrickHand-Regular.ttf",
    url: patrickHandUrl,
    license: "OFL-1.1",
    author: "Patrick Wagesreiter",
  },
  {
    key: "IndieFlower",
    label: "Indie Flower",
    cssFamily: "Indie Flower",
    file: "IndieFlower-Regular.ttf",
    url: indieFlowerUrl,
    license: "OFL-1.1",
    author: "Kimberly Geswein",
  },
  {
    key: "ShadowsIntoLight",
    label: "Shadows Into Light",
    cssFamily: "Shadows Into Light",
    file: "ShadowsIntoLight.ttf",
    url: shadowsIntoLightUrl,
    license: "OFL-1.1",
    author: "Kimberly Geswein",
  },
  {
    key: "GloriaHallelujah",
    label: "Gloria Hallelujah",
    cssFamily: "Gloria Hallelujah",
    file: "GloriaHallelujah.ttf",
    url: gloriaHallelujahUrl,
    license: "OFL-1.1",
    author: "Kimberly Geswein",
  },
  {
    key: "ArchitectsDaughter",
    label: "Architects Daughter",
    cssFamily: "Architects Daughter",
    file: "ArchitectsDaughter-Regular.ttf",
    url: architectsDaughterUrl,
    license: "OFL-1.1",
    author: "Kimberly Geswein",
  },
  {
    key: "Handlee",
    label: "Handlee",
    cssFamily: "Handlee",
    file: "Handlee-Regular.ttf",
    url: handleeUrl,
    license: "OFL-1.1",
    author: "Joe Prince",
  },
  {
    key: "HomemadeApple",
    label: "Homemade Apple",
    cssFamily: "Homemade Apple",
    file: "HomemadeApple-Regular.ttf",
    url: homemadeAppleUrl,
    license: "Apache-2.0",
    author: "Font Diner",
  },
  {
    key: "Sacramento",
    label: "Sacramento",
    cssFamily: "Sacramento",
    file: "Sacramento-Regular.ttf",
    url: sacramentoUrl,
    license: "OFL-1.1",
    author: "Astigmatic",
  },
  {
    key: "MarckScript",
    label: "Marck Script",
    cssFamily: "Marck Script",
    file: "MarckScript-Regular.ttf",
    url: marckScriptUrl,
    license: "OFL-1.1",
    author: "Denis Masharov",
  },
  {
    key: "NothingYouCouldDo",
    label: "Nothing You Could Do",
    cssFamily: "Nothing You Could Do",
    file: "NothingYouCouldDo.ttf",
    url: nothingYouCouldDoUrl,
    license: "OFL-1.1",
    author: "Kimberly Geswein",
  },
];

const BY_KEY: ReadonlyMap<HandwritingFontKey, HandwritingFont> = new Map(
  HANDWRITING_FONTS.map((f) => [f.key, f]),
);

export const DEFAULT_HANDWRITING_FONT: HandwritingFontKey = "PatrickHand";

export function isHandwritingFont(key: FontKey): key is HandwritingFontKey {
  return BY_KEY.has(key as HandwritingFontKey);
}

export function handwritingFont(key: HandwritingFontKey): HandwritingFont {
  const f = BY_KEY.get(key);
  if (!f) throw new Error(`unknown handwriting font: ${key}`);
  return f;
}

export const STANDARD_FONTS: ReadonlyArray<StandardFontKey> = [
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Times-BoldItalic",
  "Courier",
  "Courier-Bold",
  "Courier-Oblique",
  "Courier-BoldOblique",
];

export type StandardFamily = "Helvetica" | "Times" | "Courier";

/** Compose a standard font key from its family and weight/slant flags. */
export function standardFontKey(
  family: StandardFamily,
  bold: boolean,
  italic: boolean,
): StandardFontKey {
  if (family === "Times") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }
  const base: "Helvetica" | "Courier" = family;
  if (bold && italic) return `${base}-BoldOblique`;
  if (bold) return `${base}-Bold`;
  if (italic) return `${base}-Oblique`;
  return base;
}

/** How a font key renders on screen (CSS), mirroring the exported look. */
export function fontCss(key: FontKey): {
  fontFamily: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
} {
  if (isHandwritingFont(key)) {
    return {
      fontFamily: `"${handwritingFont(key).cssFamily}", cursive`,
      fontWeight: "normal",
      fontStyle: "normal",
    };
  }
  const fontFamily = key.startsWith("Times")
    ? "serif"
    : key.startsWith("Courier")
      ? "monospace"
      : "sans-serif";
  return {
    fontFamily,
    fontWeight: key.includes("Bold") ? "bold" : "normal",
    fontStyle: key.includes("Italic") || key.includes("Oblique") ? "italic" : "normal",
  };
}
