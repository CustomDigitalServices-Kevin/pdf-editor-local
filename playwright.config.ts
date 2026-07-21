import { defineConfig } from "@playwright/test";

// The E2E suite runs against the PRODUCTION build served statically: that is
// the only configuration where the strict CSP, the pdf.js worker chunk and the
// service worker all behave like they will in production.
//
// It serves dist/ with scripts/serve-dist.mjs rather than `vite preview`: an
// editor extension attached to the Vite process injected an instrumentation
// script into the served HTML (convertisseur/compresseur gotcha), so the suite
// was not testing the real bundle.
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  retries: process.env["CI"] === undefined ? 0 : 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run serve:dist",
    url: "http://localhost:4173",
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 120_000,
  },
});
