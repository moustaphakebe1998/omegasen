import { expect, test } from "@playwright/test";

import { demoRestaurant, login } from "./helpers";

test("caisse : commande au guichet payée en espèces avec rendu monnaie", async ({ page }) => {
  const { rid } = await demoRestaurant();
  await login(page, "caisse@demo.example.com");
  await page.goto(`/pos/${rid}`);

  await page.getByRole("button", { name: /Bouye/ }).first().click();
  await page.getByRole("button", { name: /Bouye/ }).first().click();
  await page.getByRole("button", { name: /^Encaisser/ }).first().click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Espèces/ }).click();
  await dialog.getByLabel(/Montant remis/).fill("5000");
  await expect(dialog.getByText(/2\s?600/).first()).toBeVisible(); // 5 000 − 2 × 1 200
  await dialog.getByRole("button", { name: /Valider le paiement/ }).click();

  await expect(page.getByText(/Commande envoyée en cuisine/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Nouvelle commande/ })).toBeVisible();
});

test("espace restaurateur : navigation et page QR Code", async ({ page }) => {
  const { rid, qrCode } = await demoRestaurant();
  await login(page, "owner@demo.example.com");
  await page.waitForURL(new RegExp(`/manage/${rid}`));
  for (const [link, heading] of [
    ["Commandes", /Commandes/],
    ["Menu", /Menu/],
    ["Équipe", /Équipe/],
    ["Statistiques", /Statistiques/],
    ["Établissement", /Établissement/],
    ["QR Code", /QR Code/],
  ] as const) {
    await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  await expect(page.getByText(qrCode).first()).toBeVisible();
});

test("isolation : un employé de cuisine ne voit que les rubriques permises par ses droits", async ({ page }) => {
  const { rid } = await demoRestaurant();
  await login(page, "cuisine@demo.example.com");
  await page.goto(`/manage/${rid}`);
  // L'espace de gestion est filtré par permission (comme l'API) : ni commandes, ni équipe, ni statistiques.
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(nav.getByRole("link", { name: "Menu" })).toBeVisible();
  for (const link of ["Commandes", "Réservations", "Équipe", "Statistiques"]) {
    await expect(nav.getByRole("link", { name: link })).toHaveCount(0);
  }
  for (const section of ["orders", "team", "stats"]) {
    await page.goto(`/manage/${rid}/${section}`);
    await expect(page.getByText("Accès non autorisé").first()).toBeVisible();
  }
});
