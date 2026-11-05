import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout : nécessitent l'API (port 8100, données de démo `seed-demo`)
 * et le frontend (port 3100) déjà lancés — ou définir E2E_BASE_URL.
 */
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /public\.spec\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } }, testIgnore: /public\.spec\.ts/ },
  ],
});
