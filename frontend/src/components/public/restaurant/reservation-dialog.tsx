"use client";

import { CalendarCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, unwrap, type Schemas } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";

import { zonedIso } from "@/lib/reservations";

import { reservationBody, ReservationForm } from "./reservation-form";

/**
 * Bouton « Réserver une table » + formulaire. Les horaires choisis sont ceux du restaurant :
 * l'heure est envoyée sans décalage et l'API l'interprète dans le fuseau du restaurant.
 * Si le visiteur est connecté, le client API joint son jeton : la réservation est liée à son compte.
 */
export function ReserveTable({ restaurant: r }: { restaurant: Schemas["PublicRestaurant"] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  return (
    <>
      <Button size="lg" className="h-12 w-full rounded-xl text-base sm:w-auto" onClick={() => setOpen(true)}>
        <CalendarCheck className="size-5" />
        Réserver une table
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Réserver une table</DialogTitle>
            <DialogDescription>
              {r.name} confirmera votre demande. Vous suivrez son état sur la page qui s&apos;affichera ensuite.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <ReservationForm
              idPrefix="public-rsv"
              hours={r.opening_hours}
              timeZone={r.timezone}
              daysAhead={30}
              submitLabel="Envoyer ma demande"
              defaults={{
                customer_name: user?.full_name ?? "",
                customer_email: user?.email ?? "",
                customer_phone: user?.phone ?? "",
              }}
              onCancel={() => setOpen(false)}
              onSubmit={async (v) => {
                const res = await unwrap(
                  api.POST("/api/public/restaurants/{slug}/reservations", {
                    params: { path: { slug: r.slug } },
                    body: { ...reservationBody(v), starts_at: zonedIso(v.day, v.time, r.timezone) },
                  }),
                );
                router.push(`/reservation/${res.tracking_token}`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
