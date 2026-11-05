/** Montants : entiers en unités mineures côté API (centimes EUR, francs XOF). */
export const CURRENCY_EXPONENT: Record<string, number> = { EUR: 2, XOF: 0 };

export function formatMoney(amount: number, currency: string): string {
  const exp = CURRENCY_EXPONENT[currency] ?? 2;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).format(amount / 10 ** exp);
}

/** "12,50" → 1250 (EUR) ; "3 500" → 3500 (XOF). Retourne null si invalide. */
export function parseMoney(input: string, currency: string): number | null {
  const exp = CURRENCY_EXPONENT[currency] ?? 2;
  const cleaned = input.replace(/\s| /g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [int, dec = ""] = cleaned.split(".");
  if (dec.length > exp) return null;
  return Number(int) * 10 ** exp + Number((dec + "0".repeat(exp)).slice(0, exp) || 0);
}

/** 1250 → "12,50" pour pré-remplir un champ. */
export function moneyInput(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "";
  const exp = CURRENCY_EXPONENT[currency] ?? 2;
  return exp === 0 ? String(amount) : (amount / 10 ** exp).toFixed(exp).replace(".", ",");
}

export function formatPercentBp(bp: number): string {
  return `${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Durée écoulée lisible : "45 s", "7 min", "1 h 05". */
export function formatElapsed(fromIso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
