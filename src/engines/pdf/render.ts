// pdf.js rendering for the editor. The worker URL is resolved by Vite (?url)
// so it is bundled and served from 'self' under the strict CSP, and
// runtime-cached by the service worker for offline use (same setup as
// filigrane-local / convertisseur-local).

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDoc = pdfjsLib.PDFDocumentProxy;

/**
 * Load a PDF. pdfjs detaches (transfers) the input buffer, so we hand it a
 * copy: the original bytes are still needed by the export path.
 */
export async function loadPdf(bytes: Uint8Array): Promise<PdfDoc> {
  const data = bytes.slice();
  return pdfjsLib.getDocument({ data }).promise;
}

export type PageInfo = {
  /** unrotated media-box width in PDF points */
  mediaWidth: number;
  /** unrotated media-box height in PDF points */
  mediaHeight: number;
  /** the page's intrinsic /Rotate, degrees */
  intrinsicRotation: number;
};

export async function getPageInfo(doc: PdfDoc, pageNumber: number): Promise<PageInfo> {
  const page = await doc.getPage(pageNumber);
  const view = page.view;
  const x0 = view[0] ?? 0;
  const y0 = view[1] ?? 0;
  const x1 = view[2] ?? 0;
  const y1 = view[3] ?? 0;
  return {
    mediaWidth: x1 - x0,
    mediaHeight: y1 - y0,
    intrinsicRotation: page.rotate,
  };
}

export type RenderedSize = { widthPx: number; heightPx: number };

/**
 * Render a page into `canvas` at `scale`, forcing an absolute `rotation`
 * (0/90/180/270). Returns the produced pixel size so the overlay can match it.
 */
export async function renderPage(
  doc: PdfDoc,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number,
  rotation: number,
): Promise<RenderedSize> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale, rotation });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { widthPx: canvas.width, heightPx: canvas.height };
}
