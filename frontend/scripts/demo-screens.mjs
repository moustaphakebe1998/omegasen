/**
 * Génère les captures réelles de la page /demo à partir du restaurant de démonstration.
 *
 *   npm run demo:screens     (application lancée avec ./dev.sh)
 *
 * Le script crée un peu d'activité (commandes, réservation, paiement), capture les écrans,
 * convertit en WebP (public/demo/*.webp), puis supprime cette activité (purge-e2e --since).
 */
import { chromium, devices, request } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = resolve(ROOT, "../backend");
const OUT = resolve(ROOT, "public/demo");
const TMP = resolve(ROOT, ".demo-tmp");
const B = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const PASSWORD = "Demo!2026pass";
const SLUG = "le-baobab-demo";

const env = Object.fromEntries(
  readFileSync(resolve(ROOT, "../.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const startedAt = new Date().toISOString();
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const api = await request.newContext({ baseURL: B });
async function token(email, password = PASSWORD) {
  const r = await api.post("/api/auth/login", { data: { email, password } });
  if (!r.ok()) throw new Error(`login ${email}: ${r.status()}`);
  return (await r.json()).access_token;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

// ── Activité de démonstration ─────────────────────────────
const pub = await (await api.get(`/api/public/restaurants/${SLUG}`)).json();
const products = pub.menu.flatMap((c) => c.products);
const byName = (n) => products.find((p) => p.name === n);
const requiredOptions = (p) =>
  p.option_groups.filter((g) => g.min_choices > 0).flatMap((g) => g.options.slice(0, g.min_choices).map((o) => o.id));
const line = (name, quantity = 1) => {
  const p = byName(name);
  return { product_id: p.id, quantity, option_ids: requiredOptions(p) };
};
const orders = [
  {
    customer_name: "Aminata",
    service_mode: "DINE_IN",
    table_label: "4",
    items: [line("Yassa poulet", 2), line("Bissap", 2)],
  },
  { customer_name: "Ousmane", service_mode: "TAKEAWAY", items: [line("Thiéboudienne"), line("Gingembre")] },
  { customer_name: "Fatou", service_mode: "DINE_IN", table_label: "7", items: [line("Mafé bœuf"), line("Thiakry")] },
  { customer_name: "Ibrahima", service_mode: "TAKEAWAY", items: [line("Dibi agneau"), line("Bouye")] },
  {
    customer_name: "Mariama",
    service_mode: "DINE_IN",
    table_label: "2",
    items: [line("Beignets", 3), line("Eau minérale")],
  },
];
for (const o of orders) {
  const r = await api.post(`/api/public/restaurants/${SLUG}/orders`, { data: { channel: "QR", ...o } });
  if (!r.ok()) throw new Error(`commande: ${r.status()} ${await r.text()}`);
}
const owner = await token("owner@demo.example.com");
const me = await (await api.get("/api/auth/me", { headers: auth(owner) })).json();
const rid = me.memberships[0].restaurant_id;
const active = await (await api.get(`/api/restaurants/${rid}/orders/active`, { headers: auth(owner) })).json();
const move = (o, status) =>
  api.post(`/api/restaurants/${rid}/orders/${o.id}/status`, { headers: auth(owner), data: { status } });
if (active[1]) await move(active[1], "PREPARING");
if (active[2]) await move(active[2], "PREPARING");
if (active[3]) await move(active[3], "READY");
for (const o of active.slice(0, 3)) {
  await api.post(`/api/restaurants/${rid}/orders/${o.id}/payments`, {
    headers: auth(owner),
    data: { method: "CASH", amount: o.total - o.amount_paid },
  });
}
const tomorrow = new Date(Date.now() + 86_400_000);
tomorrow.setUTCHours(20, 0, 0, 0);
await api.post(`/api/public/restaurants/${SLUG}/reservations`, {
  data: {
    starts_at: tomorrow.toISOString(),
    party_size: 6,
    customer_name: "Famille Ndiaye",
    customer_phone: "+221770000000",
  },
});

// ── Captures ──────────────────────────────────────────────
const browser = await chromium.launch();
async function shot(name, path, { device, viewport, email, password, setup, full = false } = {}) {
  const ctx = await browser.newContext(
    device ? { ...devices[device] } : { viewport: viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  );
  const page = await ctx.newPage();
  if (email) {
    await page.goto(`${B}/login`);
    await page.fill("#email", email);
    await page.fill("#password", password ?? PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  }
  await page.goto(B + path, { waitUntil: "networkidle" });
  await page
    .waitForFunction(() => !document.querySelector("[aria-busy=true]"), null, { timeout: 30000 })
    .catch(() => {});
  if (setup) await setup(page);
  await page.mouse.move(0, 0); // pas d'infobulle de survol sur la capture
  // Attend la disparition des notifications éphémères (toasts).
  await page
    .waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${TMP}/${name}.png`, fullPage: full });
  await ctx.close();
}

await shot("client-menu", `/r/${SLUG}?src=qr`, { device: "iPhone 13" });
await shot("manage-overview", `/manage/${rid}`, { email: "owner@demo.example.com" });
await shot("manage-qr", `/manage/${rid}/qr`, { email: "owner@demo.example.com" });
await shot("kitchen", `/kitchen/${rid}`, { email: "cuisine@demo.example.com", viewport: { width: 1280, height: 800 } });
await shot("pos", `/pos/${rid}`, {
  email: "caisse@demo.example.com",
  viewport: { width: 1280, height: 800 },
  setup: async (page) => {
    for (const n of ["Bissap", "Eau minérale", "Beignets"]) {
      await page
        .getByRole("button", { name: new RegExp(n) })
        .first()
        .click()
        .catch(() => {});
      await page.keyboard.press("Escape").catch(() => {});
    }
  },
});
await shot("admin-revenue", "/admin/revenue", { email: env.SUPERADMIN_EMAIL, password: env.SUPERADMIN_PASSWORD });
await browser.close();

// ── Conversion WebP (Pillow) + nettoyage de l'activité créée ─
const python = resolve(BACKEND, ".venv/bin/python");
execFileSync(
  python,
  [
    "-c",
    `
import sys
from PIL import Image
src, out, assets = sys.argv[1], sys.argv[2], sys.argv[3]
for n in ["client-menu", "manage-overview", "manage-qr", "kitchen", "pos", "admin-revenue"]:
    im = Image.open(f"{src}/{n}.png").convert("RGB")
    im.thumbnail((1600, 1600))
    im.save(f"{out}/{n}.webp", "WEBP", quality=82, method=6)
cover = Image.open(f"{assets}/cover.jpg").convert("RGB")
w, h = cover.size; tw = min(w, int(h * 4 / 3)); th = int(tw * 3 / 4)
cover = cover.crop(((w - tw) // 2, (h - th) // 2, (w - tw) // 2 + tw, (h - th) // 2 + th))
cover.thumbnail((1400, 1400)); cover.save(f"{out}/baobab-cover.webp", "WEBP", quality=82, method=6)
`,
    TMP,
    OUT,
    resolve(BACKEND, "app/demo_assets"),
  ],
  { stdio: "inherit" },
);
rmSync(TMP, { recursive: true, force: true });
execFileSync(python, ["-m", "app.cli", "purge-e2e", "--since", startedAt], { cwd: BACKEND, stdio: "inherit" });
console.log(`Captures de démo écrites dans ${OUT}`);
await api.dispose();
