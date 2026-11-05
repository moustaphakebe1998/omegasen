import { expect, test } from "@playwright/test";

import { demoRestaurant, login, SLUG } from "./helpers";

test("scan du QR → commande → suivi en direct mis à jour par la cuisine", async ({ page, browser }) => {
  const { rid, qrCode } = await demoRestaurant();
  const customer = `E2E ${Date.now()}`;

  // 1. Le client scanne le QR Code et arrive sur la page du restaurant.
  await page.goto(`/q/${qrCode}`);
  await page.waitForURL(new RegExp(`/r/${SLUG}\\?src=qr`));
  await expect(page.getByRole("heading", { name: /Le Baobab/ })).toBeVisible();

  // 2. Il choisit un plat avec option obligatoire (pré-sélectionnée) + un supplément.
  await page.getByRole("button", { name: /Yassa poulet/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Frites/ }).click();
  await dialog.getByRole("button", { name: /Ajouter/ }).click();
  await expect(dialog).toBeHidden();

  // 3. Panier → commande.
  await page.getByRole("button", { name: /Voir le panier/ }).click();
  await page.getByRole("button", { name: /^Commander/ }).click();
  await page.getByLabel(/Prénom/).fill(customer);
  await page.getByRole("button", { name: /Valider la commande/ }).click();

  // 4. Page de suivi.
  await page.waitForURL(/\/track\//);
  await expect(page.getByText("Yassa poulet").first()).toBeVisible();
  await expect(page.getByText(/4\s?000/).first()).toBeVisible(); // 3 500 + frites 500

  // 5. La cuisine (autre appareil) reçoit la commande et la passe à « Prête ».
  const kitchen = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await login(kitchen, "cuisine@demo.example.com");
  await kitchen.goto(`/kitchen/${rid}`);
  const card = kitchen.locator(`xpath=//*[contains(normalize-space(.), "${customer}")][.//button[contains(., "Commencer")]][not(.//*[contains(normalize-space(.), "${customer}")][.//button[contains(., "Commencer")]])]`);
  await card.getByRole("button", { name: /Commencer/ }).click();
  const preparing = kitchen.locator(`xpath=//*[contains(normalize-space(.), "${customer}")][.//button[contains(., "Prête")]][not(.//*[contains(normalize-space(.), "${customer}")][.//button[contains(., "Prête")]])]`);
  await preparing.getByRole("button", { name: /Prête/ }).click();

  // 6. Le client voit le changement sans recharger (WebSocket).
  await expect(page.getByText(/Votre commande est prête/)).toBeVisible({ timeout: 15_000 });
  await kitchen.close();
});

test("QR Code inconnu", async ({ page }) => {
  await page.goto("/q/inexistant");
  await expect(page.getByText(/QR Code inconnu/)).toBeVisible();
});
