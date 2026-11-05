"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  Check,
  Clock,
  Hourglass,
  Loader2,
  Store,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, Logo } from "@/components/shared/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, errorMessage, unwrap } from "@/lib/api/client";
import { type PublicReservation, type ReservationStatus } from "@/lib/reservations";
import { cn } from "@/lib/utils";

const HEADLINE: Record<ReservationStatus, { title: string; text: string; badge: string; className: string }> = {
  PENDING: {
    title: "Demande envoyée",
    text: "Le restaurant va confirmer votre réservation. Gardez cette page : elle se met à jour automatiquement.",
    badge: "En attente de confirmation",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  CONFIRMED: {
    title: "Votre table est réservée",
    text: "Le restaurant a confirmé votre réservation. À bientôt !",
    badge: "Confirmée",
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  },
  SEATED: {
    title: "Bon appétit !",
    text: "Votre réservation a été honorée. Merci de votre visite.",
    badge: "Honorée",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  },
  DECLINED: {
    title: "Réservation refusée",
    text: "Le restaurant ne peut pas vous accueillir à cet horaire.",
    badge: "Refusée",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  },
  CANCELLED: {
    title: "Réservation annulée",
    text: "Cette réservation a été annulée.",
    badge: "Annulée",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
  NO_SHOW: {
    title: "Réservation non honorée",
    text: "Le restaurant a indiqué que vous n'étiez pas venu·e.",
    badge: "Non honorée",
    className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  },
};

const STEPS: { status: ReservationStatus; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { status: "PENDING", label: "Demande envoyée", icon: Hourglass },
  { status: "CONFIRMED", label: "Confirmée", icon: CalendarCheck },
  { status: "SEATED", label: "À table", icon: UserCheck },
];

const LIVE: ReservationStatus[] = ["PENDING", "CONFIRMED"];

function Timeline({ status }: { status: ReservationStatus }) {
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="grid grid-cols-3 gap-1" aria-label="Avancement de la réservation">
      {STEPS.map((s, i) => {
        const done = i < current || status === "SEATED";
        const active = i === current && status !== "SEATED";
        const Icon = done ? Check : s.icon;
        return (
          <li
            key={s.status}
            aria-current={active ? "step" : undefined}
            className="relative flex flex-col items-center gap-1.5 text-center"
          >
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-5 right-1/2 h-0.5 w-full -translate-y-1/2",
                  i <= current ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative flex size-10 items-center justify-center rounded-full border-2",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary bg-background text-primary ring-4 ring-primary/20",
                !done && !active && "border-border bg-background text-muted-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span
              className={cn(
                "text-xs leading-tight sm:text-sm",
                done || active ? "font-semibold" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Details({ r }: { r: PublicReservation }) {
  // Heure du restaurant, quel que soit le fuseau de l'appareil du client.
  const d = new Date(r.starts_at);
  const timeZone = r.restaurant_timezone;
  const day = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone });
  const items = [
    { icon: CalendarDays, label: "Date", value: day },
    { icon: Clock, label: "Heure", value: time },
    { icon: Users, label: "Personnes", value: `${r.party_size} personne${r.party_size > 1 ? "s" : ""}` },
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {items.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-xl border bg-background p-3 sm:flex-col sm:items-start"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300">
            <Icon className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-semibold first-letter:uppercase">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

export default function ReservationTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const key = ["reservation", token];

  const query = useQuery({
    queryKey: key,
    queryFn: () => unwrap(api.GET("/api/public/reservations/{token}", { params: { path: { token } } })),
    refetchInterval: (q) => (q.state.data && !LIVE.includes(q.state.data.status) ? false : 30_000),
    refetchOnWindowFocus: true,
  });

  const cancel = useMutation({
    mutationFn: () => unwrap(api.POST("/api/public/reservations/{token}/cancel", { params: { path: { token } } })),
    onSuccess: (r) => {
      qc.setQueryData(key, r);
      toast.success("Votre réservation est annulée");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const r = query.data;
  let body: React.ReactNode;
  if (!r) {
    if (query.isError) {
      const missing = query.error instanceof ApiError && query.error.status === 404;
      body = (
        <EmptyState
          icon={CalendarX}
          title={missing ? "Réservation introuvable" : "Impossible de charger la réservation"}
          description={missing ? "Ce lien de suivi n'est pas valide." : errorMessage(query.error)}
          action={
            missing ? (
              <Button asChild variant="outline">
                <Link href="/">Retour à l&apos;accueil</Link>
              </Button>
            ) : (
              <Button onClick={() => query.refetch()}>Réessayer</Button>
            )
          }
        />
      );
    } else {
      body = (
        <div className="space-y-4" aria-busy="true" aria-label="Chargement de la réservation">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      );
    }
  } else {
    const h = HEADLINE[r.status];
    const negative = r.status === "DECLINED" || r.status === "CANCELLED" || r.status === "NO_SHOW";
    body = (
      <div className="space-y-4">
        <section
          aria-labelledby="rsv-title"
          className={cn(
            "rounded-2xl border p-6 text-center shadow-sm sm:p-8",
            negative
              ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30"
              : "bg-card bg-gradient-to-b from-primary/10 to-transparent to-60%",
          )}
        >
          <Link
            href={`/r/${r.restaurant_slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            <Store className="size-4" aria-hidden />
            {r.restaurant_name}
          </Link>
          <h1 id="rsv-title" className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
            {h.title}
          </h1>
          <div aria-live="polite" className="mt-3 space-y-2">
            <Badge className={cn("border-transparent px-3 py-1 text-sm", h.className)}>
              Réservation {h.badge.toLowerCase()}
            </Badge>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">{h.text}</p>
          </div>
          {r.status === "DECLINED" && r.staff_note && (
            <p className="mx-auto mt-4 max-w-sm rounded-xl border border-red-200 bg-background p-3 text-left text-sm dark:border-red-900">
              <span className="font-semibold">Motif : </span>
              {r.staff_note}
            </p>
          )}
        </section>

        {!negative && (
          <section aria-label="Suivi" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <Timeline status={r.status} />
          </section>
        )}

        <section aria-labelledby="rsv-details" className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <h2 id="rsv-details" className="mb-3 font-semibold">
            Votre réservation
          </h2>
          <Details r={r} />
          <p className="mt-3 text-sm text-muted-foreground">Au nom de {r.customer_name}</p>
        </section>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-center">
          <Button asChild variant="outline" className="h-11">
            <Link href={`/r/${r.restaurant_slug}`}>Voir le restaurant</Link>
          </Button>
          {r.can_cancel && (
            <Button
              variant="outline"
              className="h-11 text-destructive hover:text-destructive"
              disabled={cancel.isPending}
              onClick={() => setConfirmCancel(true)}
            >
              {cancel.isPending ? <Loader2 className="animate-spin" /> : <Ban />}
              Annuler ma réservation
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Logo />
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg p-4 pt-6 pb-12">{body}</main>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler votre réservation ?</AlertDialogTitle>
            <AlertDialogDescription>Le restaurant sera prévenu. Cette action est définitive.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder ma réservation</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => cancel.mutate()}>
              Annuler la réservation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
