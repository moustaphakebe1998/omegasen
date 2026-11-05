"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type Schemas, unwrap } from "@/lib/api/client";

export type Restaurant = Schemas["RestaurantOut"];

export function restaurantKey(rid: string) {
  return ["restaurant", rid] as const;
}

/** Restaurant courant (même clé que le layout de l'espace gérant). */
export function useRestaurant(rid: string) {
  return useQuery({
    queryKey: restaurantKey(rid),
    queryFn: () => unwrap(api.GET("/api/restaurants/{restaurant_id}", { params: { path: { restaurant_id: rid } } })),
  });
}

/** Met à jour le restaurant (PATCH) puis rafraîchit le cache partagé. */
export function useUpdateRestaurant(rid: string) {
  const qc = useQueryClient();
  return async (body: Schemas["RestaurantUpdate"]): Promise<Restaurant> => {
    const data = await unwrap(
      api.PATCH("/api/restaurants/{restaurant_id}", { params: { path: { restaurant_id: rid } }, body }),
    );
    qc.setQueryData(restaurantKey(rid), data);
    await qc.invalidateQueries({ queryKey: restaurantKey(rid) });
    return data;
  };
}

export function useStations(rid: string) {
  return useQuery({
    queryKey: ["stations", rid],
    queryFn: () =>
      unwrap(api.GET("/api/restaurants/{restaurant_id}/stations", { params: { path: { restaurant_id: rid } } })),
  });
}
