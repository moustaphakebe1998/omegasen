import { expect, type Page, test } from "@playwright/test";

import { demoRestaurant, login } from "./helpers";

const INITIAL_PASSWORD = "Initial!2026pass";
const NEW_PASSWORD = "Personnel!2026pass";

async function openAddDialog(page: Page) {
  await page.getByRole("button", { name: "Ajouter un collaborateur" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Ajouter un collaborateur" })).toBeVisible();
  return dialog;
}

test("équipe : création directe, permissions personnalisées, premier changement de mot de passe, invitations", async ({
  page,
  browser,
}) => {
  const { rid } = await demoRestaurant();
  const stamp = Date.now();
  const direct = `e2e-${stamp}-direct@example.com`;
  const invited = `e2e-${stamp}-invite@example.com`;

  await login(page, "owner@demo.example.com");
  await page.goto(`/manage/${rid}/team`);
  await expect(page.getByRole("heading", { name: "Équipe", level: 1 })).toBeVisible();

  // 1. Création directe d'un collaborateur « Caisse » sans le droit d'encaisser.
  let dialog = await openAddDialog(page);
  await dialog.getByLabel("Nom complet").fill("Caissier E2E");
  await dialog.getByLabel("Email").fill(direct);
  await dialog.getByRole("combobox", { name: "Rôle" }).click();
  await page.getByRole("option", { name: /^Caisse/ }).click();
  await dialog.getByRole("radio", { name: /Créer le compte directement/ }).click();
  await dialog.getByLabel("Mot de passe initial").fill(INITIAL_PASSWORD);
  await dialog.getByLabel("Confirmer le mot de passe").fill(INITIAL_PASSWORD);
  await dialog.getByRole("button", { name: "Personnaliser les permissions" }).click();
  const encaisser = dialog.getByRole("checkbox", { name: "Encaisser", exact: true });
  await expect(encaisser).toBeChecked();
  await encaisser.click();
  await expect(encaisser).not.toBeChecked();
  await dialog.getByRole("button", { name: "Créer le compte" }).click();
  await expect(dialog.getByText(/Communiquez le mot de passe initial de vive voix/)).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Lien d'activation" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Terminé" }).click();

  const card = page.getByRole("listitem").filter({ hasText: direct });
  await expect(card.getByText("Mot de passe à changer")).toBeVisible();
  await expect(card.getByText("permissions personnalisées")).toBeVisible();

  // 2. Première connexion du collaborateur : changement de mot de passe obligatoire, puis la caisse.
  const ctx = await browser.newContext();
  const staff = await ctx.newPage();
  await staff.goto("/login");
  await staff.getByLabel("Email").fill(direct);
  await staff.getByLabel("Mot de passe").fill(INITIAL_PASSWORD);
  await staff.getByRole("button", { name: "Se connecter" }).click();
  await staff.waitForURL("**/changer-mot-de-passe");
  await staff.getByLabel("Mot de passe initial").fill(INITIAL_PASSWORD);
  await staff.getByLabel("Nouveau mot de passe", { exact: true }).fill(NEW_PASSWORD);
  await staff.getByLabel("Confirmer le nouveau mot de passe").fill(NEW_PASSWORD);
  await staff.getByRole("button", { name: "Enregistrer mon mot de passe" }).click();
  await staff.waitForURL(`**/pos/${rid}`);
  await ctx.close();

  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: direct }).getByText("Mot de passe à changer")).toHaveCount(0);

  // 3. Invitation par email : lien affiché (pas de SMTP en développement), invitation en attente.
  dialog = await openAddDialog(page);
  await dialog.getByLabel("Nom complet").fill("Invité E2E");
  await dialog.getByLabel("Email").fill(invited);
  await expect(dialog.getByRole("radio", { name: /Inviter par email/ })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "Envoyer l'invitation" }).click();
  const link = dialog.getByRole("textbox", { name: "Lien d'activation" });
  await expect(link).toHaveValue(/\/activate\//);
  await expect(dialog.getByRole("button", { name: "Copier" })).toBeVisible();
  await dialog.getByRole("button", { name: "Terminé" }).click();

  const invitations = page.getByRole("region", { name: /^Invitations/ });
  const invite = invitations.getByRole("listitem").filter({ hasText: invited });
  await expect(invite.getByText("Invitation en attente")).toBeVisible();
  await expect(invite.getByText(/Expire le/)).toBeVisible();

  // Renvoi : nouveau lien.
  await invite.getByRole("button", { name: "Renvoyer" }).click();
  const resent = page.getByRole("dialog", { name: "Invitation renvoyée" });
  await expect(resent.getByRole("textbox", { name: "Lien d'activation" })).toHaveValue(/\/activate\//);
  await resent.getByRole("button", { name: "Terminé" }).click();

  // Annulation avec confirmation.
  await invite.getByRole("button", { name: "Annuler l'invitation" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText(/jamais activé, est supprimé/)).toBeVisible();
  await confirm.getByRole("button", { name: "Annuler l'invitation" }).click();
  await expect(invitations.getByRole("listitem").filter({ hasText: invited })).toHaveCount(0);

  // 4. Le propriétaire ne peut pas modifier son propre rôle.
  const me = page.getByRole("listitem").filter({ hasText: "owner@demo.example.com" });
  await me.getByRole("link").first().click();
  await page.waitForURL(`**/manage/${rid}/team/*`);
  await expect(page.getByRole("combobox", { name: "Rôle" })).toBeDisabled();
  await expect(page.getByText(/Vous ne pouvez pas modifier votre propre rôle/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retirer de l'équipe" })).toBeDisabled();
});
