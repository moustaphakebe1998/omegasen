"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, unwrap } from "@/lib/api/client";
import { actionErrorMessage } from "@/lib/permissions";
import type { Reservation, ReservationStatus } from "@/lib/reservations";

export type ReservationFilters = { day?: string; status?: ReservationStatus; upcoming?: boolean };

export const reservationsKey = (rid: string) => ["reservations", rid] as const;

/** Liste des réservations (rafraîchie toutes les minutes et au retour sur l'onglet). */
export function useReservations(rid: string, filters: ReservationFilters, enabled = true) {
  return useQuery({
    queryKey: [...reservationsKey(rid), filters],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/reservations", {
          params: {
            path: { restaurant_id: rid },
            query: {
              day: filters.day,
              status: filters.status,
              upcoming: filters.upcoming || undefined,
            },
          },
        }),
      ),
    enabled: enabled && !!rid,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

const SUCCESS: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: "Réservation confirmée",
  DECLINED: "Réservation refusée",
  CANCELLED: "Réservation annulée",
  SEATED: "Client installé",
  NO_SHOW: "Réservation marquée absente",
};

/** Changement de statut d'une réservation. */
export function useSetReservationStatus(rid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ r, status, staff_note }: { r: Reservation; status: ReservationStatus; staff_note?: string }) =>
      unwrap(
        api.POST("/api/restaurants/{restaurant_id}/reservations/{reservation_id}/status", {
          params: { path: { restaurant_id: rid, reservation_id: r.id } },
          body: { status, staff_note: staff_note ?? null },
        }),
      ),
    onSuccess: (r) => {
      toast.success(`${SUCCESS[r.status] ?? "Réservation mise à jour"} · ${r.customer_name}`);
      void qc.invalidateQueries({ queryKey: reservationsKey(rid) });
    },
    onError: (e) => {
      toast.error(actionErrorMessage(e));
      void qc.invalidateQueries({ queryKey: reservationsKey(rid) });
    },
  });
}
