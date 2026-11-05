/**
 * Mémorise localement les commandes suivies (page /track) pour les proposer sur l'accueil.
 * Aucune donnée sensible : jeton de suivi, numéro et nom du restaurant.
 */
export type RecentOrder = {
  token: string;
  displayNumber: string;
  restaurantName: string;
  restaurantSlug: string;
  createdAt: string;
};

const KEY = "omegasen:orders";
const MAX = 10;
/** Au-delà, une commande n'est plus « récente ». */
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export function readRecentOrders(): RecentOrder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (o): o is RecentOrder =>
        !!o &&
        typeof o.token === "string" &&
        typeof o.displayNumber === "string" &&
        typeof o.createdAt === "string" &&
        now - new Date(o.createdAt).getTime() < MAX_AGE_MS,
    );
  } catch {
    return [];
  }
}

export function rememberOrder(order: RecentOrder) {
  try {
    const others = readRecentOrders().filter((o) => o.token !== order.token);
    localStorage.setItem(KEY, JSON.stringify([order, ...others].slice(0, MAX)));
  } catch {
    /* stockage indisponible (navigation privée…) */
  }
}

export function forgetOrder(token: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readRecentOrders().filter((o) => o.token !== token)));
  } catch {
    /* stockage indisponible */
  }
}
