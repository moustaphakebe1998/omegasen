"use client";

import { CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Hourglass, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useRestaurant } from "@/components/manage/layout/hooks";
import { IconChip } from "@/components/manage/layout/kpi-card";
import { NewReservationDialog } from "@/components/manage/reservations/new-reservation-dialog";
import { ReservationCard } from "@/components/manage/reservations/reservation-card";
import { useReservations } from "@/components/manage/reservations/use-reservations";
import { EmptyState, PageHeader } from "@/components/shared/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api/client";
import {
  formatDayLabel,
  RESERVATION_STATUS,
  reservationDay,
  shiftDay,
  todayIn,
  type Reservation,
  type ReservationStatus,
} from "@/lib/reservations";
import { cn } from "@/lib/utils";

const FILTERS: (ReservationStatus | "ALL")[] = [
  "ALL",
  "PENDING",
  "CONFIRMED",
  "SEATED",
  "NO_SHOW",
  "DECLINED",
  "CANCELLED",
];

const ACTIVE: ReservationStatus[] = ["PENDING", "CONFIRMED", "SEATED"];

function groupByDay(list: Reservation[], tz: string) {
  const groups = new Map<string, Reservation[]>();
  for (const r of list) {
    const d = reservationDay(r.starts_at, tz);
    groups.set(d, [...(groups.get(d) ?? []), r]);
  }
  return [...groups.entries()];
}

export default function ReservationsPage() {
  const { rid } = useParams<{ rid: string }>();
  const { data: restaurant } = useRestaurant(rid);
  const tz = restaurant?.timezone ?? "Africa/Dakar";
  const today = todayIn(tz);

  const [view, setView] = useState<"day" | "upcoming">("day");
  const [day, setDay] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReservationStatus | "ALL">("ALL");
  const [newOpen, setNewOpen] = useState(false);
  const currentDay = day ?? today;

  const list = useReservations(rid, view === "day" ? { day: currentDay } : { upcoming: true }, !!restaurant);
  const all = list.data ?? [];
  const shown = filter === "ALL" ? all : all.filter((r) => r.status === filter);
  const count = (s: ReservationStatus | "ALL") => (s === "ALL" ? all.length : all.filter((r) => r.status === s).length);
  const covers = all.filter((r) => ACTIVE.includes(r.status)).reduce((n, r) => n + r.party_size, 0);
  const pending = count("PENDING");

  const dayLabel =
    currentDay === today
      ? "Aujourd'hui"
      : currentDay === shiftDay(today, 1)
        ? "Demain"
        : currentDay === shiftDay(today, -1)
          ? "Hier"
          : null;

  return (
    <>
      <PageHeader
        title="Réservations"
        description="Demandes en ligne et réservations prises par téléphone."
        actions={
          <Button onClick={() => setNewOpen(true)} disabled={!restaurant}>
            <Plus />
            Nouvelle réservation
          </Button>
        }
      />

      {restaurant && !restaurant.reservations_enabled && (
        <p className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Les réservations en ligne sont désactivées : vos clients ne peuvent pas réserver depuis votre page.{" "}
          <Link href={`/manage/${rid}/settings`} className="font-medium underline underline-offset-4">
            Les activer dans Établissement › Commande
          </Link>
          . Vous pouvez toujours saisir des réservations ici.
        </p>
      )}

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Affichage" className="inline-flex w-full rounded-xl bg-muted p-1 sm:w-auto">
          {(
            [
              ["day", "Par jour", CalendarDays],
              ["upcoming", "À venir", CalendarClock],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors sm:flex-none",
                view === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {view === "day" ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Jour précédent"
              onClick={() => setDay(shiftDay(currentDay, -1))}
            >
              <ChevronLeft />
            </Button>
            <label className="relative flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium sm:w-60 sm:flex-none">
              <span className="truncate first-letter:uppercase">
                {dayLabel ? `${dayLabel} · ` : ""}
                {formatDayLabel(currentDay, { weekday: dayLabel ? undefined : "long" })}
              </span>
              <input
                type="date"
                aria-label="Choisir un jour"
                value={currentDay}
                onChange={(e) => e.target.value && setDay(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:size-full"
              />
            </label>
            <Button
              variant="outline"
              size="icon"
              aria-label="Jour suivant"
              onClick={() => setDay(shiftDay(currentDay, 1))}
            >
              <ChevronRight />
            </Button>
            {currentDay !== today && (
              <Button variant="ghost" size="sm" onClick={() => setDay(null)}>
                Aujourd&apos;hui
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Toutes les réservations à partir de maintenant.</p>
        )}
      </div>

      <div className="mb-4 grid grid-cols-3 divide-x rounded-2xl border bg-card shadow-sm">
        {(
          [
            [CalendarDays, "orange", "Réservations", all.length],
            [Users, "blue", "Couverts", covers],
            [Hourglass, "amber", "À confirmer", pending],
          ] as const
        ).map(([Icon, tone, label, value]) => (
          <div key={label} className="flex min-w-0 items-center gap-3 p-3 sm:p-4">
            <IconChip icon={Icon} tone={tone} className="hidden sm:flex" />
            <div className="min-w-0">
              <p className="tabular text-xl font-semibold sm:text-2xl">{list.isPending ? "…" : value}</p>
              <p className="truncate text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div role="group" aria-label="Filtrer par statut" className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {FILTERS.map((f) => {
            const n = count(f);
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                {f === "ALL" ? "Toutes" : RESERVATION_STATUS[f].label}
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 text-xs",
                    active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {list.isPending ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : list.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border p-8 text-center">
          <p className="text-sm text-muted-foreground">{errorMessage(list.error)}</p>
          <Button variant="outline" onClick={() => list.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={all.length === 0 ? "Aucune réservation" : "Aucune réservation avec ce statut"}
          description={
            view === "day"
              ? "Les demandes de vos clients et les réservations saisies apparaîtront ici."
              : "Aucune réservation à venir pour le moment."
          }
          action={
            <Button variant="outline" onClick={() => setNewOpen(true)} disabled={!restaurant}>
              <Plus />
              Nouvelle réservation
            </Button>
          }
        />
      ) : view === "day" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((r) => (
            <ReservationCard key={r.id} rid={rid} r={r} timeZone={tz} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groupByDay(shown, tz).map(([d, items]) => (
            <section key={d} aria-labelledby={`day-${d}`}>
              <h2 id={`day-${d}`} className="mb-2 text-sm font-semibold text-muted-foreground first-letter:uppercase">
                {d === today ? "Aujourd'hui" : d === shiftDay(today, 1) ? "Demain" : formatDayLabel(d)}
                <span className="font-normal">
                  {" "}
                  · {items.length} réservation{items.length > 1 ? "s" : ""}
                </span>
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {items.map((r) => (
                  <ReservationCard key={r.id} rid={rid} r={r} timeZone={tz} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {restaurant && (
        <NewReservationDialog
          restaurant={restaurant}
          open={newOpen}
          onOpenChange={setNewOpen}
          defaultDay={view === "day" ? currentDay : undefined}
        />
      )}
    </>
  );
}
