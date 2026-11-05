import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import { demoRestaurant, login } from "./helpers";

/** Mobile, tablette, ordinateur. */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablette", width: 820, height: 1180 },
  { name: "ordinateur", width: 1440, height: 900 },
];

/** Aucune page ne doit défiler horizontalement (signe de chevauchement ou de débordement). */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  await page
    .waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 15_000 })
    .catch(() => {});
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label} déborde de ${overflow}px`).toBeLessThanOrEqual(1);
}

async function check(page: Page, paths: string[]) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const path of paths) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page, `${path} (${vp.name})`);
    }
  }
}

test("pages publiques : pas de débordement horizontal", async ({ page }) => {
  await check(page, ["/", "/demo", "/r/le-baobab-demo", "/login", "/demande", "/inscription", "/mot-de-passe-oublie"]);
});

test("espace restaurateur, cuisine et caisse : pas de débordement horizontal", async ({ page }) => {
  const { rid } = await demoRestaurant();
  await login(page, "owner@demo.example.com");
  await check(page, [
    `/manage/${rid}`,
    `/manage/${rid}/orders`,
    `/manage/${rid}/menu`,
    `/manage/${rid}/reservations`,
    `/manage/${rid}/team`,
    `/manage/${rid}/qr`,
    `/manage/${rid}/settings`,
    `/manage/${rid}/stats`,
    `/kitchen/${rid}`,
    `/pos/${rid}`,
    "/compte",
  ]);
});

test("super admin : pas de débordement horizontal", async ({ page }) => {
  const env = Object.fromEntries(
    readFileSync("../.env", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const { rid } = await demoRestaurant();
  await page.goto("/login");
  await page.getByLabel("Email").fill(env.SUPERADMIN_EMAIL);
  await page.getByLabel("Mot de passe", { exact: true }).fill(env.SUPERADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await check(page, [
    "/admin",
    "/admin/requests",
    "/admin/restaurants",
    `/admin/restaurants/${rid}`,
    "/admin/users",
    "/admin/revenue",
    "/admin/audit",
  ]);
});
