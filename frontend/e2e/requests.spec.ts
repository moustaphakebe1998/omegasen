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

test("demande d'ouverture → acceptation par le super admin → activation du propriétaire", async ({ browser }) => {
  const stamp = Date.now();
  const name = `Chez E2E ${stamp}`;
  const email = `e2e-${stamp}@example.com`;

  // 1. Le restaurateur envoie sa demande (l'ancienne URL /register y redirige).
  const visitor = await browser.newPage();
  await visitor.goto("/register");
  await expect(visitor).toHaveURL(/\/demande$/);
  await visitor.getByLabel("Nom du restaurant").fill(name);
  await visitor.getByLabel("Nom complet").fill("Aminata Diallo");
  await visitor.getByLabel("Email").fill(email);
  await visitor.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(visitor.getByText("Demande envoyée")).toBeVisible();

  // 2. Le super admin l'accepte et récupère le lien d'activation.
  const { email: adminEmail, password } = superAdmin();
  const admin = await browser.newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email").fill(adminEmail);
  await admin.getByLabel("Mot de passe").fill(password);
  await admin.getByRole("button", { name: "Se connecter" }).click();
  await admin.waitForURL((url) => !url.pathname.startsWith("/login"));
  await admin.goto("/admin/requests");
  const card = admin.getByRole("listitem").filter({ hasText: name });
  await card.getByRole("button", { name: /Accepter/ }).click();
  await admin.getByRole("button", { name: "Créer le restaurant" }).click();
  await expect(admin.getByText("Restaurant créé")).toBeVisible();
  const link = await admin.getByLabel("Lien d'activation").inputValue();

  // 3. Le propriétaire active son compte et arrive dans son espace.
  const owner = await browser.newPage();
  await owner.goto(new URL(link).pathname);
  await expect(owner.getByRole("heading", { name: /Bienvenue Aminata Diallo/ })).toBeVisible();
  await owner.getByLabel("Mot de passe", { exact: true }).fill("MotDePasse!2026e2e");
  await owner.getByLabel("Confirmer le mot de passe").fill("MotDePasse!2026e2e");
  await owner.getByRole("button", { name: "Activer mon compte" }).click();
  await owner.waitForURL(/\/manage/);

  // Lien à usage unique.
  const again = await browser.newPage();
  await again.goto(new URL(link).pathname);
  await expect(again.getByText("Lien invalide ou expiré")).toBeVisible();
});
