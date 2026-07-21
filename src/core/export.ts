// Export orchestrator: turn an EditorDoc into final PDF bytes, 100% client-side.
//
// Two paths:
//   - identity plan  -> mutate the loaded document (keeps the interactive
//     AcroForm; no flatten, so advisor's checkbox/radio flatten bugs never bite)
//   - changed plan   -> rebuild via copyPages; if a form was filled, flatten it
//     first so the values survive as page content.

import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import type { PDFDocument as PDFDoc, PDFFont, PDFImage } from "@cantoo/pdf-lib";
import type {
  EditorDoc,
  Annotation,
  PageGeometry,
  StandardFontKey,
  ImageAnnot,
} from "./types";
import { isIdentityPlan, buildFinalDocument, applyRotations } from "./pages";
import { fillForm } from "./forms";
import { attachLink } from "./links";
import { rectOverlayToPdf } from "./coords";
import {
  bakeShape,
  bakeLine,
  bakeInk,
  bakeMarkup,
  bakeWhiteout,
  bakeImage,
  bakeText,
} from "./annotations/bake";

const FONT_MAP: Record<StandardFontKey, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  "Helvetica-Bold": StandardFonts.HelveticaBold,
  "Helvetica-Oblique": StandardFonts.HelveticaOblique,
  "Helvetica-BoldOblique": StandardFonts.HelveticaBoldOblique,
  "Times-Roman": StandardFonts.TimesRoman,
  "Times-Bold": StandardFonts.TimesRomanBold,
  "Times-Italic": StandardFonts.TimesRomanItalic,
  "Times-BoldItalic": StandardFonts.TimesRomanBoldItalic,
  Courier: StandardFonts.Courier,
  "Courier-Bold": StandardFonts.CourierBold,
  "Courier-Oblique": StandardFonts.CourierOblique,
  "Courier-BoldOblique": StandardFonts.CourierBoldOblique,
};

export type ExportInput = {
  originalBytes: Uint8Array;
  doc: EditorDoc;
  /** docId -> raw bytes, for pages imported from other PDFs. */
  importedBytes?: Map<string, Uint8Array>;
};

export async function exportPdf(input: ExportInput): Promise<Uint8Array> {
  const { doc } = input;
  const original = await PDFDocument.load(input.originalBytes);
  const identity = isIdentityPlan(doc.pages, original.getPageCount());
  const hasForm = Object.keys(doc.form).length > 0;

  let target: PDFDoc;
  if (identity) {
    target = original;
    fillForm(target, doc.form);
    applyRotations(target.getPages(), doc.pages);
  } else {
    if (hasForm) {
      fillForm(original, doc.form);
      try {
        original.getForm().flatten();
      } catch {
        // Flatten can throw on some checkbox/radio layouts (advisor); the
        // filled text fields still survive, so we continue rather than abort.
      }
    }
    const importedDocs = new Map<string, PDFDoc>();
    for (const [id, bytes] of input.importedBytes ??
      new Map<string, Uint8Array>()) {
      importedDocs.set(id, await PDFDocument.load(bytes));
    }
    target = await buildFinalDocument(original, doc.pages, importedDocs);
  }

  const pages = target.getPages();

  const fontCache = new Map<StandardFontKey, PDFFont>();
  const getFont = async (key: StandardFontKey): Promise<PDFFont> => {
    const cached = fontCache.get(key);
    if (cached) return cached;
    const font = await target.embedFont(FONT_MAP[key]);
    fontCache.set(key, font);
    return font;
  };

  const imageCache = new Map<string, PDFImage>();
  const getImage = async (a: ImageAnnot): Promise<PDFImage> => {
    const cached = imageCache.get(a.id);
    if (cached) return cached;
    const img =
      a.mime === "image/png"
        ? await target.embedPng(a.bytes)
        : await target.embedJpg(a.bytes);
    imageCache.set(a.id, img);
    return img;
  };

  const geomFor = (pageIndex: number): PageGeometry | null => {
    const page = pages[pageIndex];
    if (!page) return null;
    const size = page.getSize();
    const angle = page.getRotation().angle;
    const rotation = (((angle % 360) + 360) % 360) as PageGeometry["rotation"];
    return { widthPt: size.width, heightPt: size.height, scale: 1, rotation };
  };

  for (const a of doc.annotations) {
    const page = pages[a.page];
    const geom = geomFor(a.page);
    if (!page || !geom) continue; // annotation on a deleted page: skip
    await bakeAnnotation(page, a, geom, getFont, getImage, pages);
  }

  return target.save();
}

async function bakeAnnotation(
  page: import("@cantoo/pdf-lib").PDFPage,
  a: Annotation,
  geom: PageGeometry,
  getFont: (key: StandardFontKey) => Promise<PDFFont>,
  getImage: (a: ImageAnnot) => Promise<PDFImage>,
  pages: import("@cantoo/pdf-lib").PDFPage[],
): Promise<void> {
  switch (a.type) {
    case "rect":
    case "ellipse":
      bakeShape(page, a, geom);
      break;
    case "line":
    case "arrow":
      bakeLine(page, a, geom);
      break;
    case "ink":
      bakeInk(page, a, geom);
      break;
    case "highlight":
    case "underline":
    case "strike":
      bakeMarkup(page, a, geom);
      break;
    case "whiteout":
      bakeWhiteout(page, a, geom);
      break;
    case "image":
    case "signature":
      bakeImage(page, a, geom, await getImage(a));
      break;
    case "text":
      bakeText(page, a, geom, await getFont(a.fontFamily));
      break;
    case "link": {
      const rect = rectOverlayToPdf(a, geom);
      const destRef =
        a.target.kind === "page" ? pages[a.target.value]?.ref : undefined;
      attachLink(page, rect, a.target, destRef);
      break;
    }
  }
}
