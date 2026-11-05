"use client";

import { useQuery } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/lib/api/client";

export type Restaurant = Schemas["RestaurantOut"];
export type Order = Schemas["OrderOut"];

/** Restaurant courant (clé partagée `["restaurant", rid]` avec les autres pages). */
export function useRestaurant(rid: string) {
  return useQuery({
    queryKey: ["restaurant", rid],
    queryFn: () =>
      unwrap(api.GET("/api/restaurants/{restaurant_id}", { params: { path: { restaurant_id: rid } } })),
    enabled: !!rid,
  });
}

/** Date locale au format ISO (YYYY-MM-DD), sans conversion UTC. */
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ajoute `days` jours à une date ISO locale. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localIsoDate(new Date(y, m - 1, d + days));
}

/** "2026-11-05" → "05/11" (ou "05/11/2026" si `withYear`). */
export function formatIsoDay(iso: string, withYear = false): string {
  const [y, m, d] = iso.split("-");
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}
