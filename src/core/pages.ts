// Page-plan reconstruction.
//
// The editor stores the final page order as a PageEntry[]. When that plan is
// the identity (every page is the original, in order), we mutate the loaded
// document in place — this preserves the interactive AcroForm, which
// copyPages() does NOT carry over. Only when pages are reordered, inserted,
// deleted or imported do we rebuild a fresh document via copyPages.

import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import type { PDFPage } from "@cantoo/pdf-lib";
import type { PageEntry } from "./types";

/** True when the plan is exactly the original pages in their original order. */
export function isIdentityPlan(
  pages: PageEntry[],
  originalPageCount: number,
): boolean {
  if (pages.length !== originalPageCount) return false;
  return pages.every(
    (p, i) => p.source.kind === "original" && p.source.index === i,
  );
}

/** Apply each entry's absolute rotation to the matching page in order. */
export function applyRotations(docPages: PDFPage[], pages: PageEntry[]): void {
  pages.forEach((entry, i) => {
    const page = docPages[i];
    if (page) page.setRotation(degrees(entry.rotation));
  });
}

/**
 * Build a fresh document from the plan. Blank pages are created at their given
 * size; original/imported pages are copied from their source document.
 * `importedDocs` maps a docId to its already-loaded PDFDocument.
 */
export async function buildFinalDocument(
  originalDoc: PDFDocument,
  pages: PageEntry[],
  importedDocs: Map<string, PDFDocument>,
): Promise<PDFDocument> {
  const out = await PDFDocument.create();

  for (const entry of pages) {
    const src = entry.source;
    if (src.kind === "blank") {
      out.addPage([src.width, src.height]);
    } else if (src.kind === "original") {
      const [copied] = await out.copyPages(originalDoc, [src.index]);
      if (copied) out.addPage(copied);
    } else {
      const srcDoc = importedDocs.get(src.docId);
      if (!srcDoc) {
        throw new Error(
          `buildFinalDocument: missing imported document ${src.docId}`,
        );
      }
      const [copied] = await out.copyPages(srcDoc, [src.index]);
      if (copied) out.addPage(copied);
    }
  }

  applyRotations(out.getPages(), pages);
  return out;
}
