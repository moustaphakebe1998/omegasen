"use client";

import { type QueryClient, type QueryKey, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, type Schemas, unwrap } from "@/lib/api/client";
import type { OrderChannel, OrderStatus } from "@/lib/labels";

export type Order = Schemas["OrderOut"];
export type Restaurant = Schemas["RestaurantOut"];
export type Station = Schemas["StationOut"];
export type Category = Schemas["CategoryOut"];

/** Fenêtre des commandes « terminées récemment » (minutes). */
export const COMPLETED_WINDOW_MIN = 30;

/** Transitions permises au rôle courant, fournies par l'API (source unique : app/modules/orders.py). */
export type TransitionRules = Partial<Record<OrderStatus, OrderStatus[]>>;

export function useTransitionRules(rid: string) {
  return useQuery({
    queryKey: ["order-transitions", rid],
    queryFn: () =>
      unwrap(api.GET("/api/restaurants/{restaurant_id}/orders/transitions", { params: { path: { restaurant_id: rid } } })),
    staleTime: Infinity,
  }).data as TransitionRules | undefined;
}

/** Transitions possibles depuis `status` pour l'utilisateur (aucune tant que les règles ne sont pas chargées). */
export function roleTransitions(status: OrderStatus, rules: TransitionRules | undefined): OrderStatus[] {
  return rules?.[status] ?? [];
}

/**
 * Transitions réellement proposées : celles annoncées par la commande ∩ celles permises au rôle.
 * Les événements temps réel calculent `allowed_transitions` sans rôle, d'où le recoupement.
 */
export function availableTransitions(order: Order, rules: TransitionRules | undefined): OrderStatus[] {
  const allowed = roleTransitions(order.status, rules);
  return order.allowed_transitions.filter((t) => allowed.includes(t));
}

/** Transition « avant » (retour arrière) depuis un statut. */
export const ROLLBACK: Partial<Record<OrderStatus, OrderStatus>> = {
  PREPARING: "NEW",
  READY: "PREPARING",
  COMPLETED: "READY",
};

export function isRecentlyCompleted(order: Order, now = Date.now()) {
  if (order.status !== "COMPLETED") return false;
  if (!order.completed_at) return true;
  return now - new Date(order.completed_at).getTime() <= COMPLETED_WINDOW_MIN * 60_000;
}

/** Une commande doit-elle figurer sur l'écran cuisine ? */
export function belongsToKitchen(order: Order, stationId: string | null, now = Date.now()) {
  if (!order.sent_to_kitchen_at) return false;
  if (order.status === "CANCELLED") return false;
  if (order.status === "COMPLETED" && !isRecentlyCompleted(order, now)) return false;
  if (stationId && !order.items.some((i) => i.station_id === stationId)) return false;
  return true;
}

function byKitchenTime(a: Order, b: Order) {
  return (a.sent_to_kitchen_at ?? a.created_at).localeCompare(b.sent_to_kitchen_at ?? b.created_at);
}

/** Insère / remplace / retire une commande dans une liste de l'écran cuisine. */
export function upsertKitchenOrder(list: Order[], order: Order, stationId: string | null): Order[] {
  const rest = list.filter((o) => o.id !== order.id);
  if (!belongsToKitchen(order, stationId)) return rest;
  return [...rest, order].sort(byKitchenTime);
}

/** Applique une mise à jour de commande à toutes les listes `["kitchen", rid, stationId]` en cache. */
export function upsertInKitchenCaches(qc: QueryClient, rid: string, order: Order) {
  for (const [key, data] of qc.getQueriesData<Order[]>({ queryKey: ["kitchen", rid] })) {
    if (!data) continue;
    const stationId = (key as QueryKey)[2] as string | null | undefined;
    qc.setQueryData<Order[]>(key, upsertKitchenOrder(data, order, stationId ?? null));
  }
}

/** Minuteur partagé : renvoie Date.now() rafraîchi toutes les `intervalMs`. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function elapsedMinutes(fromIso: string | null, now: number) {
  if (!fromIso) return 0;
  return (now - new Date(fromIso).getTime()) / 60_000;
}

export const CHANNEL_STYLE: Record<OrderChannel, string> = {
  QR: "bg-violet-500/20 text-violet-200 ring-violet-400/40",
  POS: "bg-sky-500/20 text-sky-200 ring-sky-400/40",
  ONLINE: "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40",
  KIOSK: "bg-orange-500/20 text-orange-200 ring-orange-400/40",
};
