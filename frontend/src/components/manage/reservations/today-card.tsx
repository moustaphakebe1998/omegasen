"use client";

import { CalendarDays, ChevronRight, Users } from "lucide-react";
import Link from "next/link";

import { IconChip } from "@/components/manage/layout/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api/client";
import { formatResTime, todayIn, type ReservationStatus } from "@/lib/reservations";

import { ReservationStatusBadge } from "./reservation-card";
import { useReservations } from "./use-reservations";

const LIVE: ReservationStatus[] = ["PENDING", "CONFIRMED", "SEATED"];

/** Petite carte « Réservations du jour » de la vue d'ensemble. */
export function TodayReservationsCard({ rid, timeZone }: { rid: string; timeZone?: string }) {
  const today = todayIn(timeZone);
  const q = useReservations(rid, { day: today }, !!timeZone);
  const live = (q.data ?? []).filter((r) => LIVE.includes(r.status));
  const covers = live.reduce((n, r) => n + r.party_size, 0);
  const pending = live.filter((r) => r.status === "PENDING").length;

  return (
    <section aria-labelledby="rsv-today-title" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-3">
        <IconChip icon={CalendarDays} tone="teal" className="size-9" />
        <div className="min-w-0 flex-1">
          <h2 id="rsv-today-title" className="font-semibold">
            Réservations du jour
          </h2>
          <p className="text-xs text-muted-foreground">
            {q.isPending
              ? "Chargement…"
              : `${live.length} réservation${live.length > 1 ? "s" : ""} · ${covers} couvert${covers > 1 ? "s" : ""}`}
            {pending > 0 && (
              <span className="font-medium text-amber-700 dark:text-amber-300"> · {pending} à confirmer</span>
            )}
          </p>
        </div>
      </div>
      {q.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : q.isError ? (
        <p className="text-sm text-muted-foreground">{errorMessage(q.error)}</p>
      ) : live.length === 0 ? (
        <p className="rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
          Aucune réservation aujourd&apos;hui.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {live.slice(0, 4).map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="tabular w-11 shrink-0 font-semibold">{formatResTime(r.starts_at, timeZone)}</span>
              <span className="min-w-0 flex-1 truncate">{r.customer_name}</span>
              <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                <Users className="size-3.5" aria-hidden />
                {r.party_size}
              </span>
              <ReservationStatusBadge status={r.status} className="hidden sm:inline-flex" />
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/manage/${rid}/reservations`}
        className="group mt-3 flex items-center justify-end gap-1 text-sm font-medium text-primary hover:underline"
      >
        Voir les réservations
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </section>
  );
}
