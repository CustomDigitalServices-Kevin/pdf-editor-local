// Clickable link annotations.
//
// pdf-lib (and the @cantoo fork) has no high-level API to add a /Link
// annotation, so we build the low-level object graph by hand:
//   << /Type /Annot /Subtype /Link /Rect [..] /Border [0 0 0] /A << /S /URI ... >> >>
// register it in the document context and attach its ref to the page's /Annots.
//
// context.obj() converts a JS object literal into a PDFDict where string VALUES
// become PDFName. That is what we want for /Type, /Subtype, /S — but a URL is a
// text string, so it must be wrapped explicitly with PDFString.of(), otherwise
// it would be emitted as a name and break the link.

import { PDFString } from "@cantoo/pdf-lib";
import type { PDFContext, PDFPage, PDFRef, PDFObject } from "@cantoo/pdf-lib";
import type { LinkTarget } from "./types";

/** A rectangle in PDF space: bottom-left corner plus size (points). */
export type PdfRect = { x: number; y: number; width: number; height: number };

/**
 * Build (but do not register) the /Link annotation object for a target.
 *
 * For an internal "page" target, `pageRef` MUST be the PDFRef of the
 * destination page in the FINAL document; it is required and asserted.
 */
export function buildLinkAnnotation(
  context: PDFContext,
  rect: PdfRect,
  target: LinkTarget,
  pageRef?: PDFRef,
): PDFObject {
  const Rect = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
  const Border = [0, 0, 0];

  if (target.kind === "url") {
    return context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect,
      Border,
      A: { Type: "Action", S: "URI", URI: PDFString.of(target.value) },
    });
  }

  if (target.kind === "email") {
    return context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect,
      Border,
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of(`mailto:${target.value}`),
      },
    });
  }

  if (!pageRef) {
    throw new Error(
      "buildLinkAnnotation: a page target requires the destination pageRef",
    );
  }
  // [ pageRef /Fit ] — open the destination page fit to the window.
  return context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect,
    Border,
    Dest: [pageRef, "Fit"],
  });
}

/**
 * Register a link annotation and attach it to the page's /Annots array,
 * creating that array if the page had none.
 */
export function attachLink(
  page: PDFPage,
  rect: PdfRect,
  target: LinkTarget,
  pageRef?: PDFRef,
): void {
  const context = page.doc.context;
  const annotation = buildLinkAnnotation(context, rect, target, pageRef);
  const ref = context.register(annotation);
  // addAnnot creates the /Annots array if the page had none.
  page.node.addAnnot(ref);
}
