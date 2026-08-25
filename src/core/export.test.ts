import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFString,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";
import type { PDFPage } from "@cantoo/pdf-lib";
import { exportPdf } from "./export";
import { handwritingFont } from "./fonts";
import type { EditorDoc, HandwritingFontKey, TextAnnot } from "./types";

/** Node-side font loader: reads the bundled TTF from src/fonts. */
async function loadFontBytes(key: HandwritingFontKey): Promise<Uint8Array> {
  const buf = await readFile(resolve(process.cwd(), "src/fonts", handwritingFont(key).file));
  return new Uint8Array(buf);
}

/** Decoded content streams of a page, concatenated. */
function pageContent(doc: PDFDocument, page: PDFPage): string {
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  let text = "";
  for (const ref of refs) {
    const stream = doc.context.lookup(ref);
    if (stream instanceof PDFRawStream) {
      text += new TextDecoder("latin1").decode(decodePDFRawStream(stream).decode());
    }
  }
  return text;
}

/**
 * BaseFont names of the DISTINCT font objects referenced by the pages (pdf-lib
 * registers one resource key per drawText call, all pointing at the same
 * embedded font object).
 */
function baseFonts(doc: PDFDocument): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const page of doc.getPages()) {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (!fonts) continue;
    for (const [, ref] of fonts.entries()) {
      if (seen.has(ref.toString())) continue;
      seen.add(ref.toString());
      const dict = doc.context.lookupMaybe(ref, PDFDict);
      const base = dict?.get(PDFName.of("BaseFont"));
      if (base) names.push(base.toString());
    }
  }
  return names;
}

function textAnnot(overrides: Partial<TextAnnot>): TextAnnot {
  return {
    id: "t",
    type: "text",
    page: 0,
    x: 50,
    y: 50,
    w: 300,
    h: 40,
    rotation: 0,
    text: "Écrit à la main",
    fontFamily: "Helvetica",
    fontSize: 18,
    color: { r: 0, g: 0, b: 0 },
    align: "left",
    background: null,
    ...overrides,
  };
}

async function onePagePdf(w = 600, h = 800): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.addPage([w, h]);
  return d.save();
}

async function twoPageSizedPdf(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.addPage([400, 400]); // page 0: square
  d.addPage([600, 800]); // page 1: portrait
  return d.save();
}

async function pdfWithTextField(name: string): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const page = d.addPage([600, 800]);
  const form = d.getForm();
  const tf = form.createTextField(name);
  tf.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
  return d.save();
}

function linkUris(doc: PDFDocument): string[] {
  const uris: string[] = [];
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const dict = annots.lookup(i, PDFDict);
      const subtype = dict.get(PDFName.of("Subtype"));
      if (!subtype || subtype.toString() !== "/Link") continue;
      const action = dict.lookupMaybe(PDFName.of("A"), PDFDict);
      const uri = action?.lookupMaybe(PDFName.of("URI"), PDFString);
      if (uri) uris.push(uri.decodeText());
    }
  }
  return uris;
}

const identity: EditorDoc["pages"] = [{ source: { kind: "original", index: 0 }, rotation: 0 }];

describe("exportPdf — text fonts", () => {
  it("embeds a handwriting font as a subset with a deterministic BaseFont", async () => {
    const src = await onePagePdf();
    const doc: EditorDoc = {
      pages: identity,
      form: {},
      annotations: [textAnnot({ fontFamily: "Sacramento", text: "Kévin, à bientôt" })],
    };
    const out = await exportPdf({ originalBytes: src, doc, loadFontBytes });
    const reloaded = await PDFDocument.load(out);
    const fonts = baseFonts(reloaded);
    // customName is used verbatim as the BaseFont (pdf-lib CustomFontEmbedder).
    expect(fonts).toContain("/Sacramento");
    // Subset: far smaller than the 80 KB TTF.
    expect(out.length).toBeLessThan(40_000);
  });

  it("embeds each handwriting font only once and keeps standard fonts unembedded", async () => {
    const src = await onePagePdf();
    const doc: EditorDoc = {
      pages: identity,
      form: {},
      annotations: [
        textAnnot({ id: "a", fontFamily: "PatrickHand" }),
        textAnnot({ id: "b", fontFamily: "PatrickHand", y: 120 }),
        textAnnot({ id: "c", fontFamily: "Times-Bold", y: 200 }),
      ],
    };
    const out = await exportPdf({ originalBytes: src, doc, loadFontBytes });
    const fonts = baseFonts(await PDFDocument.load(out));
    expect(fonts.filter((n) => n === "/PatrickHand")).toHaveLength(1);
    expect(fonts).toContain("/Times-Bold");
  });

  it("fails loudly when a handwriting font is used without a loader", async () => {
    const src = await onePagePdf();
    const doc: EditorDoc = {
      pages: identity,
      form: {},
      annotations: [textAnnot({ fontFamily: "Handlee" })],
    };
    await expect(exportPdf({ originalBytes: src, doc })).rejects.toThrow(/loadFontBytes/);
  });

  it("paints the background fill under the text when set", async () => {
    const src = await onePagePdf();
    const doc: EditorDoc = {
      pages: identity,
      form: {},
      annotations: [textAnnot({ background: { r: 1, g: 1, b: 1 } })],
    };
    const out = await exportPdf({ originalBytes: src, doc });
    const reloaded = await PDFDocument.load(out);
    const page = reloaded.getPages()[0];
    if (!page) throw new Error("no page");
    // pdf-lib draws the rectangle as a closed filled path (m/l/h/f) in white
    // (1 1 1 rg), emitted BEFORE the text object (BT).
    const text = pageContent(reloaded, page);
    expect(text).toMatch(/1 1 1 rg[\s\S]*?\bh\nf\b/);
    expect(text.indexOf("1 1 1 rg")).toBeLessThan(text.indexOf("BT"));
  });
});

