import type { Schemas } from "@/lib/api/client";

export type Category = Schemas["CategoryOut"];
export type Product = Schemas["ProductOut"];

export function menuKey(rid: string) {
  return ["menu", rid] as const;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO (UTC) → valeur d'un champ `datetime-local` (heure locale du navigateur). */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valeur `datetime-local` → ISO, ou null si vide. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Taux de TVA saisi en % ("10", "5,5") → points de base (1000, 550).
 * Retourne null si vide, undefined si invalide.
 */
export function parseVatPercent(input: string): number | null | undefined {
  const v = input.trim().replace(",", ".").replace(/\s*%$/, "");
  if (v === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return undefined;
  const bp = Math.round(Number(v) * 100);
  return bp >= 0 && bp <= 5000 ? bp : undefined;
}

/** Points de base → saisie en % ("10", "5,5"). */
export function vatInput(bp: number | null | undefined): string {
  if (bp == null) return "";
  return String(bp / 100).replace(".", ",");
}

/** "gluten, lait , gluten" → ["gluten", "lait"] */
export function splitList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const v = raw.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

/** Déplace l'élément `index` de `delta` positions (retourne une copie). */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(index, 1);
  copy.splice(target, 0, item);
  return copy;
}

/** Promotion actuellement appliquée ? (le prix effectif est calculé par l'API). */
export function promoActive(p: Product): boolean {
  return p.promo_price != null && p.effective_price < p.price;
}
