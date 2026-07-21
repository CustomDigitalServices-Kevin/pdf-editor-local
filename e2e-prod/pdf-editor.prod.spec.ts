import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { PDFDocument, PDFDict, PDFName, PDFString } from "@cantoo/pdf-lib";
import { readFileSync } from "node:fs";

const TOOL_PATH = "/outils/pdf-editor/";

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
  await page.getByTestId("overlay-0").click({ position: { x: 60, y: 60 } });
  await page.getByTestId("text-input").fill("E2E PROD");

  const b = await page.getByTestId("overlay-0").boundingBox();
  if (!b) throw new Error("overlay-0 has no bounding box");
  await page.getByTestId("tool-link").click();
  await page.mouse.move(b.x + 40, b.y + 120);
  await page.mouse.down();
  await page.mouse.move(b.x + 220, b.y + 160, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId("link-target").fill("https://www.custom-digital-services.com/outils/");

  const bytes = await exportBytes(page);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(2);
  expect(linkUris(doc)).toContain("https://www.custom-digital-services.com/outils/");
});
