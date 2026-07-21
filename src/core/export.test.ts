import { describe, it, expect } from "vitest";
import { PDFDocument, PDFDict, PDFName, PDFString } from "@cantoo/pdf-lib";
import { exportPdf } from "./export";
import type { EditorDoc } from "./types";

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

const identity: EditorDoc["pages"] = [
  { source: { kind: "original", index: 0 }, rotation: 0 },
];

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
    expect(linkUris(reloaded)).toContain(
      "mailto:kevin@custom-digital-services.com",
    );
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
    expect(reloaded.getForm().getTextField("nom").getText()).toBe(
      "Kevin Tomas",
    );
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
      pages: [
        { source: { kind: "blank", width: 300, height: 300 }, rotation: 0 },
      ],
      form: {},
      annotations: [],
    };
    const out = await exportPdf({ originalBytes: src, doc });
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getPages()[0]!.getSize()).toEqual({
      width: 300,
      height: 300,
    });
  });
});
