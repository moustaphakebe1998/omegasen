"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { reservationBody, ReservationForm } from "@/components/public/restaurant/reservation-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { formatResDateTime, zonedIso } from "@/lib/reservations";

import { reservationsKey } from "./use-reservations";

/** Réservation prise par téléphone : enregistrée directement comme confirmée. */
export function NewReservationDialog({
  restaurant,
  open,
  onOpenChange,
  defaultDay,
}: {
  restaurant: Schemas["RestaurantOut"];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDay?: string;
}) {
  const qc = useQueryClient();
  const tz = restaurant.timezone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle réservation</DialogTitle>
          <DialogDescription>
            Réservation prise par téléphone ou au comptoir : elle est enregistrée directement comme confirmée.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ReservationForm
            idPrefix="staff-rsv"
            hours={restaurant.opening_hours}
            timeZone={tz}
            daysAhead={90}
            defaultDay={defaultDay}
            submitLabel="Enregistrer la réservation"
            onCancel={() => onOpenChange(false)}
            onSubmit={async (v) => {
              const r = await unwrap(
                api.POST("/api/restaurants/{restaurant_id}/reservations", {
                  params: { path: { restaurant_id: restaurant.id } },
                  body: { ...reservationBody(v), starts_at: zonedIso(v.day, v.time, tz) },
                }),
              );
              toast.success(`Réservation enregistrée : ${r.customer_name}, ${formatResDateTime(r.starts_at, tz)}`);
              void qc.invalidateQueries({ queryKey: reservationsKey(restaurant.id) });
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