describe("exportPdf — identity plan", () => {
  it("produces a valid, loadable PDF with the same page count", async () => {
    const src = await onePagePdf();
    const doc: EditorDoc = {
      pages: identity,
      form: {},
      annotations: [
        {
          id: "t1",
          type: "text",
          page: 0,
          x: 50,
          y: 50,
          w: 300,
          h: 40,
          rotation: 0,
          text: "Bonjour à toi, éditeur PDF",
          fontFamily: "Helvetica",
          fontSize: 18,
          color: { r: 0, g: 0, b: 0 },
          align: "left",
          background: null,
        },
        {
          id: "r1",
          type: "rect",
          page: 0,
          x: 40,
          y: 120,
          w: 200,
          h: 80,
          rotation: 0,
          stroke: { r: 0, g: 0, b: 1 },
          strokeWidth: 2,
          fill: null,
          opacity: 1,
        },
      ],
    };
    const out = await exportPdf({ originalBytes: src, doc });
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("bakes a clickable URL link annotation with the exact URI", async () => {
    const src = await onePagePdf();
    const doc: EditorDoc = {
      pages: identity,
      form: {},
      annotations: [
        {
          id: "l1",
          type: "link",
          page: 0,
          x: 50,
          y: 50,
          w: 120,
          h: 20,
          target: { kind: "url", value: "https://custom-digital-services.com" },
        },
      ],
    };
    const out = await exportPdf({ originalBytes: src, doc });
    const reloaded = await PDFDocument.load(out);
    expect(linkUris(reloaded)).toContain("https://custom-digital-services.com");
  });

  it("turns an email link into a mailto URI", async () => {
    const src = await onePagePdf();
    const doc: EditorDoc = {
      pages: identity,
      form: {},
      annotations: [
        {
          id: "l2",
          type: "link",
          page: 0,
          x: 10,
          y: 10,
          w: 80,
          h: 16,
          target: { kind: "email", value: "kevin@custom-digital-services.com" },
        },
      ],
    };
    const out = await exportPdf({ originalBytes: src, doc });
    const reloaded = await PDFDocument.load(out);
    expect(linkUris(reloaded)).toContain("mailto:kevin@custom-digital-services.com");
  });

  it("fills an existing text field and keeps it readable (interactive)", async () => {
    const src = await pdfWithTextField("nom");
    const doc: EditorDoc = {
      pages: identity,
      form: { nom: "Kevin Tomas" },
      annotations: [],
    };
    const out = await exportPdf({ originalBytes: src, doc });
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getForm().getTextField("nom").getText()).toBe("Kevin Tomas");
  });
});

describe("exportPdf — changed plan", () => {
  it("reorders pages (reversed) by rebuilding the document", async () => {
    const src = await twoPageSizedPdf(); // [400x400, 600x800]
    const doc: EditorDoc = {
      pages: [
        { source: { kind: "original", index: 1 }, rotation: 0 },
        { source: { kind: "original", index: 0 }, rotation: 0 },
      ],
      form: {},
      annotations: [],
    };
    const out = await exportPdf({ originalBytes: src, doc });
    const reloaded = await PDFDocument.load(out);
    const sizes = reloaded.getPages().map((p) => p.getSize());
    expect(sizes[0]).toEqual({ width: 600, height: 800 });
    expect(sizes[1]).toEqual({ width: 400, height: 400 });
  });

  it("inserts a blank page and deletes one (1 original -> blank only)", async () => {
    const src = await onePagePdf(500, 500);
    const doc: EditorDoc = {
      pages: [{ source: { kind: "blank", width: 300, height: 300 }, rotation: 0 }],
      form: {},
      annotations: [],
    };
    const out = await exportPdf({ originalBytes: src, doc });
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
    const [only] = reloaded.getPages();
    expect(only?.getSize()).toEqual({
      width: 300,
      height: 300,
    });
  });
});
