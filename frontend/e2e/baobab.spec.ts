import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

/**
 * Environnement de test « Restaurant Baobab » (docs/BAOBAB_TEST_ENVIRONMENT.md).
 * Prérequis : `cd backend && .venv/bin/python -m app.cli seed-baobab` (sinon ces tests sont ignorés).
 */
const PASSWORD = "BaobabTest2026!";
const QR = "baobab26";

async function baobabId(request: APIRequestContext): Promise<string | null> {
  const res = await request.post("/api/auth/login", { data: { email: "owner@baobab.test", password: PASSWORD } });
  if (!res.ok()) return null;
  return (await res.json()).user.memberships[0].restaurant_id;
}

async function token(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token;
}

async function loginAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

let rid = "";
test.beforeAll(async ({ request }) => {
  rid = (await baobabId(request)) ?? "";
});
test.beforeEach(() => {
  test.skip(!rid, "Restaurant Baobab absent : lancer `python -m app.cli seed-baobab`");
});

test("chaque compte Baobab arrive sur l'espace de son rôle", async ({ page }) => {
  const cases: [string, string, RegExp][] = [
    ["owner@baobab.test", `/manage/${rid}`, /Vue d'ensemble|Restaurant Baobab/],
    ["admin@baobab.test", `/manage/${rid}`, /Vue d'ensemble|Restaurant Baobab/],
    ["manager@baobab.test", `/manage/${rid}`, /Vue d'ensemble|Restaurant Baobab/],
    ["cashier@baobab.test", `/pos/${rid}`, /Eau minérale/],
    ["waiter@baobab.test", `/pos/${rid}`, /Eau minérale/],
    ["kitchen@baobab.test", `/kitchen/${rid}`, /Grill|Cuisine/],
    ["user@baobab.test", `/manage/${rid}`, /Restaurant Baobab/],
    ["client.aminata@baobab.test", "/compte", /Aminata/],
  ];
  for (const [email, path, text] of cases) {
    await loginAs(page, email);
    await expect(page, email).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByText(text).first(), email).toBeVisible();
  }
});

test("utilisateur standard et cuisine : pages sensibles refusées", async ({ page }) => {
  await loginAs(page, "user@baobab.test");
  for (const section of ["orders", "stats", "team", "reservations"]) {
    await page.goto(`/manage/${rid}/${section}`);
    await expect(page.getByText("Accès non autorisé").first(), section).toBeVisible();
  }
  // Consultation seule de l'établissement (permission « restaurant.view »).
  await page.goto(`/manage/${rid}/settings`);
  await expect(page.getByText(/consultation uniquement/)).toBeVisible();
  await page.goto(`/kitchen/${rid}`);
  await expect(page.getByText(/permission d'utiliser l'écran cuisine/)).toBeVisible();

  await loginAs(page, "kitchen@baobab.test");
  await page.goto(`/manage/${rid}/team`);
  await expect(page.getByText("Accès non autorisé").first()).toBeVisible();
});

test("QR de table → commande rattachée à la table → cuisine → caisse", async ({ page, browser, request }) => {
  const customer = `E2E Baobab ${Date.now()}`;

  // Scan du QR de la table T6 : la table est transmise et préremplie.
  await page.goto(`/q/${QR}?table=T6`);
  await page.waitForURL(/\/r\/baobab\?src=qr&table=T6/);
  await expect(page.getByRole("heading", { name: /Restaurant Baobab/ })).toBeVisible();
  // Plat du poste Grill (le compte cuisine est affecté à ce poste), accompagnement obligatoire + supplément.
  await page.getByRole("button", { name: /Yassa poulet/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Frites/ }).click();
  await dialog.getByRole("button", { name: /Oignons confits/ }).click();
  await dialog.getByRole("button", { name: /Ajouter/ }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /Voir le panier/ }).click();
  await page.getByRole("button", { name: /^Commander/ }).click();
  await expect(page.getByLabel(/Numéro de table/)).toHaveValue("T6");
  await page.getByLabel(/Prénom/).fill(customer);
  await page.getByRole("button", { name: /Valider la commande/ }).click();
  await page.waitForURL(/\/track\//);

  // La commande est rattachée à la table T6, canal QR.
  const owner = await token(request, "owner@baobab.test");
  const res = await request.get(`/api/restaurants/${rid}/orders`, {
    params: { q: customer },
    headers: { Authorization: `Bearer ${owner}` },
  });
  const order = (await res.json()).items[0];
  expect([order.table_label, order.channel, order.status]).toEqual(["T6", "QR", "NEW"]);
  expect(order.total).toBe(3500 + 500 + 200); // prix recalculé par le serveur (TTC)

  // Cuisine : commencer puis prête.
  const kitchen = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await loginAs(kitchen, "kitchen@baobab.test");
  await kitchen.goto(`/kitchen/${rid}`);
  const card = (label: string) =>
    kitchen.locator(
      `xpath=//*[contains(normalize-space(.), "${customer}")][.//button[contains(., "${label}")]][not(.//*[contains(normalize-space(.), "${customer}")][.//button[contains(., "${label}")]])]`,
    );
  await card("Commencer").getByRole("button", { name: /Commencer/ }).click();
  await card("Prête").getByRole("button", { name: /Prête/ }).click();
  await expect(page.getByText(/Votre commande est prête/)).toBeVisible({ timeout: 15_000 });
  await kitchen.close();

  // Caisse : encaissement (API) puis le serveur termine la commande.
  const cashier = await token(request, "cashier@baobab.test");
  const pay = await request.post(`/api/restaurants/${rid}/orders/${order.id}/payments`, {
    data: { method: "CARD" },
    headers: { Authorization: `Bearer ${cashier}` },
  });
  expect((await pay.json()).payment_status).toBe("PAID");
  const waiter = await token(request, "waiter@baobab.test");
  const refused = await request.post(`/api/restaurants/${rid}/orders/${order.id}/payments`, {
    data: { method: "CASH" },
    headers: { Authorization: `Bearer ${waiter}` },
  });
  expect(refused.status()).toBe(403);
  const done = await request.post(`/api/restaurants/${rid}/orders/${order.id}/status`, {
    data: { status: "COMPLETED" },
    headers: { Authorization: `Bearer ${waiter}` },
  });
  expect((await done.json()).status).toBe("COMPLETED");
});
