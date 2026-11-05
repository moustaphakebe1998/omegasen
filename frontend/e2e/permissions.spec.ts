import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

import { demoRestaurant, login, PASSWORD } from "./helpers";

const API = process.env.E2E_API_URL ?? "http://localhost:8100";
const INITIAL_PASSWORD = "Initial!2026x";

/** Responsable aux permissions réduites : consultation, modification du menu (hors prix), ruptures. */
const RESTRICTED_PERMISSIONS = [
  "restaurant.view",
  "menu.view",
  "menu.edit",
  "stock.manage",
  "reservations.view",
  "orders.history",
] as const;

async function createRestrictedManager(request: APIRequestContext, rid: string): Promise<string> {
  const login = await request.post(`${API}/api/auth/login`, {
    data: { email: "owner@demo.example.com", password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const { access_token } = (await login.json()) as { access_token: string };
  // Adresse e2e-…@example.com : supprimée par `app.cli purge-e2e`.
  const email = `e2e-restricted-${Date.now()}@example.com`;
  const created = await request.post(`${API}/api/restaurants/${rid}/members`, {
    headers: { Authorization: `Bearer ${access_token}` },
    data: {
      email,
      full_name: "Resp Restreint",
      role: "MANAGER",
      mode: "password",
      password: INITIAL_PASSWORD,
      permissions: RESTRICTED_PERMISSIONS,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  return email;
}

/** Première connexion avec le mot de passe initial, puis choix d'un mot de passe personnel. */
async function firstLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(INITIAL_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  if (!page.url().includes("/changer-mot-de-passe")) await page.goto("/changer-mot-de-passe");
  await page.getByLabel("Mot de passe initial").fill(INITIAL_PASSWORD);
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmer le nouveau mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Enregistrer mon mot de passe" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/changer-mot-de-passe"));
}

test("responsable restreint : navigation, menu, établissement et pages interdites selon ses permissions", async ({
  page,
  request,
}) => {
  const { rid } = await demoRestaurant();
  const email = await createRestrictedManager(request, rid);
  await firstLogin(page, email);

  await page.goto(`/manage/${rid}`);
  await expect(page.getByRole("heading", { level: 1, name: "Vue d'ensemble" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(nav.getByRole("link", { name: "Menu" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Équipe" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Statistiques" })).toHaveCount(0);
  // Pas de chiffre d'affaires sans `stats.view`, interrupteur des commandes en lecture seule.
  await expect(page.getByText("Chiffre d'affaires")).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Accepte les commandes" })).toBeDisabled();

  // Menu : modification possible, ni suppression ni création.
  await nav.getByRole("link", { name: "Menu" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Modifier / }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Supprimer / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nouveau produit" })).toHaveCount(0);

  // Éditeur de produit : prix non modifiable sans `prices.edit`.
  await page
    .getByRole("button", { name: /^Modifier / })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/^Prix \(/)).toBeDisabled();
  await expect(dialog.getByText("Prix non modifiables avec vos permissions")).toBeVisible();
  await expect(dialog.getByLabel("Nom", { exact: true })).toBeEditable();
  await dialog.getByRole("button", { name: "Annuler" }).click();

  // Établissement : sections en lecture seule, sans bouton d'enregistrement.
  await page.goto(`/manage/${rid}/settings`);
  await expect(page.getByRole("heading", { level: 1, name: "Établissement" })).toBeVisible();
  await expect(page.getByText("Lecture seule").first()).toBeVisible();
  await expect(
    page.getByRole("tabpanel", { name: "Informations" }).getByRole("button", { name: "Enregistrer" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Nom de l'établissement")).toBeDisabled();

  // QR Code : téléchargements disponibles, personnalisation en lecture seule.
  await page.goto(`/manage/${rid}/qr`);
  await expect(page.getByRole("button", { name: /Image PNG/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer les couleurs" })).toHaveCount(0);

  // Accès direct à une page interdite.
  await page.goto(`/manage/${rid}/stats`);
  await expect(page.getByText("Accès non autorisé")).toBeVisible();
});

test("propriétaire : actions de suppression et de création visibles", async ({ page }) => {
  const { rid } = await demoRestaurant();
  await login(page, "owner@demo.example.com");
  await page.goto(`/manage/${rid}/menu`);
  await expect(page.getByRole("heading", { level: 1, name: "Menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Supprimer / }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Nouveau produit" })).toBeVisible();

  await page
    .getByRole("button", { name: /^Modifier / })
    .first()
    .click();
  await expect(page.getByRole("dialog").getByLabel(/^Prix \(/)).toBeEditable();
  await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();

  await page.goto(`/manage/${rid}/settings`);
  await expect(page.getByRole("heading", { level: 1, name: "Établissement" })).toBeVisible();
  await expect(page.getByText("Lecture seule")).toHaveCount(0);
  await expect(
    page.getByRole("tabpanel", { name: "Informations" }).getByRole("button", { name: "Enregistrer" }),
  ).toBeDisabled();
});
