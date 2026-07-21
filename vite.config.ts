import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Strict CSP injected at build time only (the dev server needs inline scripts
// for HMR). connect-src 'self' is the technical enforcement of the "no upload"
// promise: the browser itself blocks any cross-origin request. wasm-unsafe-eval
// is kept because pdfjs-dist may load its optional WASM image decoders
// (JBIG2/JPX) when rendering the preview of a scanned PDF.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  // No component sets an inline style attribute: every style comes from the
  // stylesheet, so no 'unsafe-inline' and no style-src-attr are needed.
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

function injectCsp(): Plugin {
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

/**
 * Offline PWA. The precache is limited to the app shell (HTML, CSS and every JS
 * chunk); the pdf.js worker (~2.3 MB) is cached at RUNTIME the first time a PDF
 * is opened, so it never weighs on the first visit.
 *
 * maximumFileSizeToCacheInBytes stays at the 2 MiB default on purpose: it is a
 * regression alarm. If a future change lets a multi-megabyte asset match
 * globPatterns, the build fails loudly instead of silently bloating the
 * precache (RAG pwa-vite-plugin-pwa, convertisseur 2026-07-18).
 */
function pwa(): Plugin[] {
  return VitePWA({
    registerType: "autoUpdate",
    // External registerSW.js rather than an inline script: keeps the strict
    // CSP (script-src 'self') intact.
    injectRegister: "script-defer",
    includeAssets: ["icon.svg"],
    workbox: {
      // Shell only. The pdf.js worker is a runtime-cached .mjs (see below).
      globPatterns: ["**/*.{js,css,html}"],
      clientsClaim: true,
      runtimeCaching: [
        {
          // Content-hashed and immutable, so CacheFirst is safe: a rebuild
          // produces a new filename rather than mutating this one.
          urlPattern: /\.(?:wasm|mjs)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "pdf-editor-runtime",
            expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
    manifest: {
      name: "PDF editor local",
      short_name: "PDF editor",
      description: "Edit PDF files entirely in your browser. No upload.",
      theme_color: "#3b5bdb",
      background_color: "#0b0b0d",
      display: "standalone",
      icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    },
  });
}

// Deployed under /outils/pdf-editor/ on the CDS site; base must stay relative
// so the same build also works on GitHub Pages or a local preview.
export default defineConfig({
  base: "./",
  plugins: [react(), injectCsp(), pwa()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
  worker: {
    format: "es",
  },
});
