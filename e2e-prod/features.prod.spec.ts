import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { PDFDocument } from "@cantoo/pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";

// Full feature sweep against the LIVE production deployment. Each test drives
// the real UI for ONE feature, exports the PDF, and verifies the output.
// Read-only for the server (the editor is 100% client-side).

const TOOL_PATH = "/outils/pdf-editor/";

// 1x1 red PNG, enough to prove image embedding end to end.
const RED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function twoPagePdf(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  d.addPage([500, 700]);
  d.addPage([400, 600]);
  return d.save();
}

type PageAnalysis = {
  text: string;
  paths: number;
  images: number;
  links: string[];
};

async function analyze(bytes: Uint8Array, pageNumber = 1): Promise<PageAnalysis> {
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const page = await doc.getPage(pageNumber);
  const ops = await page.getOperatorList();
  const OPS = pdfjs.OPS;
  const count = (code: number) => ops.fnArray.filter((fn) => fn === code).length;
  const tc = await page.getTextContent();
  const annots = await page.getAnnotations();
  return {
    text: tc.items.map((i) => ("str" in i ? i.str : "")).join(""),
    paths: count(OPS.constructPath),
    images: count(OPS.paintImageXObject) + count(OPS.paintInlineImageXObject),
    links: annots
      .filter((a: { subtype?: string }) => a.subtype === "Link")
      .map((a: { url?: string }) => a.url ?? "")
      .filter(Boolean),
  };
}

async function loadFixture(page: Page): Promise<void> {
  const bytes = await twoPagePdf();
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
  return new Uint8Array(readFileSync(await download.path()));
}

async function placeAt(page: Page, tool: string, x = 200, y = 200): Promise<void> {
  await page.getByTestId(`tool-${tool}`).click();
  await page.getByTestId("overlay-0").click({ position: { x, y } });
}

async function dragTool(page: Page, tool: string): Promise<void> {
  await page.getByTestId(`tool-${tool}`).click();
  const b = await page.getByTestId("overlay-0").boundingBox();
  if (!b) throw new Error("no overlay bbox");
  await page.mouse.move(b.x + 130, b.y + 140);
  await page.mouse.down();
  await page.mouse.move(b.x + 300, b.y + 150, { steps: 4 });
  await page.mouse.move(b.x + 320, b.y + 280, { steps: 4 });
  await page.mouse.up();
}

test("01 load + render two pages", async ({ page }) => {
  await loadFixture(page);
  await expect(page.getByTestId("overlay-1")).toBeVisible();
});

test("02 text (inline edit) is baked", async ({ page }) => {
  await loadFixture(page);
  await placeAt(page, "text");
  const editable = page.getByTestId("text-edit");
  await editable.waitFor();
  await editable.pressSequentially("FEATURETEXT");
  await page.keyboard.press("Escape");
  const a = await analyze(await exportBytes(page));
  expect(a.text).toContain("FEATURETEXT");
});

test("03 rectangle is drawn", async ({ page }) => {
  await loadFixture(page);
  await placeAt(page, "rect");
  expect((await analyze(await exportBytes(page))).paths).toBeGreaterThan(0);
});

test("04 ellipse is drawn", async ({ page }) => {
  await loadFixture(page);
  await placeAt(page, "ellipse");
  expect((await analyze(await exportBytes(page))).paths).toBeGreaterThan(0);
});

test("05 line is drawn", async ({ page }) => {
  await loadFixture(page);
  await dragTool(page, "line");
  expect((await analyze(await exportBytes(page))).paths).toBeGreaterThan(0);
});

test("06 arrow is drawn (shaft + head)", async ({ page }) => {
  await loadFixture(page);
  await dragTool(page, "arrow");
  expect((await analyze(await exportBytes(page))).paths).toBeGreaterThanOrEqual(2);
});

test("07 freehand ink is drawn", async ({ page }) => {
  await loadFixture(page);
  await dragTool(page, "ink");
  expect((await analyze(await exportBytes(page))).paths).toBeGreaterThan(0);
});

test("08 highlight is drawn", async ({ page }) => {
  await loadFixture(page);
  await placeAt(page, "highlight");
  expect((await analyze(await exportBytes(page))).paths).toBeGreaterThan(0);
});

test("09 underline is drawn", async ({ page }) => {
  await loadFixture(page);
  await placeAt(page, "underline");
  expect((await analyze(await exportBytes(page))).paths).toBeGreaterThan(0);
});

