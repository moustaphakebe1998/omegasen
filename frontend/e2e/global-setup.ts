import { request } from "@playwright/test";
import { writeFileSync } from "node:fs";

import { PASSWORD, STATE_FILE } from "./helpers";

/** Connexion API unique (évite la limitation de débit sur /api/auth/login). */
export default async function globalSetup() {
  const ctx = await request.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100" });
  const res = await ctx.post("/api/auth/login", { data: { email: "owner@demo.example.com", password: PASSWORD } });
  if (!res.ok()) throw new Error(`Connexion du compte de démo impossible (${res.status()}) — lancer seed-demo ?`);
  const { access_token, user } = await res.json();
  const rid: string = user.memberships[0].restaurant_id;
  const qr = await (await ctx.get(`/api/restaurants/${rid}/qr`, { headers: { Authorization: `Bearer ${access_token}` } })).json();
  // startedAt : global-teardown supprime les commandes créées pendant la série de tests.
  writeFileSync(STATE_FILE, JSON.stringify({ rid, qrCode: qr.code, startedAt: new Date().toISOString() }));
  await ctx.dispose();
}
