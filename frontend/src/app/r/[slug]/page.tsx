import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { type PublicChannel, RestaurantView } from "@/components/public/restaurant/restaurant-view";
import type { Schemas } from "@/lib/api/client";
import { tableParam } from "@/lib/tables";

const BACKEND = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8100";

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Récupère le restaurant côté serveur (métadonnées + données initiales).
 * `null` = introuvable (404) ; `undefined` = backend injoignable (le client retentera).
 */
const fetchRestaurant = cache(async (slug: string): Promise<Schemas["PublicRestaurant"] | null | undefined> => {
  try {
    const res = await fetch(`${BACKEND}/api/public/restaurants/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    return (await res.json()) as Schemas["PublicRestaurant"];
  } catch {
    return undefined;
  }
});

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await fetchRestaurant(slug);
  if (r === null) return { title: "Restaurant introuvable" };
  if (!r) return { title: "Menu" };
  const description =
    r.description ?? `Consultez le menu de ${r.name}${r.city ? ` à ${r.city}` : ""} et commandez en ligne.`;
  return {
    title: `${r.name} · Menu et commande`,
    description,
    openGraph: { title: r.name, description, images: r.cover_url ? [r.cover_url] : undefined },
  };
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function RestaurantPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const restaurant = await fetchRestaurant(slug);
  if (restaurant === null) notFound();

  const channel: PublicChannel = first(sp.mode) === "kiosk" ? "KIOSK" : first(sp.src) === "qr" ? "QR" : "ONLINE";

  // QR d'une table : `?table=T5` préremplit la table (consommation sur place).
  const table = channel === "KIOSK" ? null : tableParam(sp.table);

  return <RestaurantView key={slug} slug={slug} initialData={restaurant} channel={channel} table={table} />;
}