test("10 strikethrough is drawn", async ({ page }) => {
  await loadFixture(page);
  await placeAt(page, "strike");
  expect((await analyze(await exportBytes(page))).paths).toBeGreaterThan(0);
});

test("11 whiteout is drawn", async ({ page }) => {
  await loadFixture(page);
  await placeAt(page, "whiteout");
  expect((await analyze(await exportBytes(page))).paths).toBeGreaterThan(0);
});

test("12 image import is embedded", async ({ page }) => {
  await loadFixture(page);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("tool-image").click(),
  ]);
  await chooser.setFiles({ name: "img.png", mimeType: "image/png", buffer: RED_PNG });
  await page.locator(".ghost").first().waitFor({ state: "attached" });
  await page.getByTestId("overlay-0").click({ position: { x: 200, y: 200 } });
  expect((await analyze(await exportBytes(page))).images).toBeGreaterThan(0);
});

test("13 signature (drawn) is embedded", async ({ page }) => {
  await loadFixture(page);
  await page.getByTestId("tool-signature").click();
  const sc = page.getByTestId("sign-canvas");
  const b = await sc.boundingBox();
  if (!b) throw new Error("no sign canvas");
  await page.mouse.move(b.x + 20, b.y + 60);
  await page.mouse.down();
  await page.mouse.move(b.x + 120, b.y + 90, { steps: 5 });
  await page.mouse.move(b.x + 240, b.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.getByTestId("sign-done").click();
  await page.locator(".ghost").first().waitFor({ state: "attached" });
  await page.getByTestId("overlay-0").click({ position: { x: 200, y: 260 } });
  expect((await analyze(await exportBytes(page))).images).toBeGreaterThan(0);
});

test("14 link URL is baked as a clickable annotation", async ({ page }) => {
  await loadFixture(page);
  await placeAt(page, "link", 200, 200);
  await page.getByTestId("link-target").fill("https://www.custom-digital-services.com/outils/");
  const a = await analyze(await exportBytes(page));
  expect(a.links.some((u) => u.includes("custom-digital-services.com/outils"))).toBe(true);
});

test("15 rotate page sets a 90 degree rotation", async ({ page }) => {
  await loadFixture(page);
  await page.getByTestId("rotate-0").click();
  const doc = await PDFDocument.load(await exportBytes(page));
  expect(doc.getPage(0).getRotation().angle).toBe(90);
});

test("16 delete page reduces the count", async ({ page }) => {
  await loadFixture(page);
  await page.getByTestId("del-page-1").click();
  const doc = await PDFDocument.load(await exportBytes(page));
  expect(doc.getPageCount()).toBe(1);
});

test("17 insert blank page increases the count", async ({ page }) => {
  await loadFixture(page);
  await page.getByTestId("insert-blank").click();
  const doc = await PDFDocument.load(await exportBytes(page));
  expect(doc.getPageCount()).toBe(3);
});

test("18 merge another PDF appends its pages", async ({ page }) => {
  await loadFixture(page);
  const extra = await twoPagePdf();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("merge-pdf").click(),
  ]);
  await chooser.setFiles({
    name: "extra.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(extra),
  });
  await expect(page.getByTestId("overlay-3")).toBeVisible();
  const doc = await PDFDocument.load(await exportBytes(page));
  expect(doc.getPageCount()).toBe(4);
});

test("19 elements list: add, appears, then delete removes it", async ({ page }) => {
  await loadFixture(page);
  await placeAt(page, "rect");
  // one element listed
  await expect(page.locator(".el-item")).toHaveCount(1);
  await page.locator('[data-testid^="el-del-"]').first().click();
  await expect(page.locator(".el-item")).toHaveCount(0);
  // and the export no longer contains the shape
  expect((await analyze(await exportBytes(page))).paths).toBe(0);
});

test("20 property edit: changing a rectangle colour still exports a shape", async ({ page }) => {
  await loadFixture(page);
  await placeAt(page, "rect");
  // selected rect expands its fields; change the stroke colour
  const colour = page.locator(".el-fields input[type='color']").first();
  await colour.waitFor();
  await colour.evaluate((el: HTMLInputElement) => {
    el.value = "#3366ff";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect((await analyze(await exportBytes(page))).paths).toBeGreaterThan(0);
});
