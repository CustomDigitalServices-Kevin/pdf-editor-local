import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { PDFDocument, PDFDict, PDFName, PDFString } from "@cantoo/pdf-lib";
import { readFileSync } from "node:fs";

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
