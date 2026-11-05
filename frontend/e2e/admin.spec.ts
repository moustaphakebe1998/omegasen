import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Identifiants du super admin, lus dans le .env de développement (jamais en dur dans le dépôt). */
function superAdmin(): { email: string; password: string } {
  const env = Object.fromEntries(
    readFileSync("../.env", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
  return { email: env.SUPERADMIN_EMAIL, password: env.SUPERADMIN_PASSWORD };
}

test("super admin : création d'un utilisateur, activation, désactivation, CA et fiche restaurant", async ({
  browser,
}) => {
  const stamp = Date.now();
  const email = `e2e-${stamp}@example.com`;
  const name = `Caissier E2E ${stamp}`;

  // 1. Connexion du super admin.
  const { email: adminEmail, password } = superAdmin();
  const admin = await browser.newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email").fill(adminEmail);
  await admin.getByLabel("Mot de passe").fill(password);
  await admin.getByRole("button", { name: "Se connecter" }).click();
  await admin.waitForURL((url) => !url.pathname.startsWith("/login"));

  // 2. Création d'un caissier rattaché au restaurant de démo.
  await admin.goto("/admin/users");
  await admin.getByRole("button", { name: "Créer un utilisateur" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Nom complet").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Restaurant").click();
  await admin.getByRole("option", { name: "Le Baobab Démo" }).click();
  await dialog.getByLabel("Rôle").click();
  await admin.getByRole("option", { name: /Caiss/ }).click();
  await dialog.getByRole("button", { name: "Créer l'utilisateur" }).click();
  await expect(dialog.getByRole("heading", { name: "Utilisateur créé" })).toBeVisible();
  const link = await dialog.getByLabel("Lien d'activation").inputValue();
  await dialog.getByRole("button", { name: "Terminé" }).click();

  // 3. L'utilisateur active son compte et arrive sur la caisse.
  const ctx = await browser.newContext();
  const cashier = await ctx.newPage();
  await cashier.goto(new URL(link).pathname);
  await expect(cashier.getByRole("heading", { name: new RegExp(`Bienvenue ${name}`) })).toBeVisible();
  await cashier.getByLabel("Mot de passe", { exact: true }).fill("MotDePasse!2026e2e");
  await cashier.getByLabel("Confirmer le mot de passe").fill("MotDePasse!2026e2e");
  await cashier.getByRole("button", { name: "Activer mon compte" }).click();
  await cashier.waitForURL(/\/pos\//);
  await ctx.close();

  // 4. Le super admin le voit actif, puis le désactive.
  await admin.reload();
  await admin.getByLabel("Rechercher un utilisateur").fill(email);
  const row = admin.getByRole("link", { name: new RegExp(email) });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Actif", { exact: true })).toBeVisible();
  await row.click();
  await expect(admin.getByRole("heading", { level: 1, name })).toBeVisible();
  await admin.getByRole("button", { name: "Désactiver" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Désactiver" }).click();
  await expect(admin.getByText("Désactivé", { exact: true })).toBeVisible();

  // 5. Chiffre d'affaires.
  await admin.goto("/admin/revenue");
  await expect(admin.getByRole("heading", { level: 1, name: "Chiffre d'affaires" })).toBeVisible();

  // 6. Fiche du restaurant de démo : l'équipe contient le nouvel utilisateur.
  await admin.goto("/admin/restaurants");
  await admin.getByRole("link", { name: "Le Baobab Démo" }).first().click();
  await expect(admin.getByRole("heading", { level: 1, name: "Le Baobab Démo" })).toBeVisible();
  const team = admin.getByRole("list", { name: "Équipe du restaurant" });
  await expect(team).toBeVisible();
  await expect(team.getByText(email)).toBeVisible();
});
