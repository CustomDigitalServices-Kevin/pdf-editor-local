import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFString,
  PDFArray,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
  rgb,
} from "@cantoo/pdf-lib";
import { readFileSync } from "node:fs";

/** BaseFont names of every font resource on every page. */
function baseFonts(doc: PDFDocument): string[] {
  const names: string[] = [];
  for (const page of doc.getPages()) {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (!fonts) continue;
    for (const [, ref] of fonts.entries()) {
      const base = doc.context.lookupMaybe(ref, PDFDict)?.get(PDFName.of("BaseFont"));
      if (base) names.push(base.toString());
    }
  }
  return names;
}

/** Decoded content streams of the first page, concatenated. */
function firstPageContent(doc: PDFDocument): string {
  const page = doc.getPages()[0];
  if (!page) return "";
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

// A "paper form" fixture (500 x 700): a Helvetica label followed by a dotted
// zone, and a bold red Times title further down. Positions are in PDF points
// (y up); the tests convert to view pixels through the overlay's scale.
const FORM = {
  label: "Nom : ",
  dots: "..........",
  labelX: 50,
  labelY: 600,
  labelSize: 14,
  titleX: 50,
  titleY: 500,
  titleSize: 18,
};
async function makeFormFixture(): Promise<{
  bytes: Uint8Array;
  labelWidth: number;
  lineWidth: number;
}> {
  const d = await PDFDocument.create();
  const page = d.addPage([500, 700]);
  const helv = await d.embedFont(StandardFonts.Helvetica);
  const timesBold = await d.embedFont(StandardFonts.TimesRomanBold);
  page.drawText(FORM.label + FORM.dots, {
    x: FORM.labelX,
    y: FORM.labelY,
    size: FORM.labelSize,
    font: helv,
  });
  page.drawText("Titre", {
    x: FORM.titleX,
    y: FORM.titleY,
    size: FORM.titleSize,
    font: timesBold,
    color: rgb(0.8, 0.1, 0.1),
  });
  return {
    bytes: await d.save(),
    labelWidth: helv.widthOfTextAtSize(FORM.label, FORM.labelSize),
    lineWidth: helv.widthOfTextAtSize(FORM.label + FORM.dots, FORM.labelSize),
  };
}

async function loadFormFixture(
  page: Page,
): Promise<{ scale: number; labelWidth: number; lineWidth: number }> {
  const fx = await makeFormFixture();
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "form.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(fx.bytes),
  });
  const overlay = page.getByTestId("overlay-0");
  await expect(overlay).toHaveAttribute("data-probe", "ready");
  const box = await overlay.boundingBox();
  if (!box) throw new Error("overlay not laid out");
  return { scale: box.width / 500, labelWidth: fx.labelWidth, lineWidth: fx.lineWidth };
}

// A two-page fixture with distinct sizes so page operations are observable.
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
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "sample.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByTestId("overlay-0")).toBeVisible();
  // Wait until pdf.js has rendered (overlay gets a real size).
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

test("loads a PDF and renders every page", async ({ page }) => {
  await loadFixture(page);
  await expect(page.getByTestId("overlay-0")).toBeVisible();
  await expect(page.getByTestId("overlay-1")).toBeVisible();
});

test("adds a text box, edits it inline, and exports a valid PDF", async ({ page }) => {
  await loadFixture(page);
  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-0").click({ position: { x: 200, y: 180 } });
  // The new text box opens straight into inline editing (contentEditable focused).
  const editable = page.getByTestId("text-edit");
  await editable.waitFor();
  await editable.pressSequentially("E2E BONJOUR");
  await page.keyboard.press("Escape"); // commit
  const bytes = await exportBytes(page);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(2);
});

test("places a link (click-to-place) and bakes its URI into the exported PDF", async ({ page }) => {
  await loadFixture(page);
  await page.getByTestId("tool-link").click();
  await page.getByTestId("overlay-0").click({ position: { x: 80, y: 80 } });
  await page.getByTestId("link-target").fill("https://custom-digital-services.com/edited");

  const bytes = await exportBytes(page);
  const doc = await PDFDocument.load(bytes);
  expect(linkUris(doc)).toContain("https://custom-digital-services.com/edited");
});

test("deletes a page and exports fewer pages", async ({ page }) => {
  await loadFixture(page);
  await page.getByTestId("del-page-1").click();
  const bytes = await exportBytes(page);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
});

test("merges another PDF and exports the combined page count", async ({ page }) => {
  await loadFixture(page); // fixture = 2 pages
  const extra = await makeFixture(); // + 2 pages
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("merge-pdf").click(),
  ]);
  await chooser.setFiles({
    name: "extra.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(extra),
  });
  // wait until the 4th page overlay appears
  await expect(page.getByTestId("overlay-3")).toBeVisible();
  const bytes = await exportBytes(page);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(4);
});

