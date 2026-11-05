import { type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

export const PASSWORD = "Demo!2026pass";
export const SLUG = "le-baobab-demo";

export const STATE_FILE = "e2e/.state.json";

/** Restaurant de démo (identifiant, code QR) préparé par global-setup.ts. */
export async function demoRestaurant(): Promise<{ rid: string; qrCode: string }> {
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
