import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { STATE_FILE } from "./helpers";

/**
 * Nettoie la base de développement après les tests : seul le restaurant de démo doit rester.
 * Supprime les restaurants/comptes créés par les tests (e2e-…@example.com) et les commandes
 * passées sur la démo pendant la série. Désactivable avec E2E_SKIP_PURGE=1.
 */
export default async function globalTeardown() {
  if (process.env.E2E_SKIP_PURGE === "1" || !existsSync(STATE_FILE)) return;
  const { startedAt } = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { startedAt?: string };
  const backend = resolve(__dirname, "../../backend");
  const python = resolve(backend, ".venv/bin/python");
  if (!existsSync(python)) return;
  const args = ["-m", "app.cli", "purge-e2e", ...(startedAt ? ["--since", startedAt] : [])];
  execFileSync(python, args, { cwd: backend, stdio: "inherit" });
}
