# PDF editor local

Edit PDF files 100% in your browser. No upload, no server, GDPR-friendly by design: your files never leave your device.

Free tool by [Custom Digital Services](https://custom-digital-services.com). Replicates the editing features of online PDF editors (add text, shapes, images, highlights, drawings, signatures, fill forms, links, manage pages) without sending anything to a server.

## Features

- **Text** — add text boxes (standard PDF fonts, size, colour, alignment)
- **Shapes** — rectangle, ellipse, line, arrow
- **Images** — import PNG/JPEG, resize
- **Markup** — highlight, underline, strikethrough
- **Freehand** — pen drawing
- **Whiteout** — cover an area
- **Signatures** — draw a signature and place it
- **Forms** — fill existing AcroForm fields (engine; UI surfacing planned)
- **Links** — URL, email, internal page
- **Pages** — insert blank, delete, rotate, reorder

Bilingual UI (FR/EN), offline PWA, strict Content-Security-Policy (`connect-src 'self'` technically enforces the no-upload promise).

## Not in scope (v1)

- Editing text already present in the source PDF (extraction + re-layout is unreliable even in commercial tools)
- Creating new form fields (only filling existing ones)
- Secure redaction — whiteout hides visually but does not remove the underlying text (same behaviour as Sejda; stated in the UI)
- OCR of scanned documents
- Text orientation on a rotated page follows the page (correct on non-rotated pages, which is the common case)

## Stack

- Vite 7 + React 19 + TypeScript (strict)
- [`pdfjs-dist`](https://github.com/mozilla/pdf.js) for rendering
- [`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib) for export/baking (maintained fork of pdf-lib)
- Vitest (unit) + Playwright (end-to-end)

## Architecture

Three layers:

1. **Render** (`src/engines/pdf/render.ts`) — pdf.js draws each page to a canvas.
2. **Overlay** (`src/ui`) — a DOM/SVG layer stores annotations in view points and handles create/select/move/resize, with no shape library.
3. **Export** (`src/core`) — `@cantoo/pdf-lib` bakes annotations onto the page and saves. The identity page plan mutates the original document (keeping the interactive form); a changed plan rebuilds via `copyPages`.

The overlay↔PDF coordinate conversion (top-left px ↔ bottom-left points, page rotation) lives in `src/core/coords.ts` and is fully unit-tested.

## Development

```bash
npm install
npm run dev          # dev server
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # eslint
npm test             # Vitest unit tests
npm run build        # tsc + vite build (production, PWA)
npm run test:e2e     # Playwright end-to-end (needs a build)
```

## License

MIT
