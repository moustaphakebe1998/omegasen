import { expect, test } from "@playwright/test";

import { demoRestaurant, login, SLUG } from "./helpers";

type PublicProduct = { id: string; is_available: boolean; option_groups: unknown[] };
type PublicMenu = { menu: { products: PublicProduct[] }[] };

test("mon compte : profil, sessions et notification en direct d'une nouvelle commande", async ({ page, request }) => {
  const { rid } = await demoRestaurant();
  await login(page, "owner@demo.example.com");

  // 1. Profil : modification du téléphone, persistée après rechargement.
  await page.goto("/compte");
  await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();
  const phoneInput = page.getByLabel("Téléphone");
  const originalPhone = await phoneInput.inputValue();
  const phone = `+221 77 ${String(Date.now()).slice(-7)}`;
  await phoneInput.fill(phone);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Profil enregistré")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Téléphone")).toHaveValue(phone);

  // Remet la valeur d'origine (données de démo).
  await page.getByLabel("Téléphone").fill(originalPhone);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Profil enregistré").first()).toBeVisible();

  // 2. Sécurité : la liste des sessions contient l'appareil courant.
  await page.getByRole("tab", { name: "Sécurité" }).click();
  const sessions = page.getByRole("list", { name: "Sessions actives" });
  await expect(sessions.locator("li[data-current]")).toHaveCount(1);
  await expect(sessions.getByText("Cet appareil")).toBeVisible();

  // 3. Espace restaurateur : on part d'une cloche sans notification non lue.
  await page.goto(`/manage/${rid}`);
  const bell = page.getByRole("button", { name: /^Notifications/ });
  await expect(bell).toBeVisible();
  const badge = page.getByTestId("notifications-unread");
  if (await badge.isVisible().catch(() => false)) {
    await bell.click();
    await page.getByRole("menuitem").first().waitFor().catch(() => undefined);
    await page.getByRole("button", { name: "Tout marquer comme lu" }).click();
    await page.keyboard.press("Escape");
  }
  await expect(badge).toBeHidden();

  // 4. Un visiteur anonyme commande via l'API publique.
  const menu = (await (await request.get(`/api/public/restaurants/${SLUG}`)).json()) as PublicMenu;
  const product = menu.menu
    .flatMap((c) => c.products)
    .find((p) => p.is_available && p.option_groups.length === 0);
  expect(product, "un produit sans option est nécessaire").toBeTruthy();
  const res = await request.post(`/api/public/restaurants/${SLUG}/orders`, {
    data: {
      channel: "QR",
      service_mode: "TAKEAWAY",
      customer_name: `E2E compte ${Date.now()}`,
      items: [{ product_id: product!.id, quantity: 1 }],
    },
  });
  expect(res.status(), await res.text()).toBe(201);

  // 5. Le badge de la cloche se met à jour sans rechargement (WebSocket /api/ws/me).
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await bell.click();
  await expect(page.getByRole("menuitem", { name: /Nouvelle commande/ }).first()).toBeVisible();
});

test("mot de passe oublié : confirmation neutre", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  await page.waitForURL(/\/mot-de-passe-oublie$/);
  await page.getByLabel("Email").fill(`inconnu-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(page.getByRole("heading", { name: "Vérifiez votre boîte mail" })).toBeVisible();
  await expect(page.getByText(/Si un compte existe pour/)).toBeVisible();
});

test("lien de réinitialisation invalide", async ({ page }) => {
  await page.goto("/reset-password/lien-invalide-0000");
  await expect(page.getByRole("heading", { name: "Lien invalide ou expiré" })).toBeVisible();
});
