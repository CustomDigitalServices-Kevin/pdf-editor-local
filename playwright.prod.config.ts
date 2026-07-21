import { defineConfig } from "@playwright/test";

// End-to-end smoke test against the LIVE production deployment.
// No webServer: it hits the deployed URL directly. Read-only for the server —
// the editor is 100% client-side, so nothing is written server-side.
//
//   npx playwright test --config playwright.prod.config.ts
//
// Override the base with PROD_BASE if needed.
const base = process.env["PROD_BASE"] ?? "https://www.custom-digital-services.com";

export default defineConfig({
  testDir: "./e2e-prod",
  workers: 1,
  fullyParallel: false,
  retries: 2,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: base,
    trace: "retain-on-failure",
  },
});