test("Backspace edits the text; Delete removes the selected box; Backspace never does", async ({
  page,
}) => {
  await loadFixture(page);
  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-0").click({ position: { x: 200, y: 180 } });
  const editable = page.getByTestId("text-edit");
  await editable.waitFor();
  await editable.pressSequentially("ABC");
  await page.keyboard.press("Backspace");
  await expect(editable).toHaveText("AB");
  const boxes = page.locator("[data-annot]");
  await expect(boxes).toHaveCount(1);
  await page.keyboard.press("Escape"); // commit
  await expect(boxes).toHaveText("AB");
  // Backspace outside editing is a no-op on the (still selected) element.
  await page.keyboard.press("Backspace");
  await expect(boxes).toHaveCount(1);
  // Delete removes it.
  await page.keyboard.press("Delete");
  await expect(boxes).toHaveCount(0);
});

test("handwriting font: picked in the gallery, embedded in the export, sticky for the next box", async ({
  page,
}) => {
  await loadFixture(page);
  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-0").click({ position: { x: 200, y: 180 } });
  const editable = page.getByTestId("text-edit");
  await editable.waitFor();
  await editable.pressSequentially("Kévin, à bientôt");
  await page.keyboard.press("Escape");
  await page.getByTestId("handwriting-toggle").check();
  await page.getByTestId("font-Sacramento").click();
  await expect(page.getByTestId("font-Sacramento")).toHaveAttribute("aria-selected", "true");
  // The face is registered on screen once its TTF is fetched (CSP: self).
  await page.waitForFunction(() =>
    Array.from(document.fonts).some((f) => f.family === "Sacramento" && f.status === "loaded"),
  );
  const bytes = await exportBytes(page);
  const doc = await PDFDocument.load(bytes);
  expect(baseFonts(doc)).toContain("/Sacramento");
  // Session preference: the next text box starts handwritten.
  await page.getByTestId("tool-text").click();
  await page.getByTestId("overlay-0").click({ position: { x: 200, y: 320 } });
  await page.getByTestId("text-edit").waitFor();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-annot]")).toHaveCount(2);
  await expect(page.getByTestId("handwriting-toggle")).toBeChecked();
  await expect(page.getByTestId("font-Sacramento")).toHaveAttribute("aria-selected", "true");
});

test("dotted zone: the text box snaps onto the dots, hides them and exports the typed text", async ({
  page,
}) => {
  const { scale, labelWidth, lineWidth } = await loadFormFixture(page);
  await page.getByTestId("tool-text").click();
  const baselineView = 700 - FORM.labelY; // view space is y-down
  const dotsMidX = FORM.labelX + labelWidth + (lineWidth - labelWidth) / 2;
  await page
    .getByTestId("overlay-0")
    .click({ position: { x: dotsMidX * scale, y: (baselineView - 4) * scale } });
  const editable = page.getByTestId("text-edit");
  await editable.waitFor();
  const box = page.locator("[data-annot]");
  await expect(box).toHaveCount(1);
  const overlay = await page.getByTestId("overlay-0").boundingBox();
  const b = await box.boundingBox();
  if (!overlay || !b) throw new Error("boxes not laid out");
  const left = (b.x - overlay.x) / scale;
  const right = (b.x + b.width - overlay.x) / scale;
  // Starts where the dots start (after the label), ends where the line ends.
  expect(left).toBeGreaterThan(FORM.labelX + labelWidth - 5);
  expect(left).toBeLessThan(FORM.labelX + labelWidth + 8);
  expect(Math.abs(right - (FORM.labelX + lineWidth))).toBeLessThan(8);
  await expect(page.getByTestId("text-background")).toBeChecked();
  // Style copied from the label next to the dots.
  await expect(page.getByTestId("font-select")).toHaveValue("Helvetica");
  await expect(page.getByTestId("font-size")).toHaveValue(String(FORM.labelSize));
  await editable.pressSequentially("Kevin");
  await page.keyboard.press("Escape");
  const doc = await PDFDocument.load(await exportBytes(page));
  const content = firstPageContent(doc);
  expect(content).toContain("1 1 1 rg"); // white fill under the text
  expect(content.toUpperCase()).toContain("4B6576696E"); // "Kevin", hex-encoded
});

test("style detection: a box placed near a bold red Times title copies font, size and colour", async ({
  page,
}) => {
  const { scale } = await loadFormFixture(page);
  await page.getByTestId("tool-text").click();
  const baselineView = 700 - FORM.titleY;
  await page
    .getByTestId("overlay-0")
    .click({ position: { x: (FORM.titleX + 70) * scale, y: (baselineView - 6) * scale } });
  await page.getByTestId("text-edit").waitFor();
  await expect(page.getByTestId("font-select")).toHaveValue("Times-Bold");
  await expect(page.getByTestId("font-size")).toHaveValue(String(FORM.titleSize));
  const hex = await page.locator(".el-fields input[type=color]").first().inputValue();
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  expect(r).toBeGreaterThan(150);
  expect(g).toBeLessThan(90);
});
