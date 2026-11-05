import { expect, test } from "@playwright/test";

import { demoRestaurant, login, SLUG } from "./helpers";

test("réservation : demande en ligne, confirmation par le restaurant, suivi client", async ({ page }) => {
  const { rid } = await demoRestaurant();
  const stamp = Date.now();
  const name = `Client E2E ${stamp}`;

  // 1. Le visiteur (non connecté) réserve pour demain 20:00.
  await page.goto(`/r/${SLUG}`);
  await page.getByRole("button", { name: "Réserver une table" }).click();
  const dialog = page.getByRole("dialog", { name: "Réserver une table" });
  await dialog.getByRole("combobox", { name: "Date" }).click();
  await page.getByRole("option", { name: "Demain" }).click();
  await dialog.getByText("20:00", { exact: true }).click();
  await dialog.getByRole("button", { name: "Une personne de plus" }).click();
  await expect(dialog.getByText("3 pers.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Nom", exact: true }).fill(name);
  await dialog.getByRole("textbox", { name: "Téléphone" }).fill("+221 77 000 00 00");
  await dialog.getByRole("textbox", { name: /^Email/ }).fill(`e2e-${stamp}@example.com`);
  await dialog.getByRole("textbox", { name: /^Remarque/ }).fill("Table en terrasse si possible");
  await dialog.getByRole("button", { name: "Envoyer ma demande" }).click();

  await page.waitForURL(/\/reservation\/[^/]+$/);
  const trackingUrl = page.url();
  await expect(page.getByText(/en attente/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler ma réservation" })).toBeVisible();

  // 2. Le propriétaire la confirme depuis l'espace restaurateur.
  await login(page, "owner@demo.example.com");
  await page.goto(`/manage/${rid}/reservations`);
  await expect(page.getByRole("heading", { level: 1, name: "Réservations" })).toBeVisible();
  await page.getByRole("button", { name: "Jour suivant" }).click();
  const card = page.getByRole("article", { name: `Réservation de ${name}` });
  await expect(card).toBeVisible();
  await expect(card.getByText("En attente")).toBeVisible();
  await expect(card.getByText("Table en terrasse si possible")).toBeVisible();
  await card.getByRole("button", { name: "Confirmer" }).click();
  await expect(card.getByText("Confirmée")).toBeVisible();
  await expect(card.getByRole("button", { name: "Arrivé·e" })).toBeVisible();

  // 3. Le client voit sa réservation confirmée.
  await page.goto(trackingUrl);
  await expect(page.getByText(/confirmée/i).first()).toBeVisible();
});

test("équipe : invitation d'un membre avec lien d'activation et invitation en attente", async ({ page }) => {
  const { rid } = await demoRestaurant();
  const email = `e2e-${Date.now()}@example.com`;

  await login(page, "owner@demo.example.com");
  await page.goto(`/manage/${rid}/team`);
  await page.getByRole("button", { name: "Ajouter un membre" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/invitation est envoyée par email/)).toBeVisible();
  await expect(dialog.getByLabel(/mot de passe/i)).toHaveCount(0);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Nom complet").fill("Invité E2E");
  await dialog.getByRole("button", { name: "Inviter" }).click();

  // En développement, aucun SMTP : le lien est affiché pour être transmis.
  const link = dialog.getByRole("textbox", { name: "Lien d'activation" });
  await expect(link).toBeVisible();
  await expect(link).toHaveValue(/\/activate\//);
  await expect(dialog.getByRole("button", { name: "Copier" })).toBeVisible();
  await dialog.getByRole("button", { name: "Terminé" }).click();

  const row = page.getByRole("listitem").filter({ hasText: email });
  await expect(row.getByText("Invitation en attente")).toBeVisible();
  await row.getByRole("button", { name: "Renvoyer l'invitation" }).click();
  await expect(page.getByRole("dialog", { name: "Invitation renvoyée" }).getByRole("textbox")).toHaveValue(
    /\/activate\//,
  );
});
