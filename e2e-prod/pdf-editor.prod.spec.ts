import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { PDFDocument, PDFDict, PDFName, PDFString } from "@cantoo/pdf-lib";
import { readFileSync } from "node:fs";

const TOOL_PATH = "/outils/pdf-editor/";

/** BaseFont names of the distinct font objects referenced by the pages. */
function baseFonts(doc: PDFDocument): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const page of doc.getPages()) {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (!fonts) continue;
    for (const [, ref] of fonts.entries()) {
      if (seen.has(ref.toString())) continue;
      seen.add(ref.toString());
      const base = doc.context.lookupMaybe(ref, PDFDict)?.get(PDFName.of("BaseFont"));
      if (base) names.push(base.toString());
    }
  }
  return names;
}

async function makeFixture(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.addPage([500, 700]);
  d.addPage([400, 600]);
  return d.save();
}

function linkUris(doc: PDFDocument): string[] {
  const uris: string[] = [];
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const dict = annots.lookup(i, PDFDict);
      if (dict.get(PDFName.of("Subtype"))?.toString() !== "/Link") continue;
      const action = dict.lookupMaybe(PDFName.of("A"), PDFDict);
      const uri = action?.lookupMaybe(PDFName.of("URI"), PDFString);
      if (uri) uris.push(uri.decodeText());
    }
  }
  return uris;
}

async function loadFixture(page: Page): Promise<void> {
  const bytes = await makeFixture();
  await page.goto(TOOL_PATH);
  await page.getByTestId("file-input").setInputFiles({
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByTestId("overlay-0")).toBeVisible();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="overlay-0"]');
    return !!el && el.getBoundingClientRect().width > 10;
  });
}

async function exportBytes(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-btn").click(),
  ]);
  const path = await download.path();
  return new Uint8Array(readFileSync(path));
}

test("PROD: the editor loads and renders a PDF", async ({ page }) => {
  await loadFixture(page);
  await expect(page.getByTestId("overlay-1")).toBeVisible();
});

test("PROD: annotate + export produces a valid PDF with the baked link", async ({ page }) => {
  await loadFixture(page);

  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-0").click({ position: { x: 200, y: 180 } });
  const editable = page.getByTestId("text-edit");
  await editable.waitFor();
  await editable.pressSequentially("E2E PROD");
  await page.keyboard.press("Escape");

  await page.getByTestId("tool-link").click();
  await page.getByTestId("overlay-0").click({ position: { x: 120, y: 150 } });
  await page.getByTestId("link-target").fill("https://www.custom-digital-services.com/outils/");

  const bytes = await exportBytes(page);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(2);
  expect(linkUris(doc)).toContain("https://www.custom-digital-services.com/outils/");
});

// Exercises the full handwriting path against the real CSP: fetch the TTF
// asset (connect-src 'self'), register a FontFace, then embed it with fontkit
// at export. This is the class of bug that only prod's CSP can surface.
test("PROD: a handwriting font is fetched, rendered and embedded on export", async ({ page }) => {
  await loadFixture(page);
  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-0").click({ position: { x: 200, y: 180 } });
  const editable = page.getByTestId("text-edit");
  await editable.waitFor();
  await editable.pressSequentially("Kévin à la main");
  await page.keyboard.press("Escape");

  await page.getByTestId("handwriting-toggle").check();
  await page.getByTestId("font-Sacramento").click();
  // The TTF is fetched under the strict CSP and its FontFace registers.
  await page.waitForFunction(() =>
    Array.from(document.fonts).some((f) => f.family === "Sacramento" && f.status === "loaded"),
  );

  const bytes = await exportBytes(page);
  const doc = await PDFDocument.load(bytes);
  expect(baseFonts(doc)).toContain("/Sacramento");
});
