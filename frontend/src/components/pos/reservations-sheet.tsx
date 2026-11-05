"use client";

import { CalendarDays, Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { useCan } from "@/components/manage/layout/permissions";
import { NewReservationDialog } from "@/components/manage/reservations/new-reservation-dialog";
import { ReservationCard } from "@/components/manage/reservations/reservation-card";
import { useReservations } from "@/components/manage/reservations/use-reservations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { errorMessage, type Schemas } from "@/lib/api/client";
import { formatDayLabel, todayIn, type Reservation, type ReservationStatus } from "@/lib/reservations";

const UPCOMING: ReservationStatus[] = ["PENDING", "CONFIRMED"];

/** Réservations du jour pour la caisse (mêmes actions que l'espace gérant, boutons tactiles). */
export function ReservationsSheet({
  restaurant,
  open,
  onOpenChange,
  list,
}: {
  restaurant: Schemas["RestaurantOut"];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  list: ReturnType<typeof useReservations>;
}) {
  const [newOpen, setNewOpen] = useState(false);
  const canManage = useCan(restaurant.id)("reservations.manage");
  const tz = restaurant.timezone;
  const all = list.data ?? [];
  const toCome = all.filter((r) => UPCOMING.includes(r.status));
  const others = all.filter((r) => !UPCOMING.includes(r.status));

  const section = (title: string, items: Reservation[], empty: string) => (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
        <Badge variant="secondary">{items.length}</Badge>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <ReservationCard key={r.id} rid={restaurant.id} r={r} timeZone={tz} touch />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 bg-muted sm:max-w-xl">
          <SheetHeader className="border-b bg-background pr-12">
            <SheetTitle className="text-xl">Réservations du jour</SheetTitle>
            <SheetDescription className="first-letter:uppercase">{formatDayLabel(todayIn(tz))}</SheetDescription>
            {canManage && (
              <Button className="mt-2 h-12 w-full text-base sm:w-auto sm:self-start" onClick={() => setNewOpen(true)}>
                <Plus className="size-5" />
                Nouvelle réservation
              </Button>
            )}
          </SheetHeader>
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            {list.isPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" /> Chargement…
              </p>
            ) : list.isError ? (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{errorMessage(list.error)}</p>
                <Button variant="outline" onClick={() => list.refetch()}>
                  Réessayer
                </Button>
              </div>
            ) : all.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-background p-8 text-center">
                <CalendarDays className="size-8 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">Aucune réservation aujourd&apos;hui.</p>
              </div>
            ) : (
              <>
                {section("À venir", toCome, "Plus de réservation attendue aujourd'hui.")}
                {others.length > 0 && section("Traitées", others, "")}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {canManage && <NewReservationDialog restaurant={restaurant} open={newOpen} onOpenChange={setNewOpen} />}
    </>
  );
}
