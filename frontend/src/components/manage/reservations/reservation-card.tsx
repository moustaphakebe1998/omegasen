"use client";

import { Ban, Check, Loader2, Mail, MessageSquareText, Phone, UserCheck, UserX, Users, X } from "lucide-react";
import { useState } from "react";

import { useCan } from "@/components/manage/layout/permissions";
import { ReasonDialog } from "@/components/manage/orders/reason-dialog";
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
import {
  formatDayLabel,
  formatResTime,
  RESERVATION_STATUS,
  reservationDay,
  type Reservation,
  type ReservationStatus,
} from "@/lib/reservations";
import { cn } from "@/lib/utils";

import { useSetReservationStatus } from "./use-reservations";

export function ReservationStatusBadge({ status, className }: { status: ReservationStatus; className?: string }) {
  const s = RESERVATION_STATUS[status];
  return <Badge className={cn("border-transparent", s.className, className)}>{s.label}</Badge>;
}

const ACTIONS: {
  status: ReservationStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: "default" | "outline" | "ghost";
  className?: string;
}[] = [
  { status: "CONFIRMED", label: "Confirmer", icon: Check, variant: "default" },
  { status: "SEATED", label: "Arrivé·e", icon: UserCheck, variant: "default" },
  { status: "NO_SHOW", label: "Absent·e", icon: UserX, variant: "outline" },
  {
    status: "DECLINED",
    label: "Refuser",
    icon: X,
    variant: "outline",
    className: "text-destructive hover:text-destructive",
  },
  { status: "CANCELLED", label: "Annuler", icon: Ban, variant: "ghost", className: "text-muted-foreground" },
];

/**
 * Carte d'une réservation avec les actions autorisées (`allowed_transitions`).
 * `touch` : boutons plus grands (caisse sur tablette).
 */
export function ReservationCard({
  rid,
  r,
  timeZone,
  showDay = false,
  touch = false,
}: {
  rid: string;
  r: Reservation;
  timeZone?: string;
  showDay?: boolean;
  touch?: boolean;
}) {
  const setStatus = useSetReservationStatus(rid);
  const canManage = useCan(rid)("reservations.manage");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const pending = setStatus.isPending ? setStatus.variables?.status : null;
  const actions = canManage ? ACTIONS.filter((a) => r.allowed_transitions.includes(a.status)) : [];
  const done = r.status === "DECLINED" || r.status === "CANCELLED" || r.status === "NO_SHOW";
  const phoneHref = `tel:${r.customer_phone.replace(/[^\d+]/g, "")}`;

  const run = (status: ReservationStatus) => {
    if (status === "DECLINED") return setDeclineOpen(true);
    if (status === "CANCELLED") return setCancelOpen(true);
    setStatus.mutate({ r, status });
  };

  return (
    <article
      aria-label={`Réservation de ${r.customer_name}`}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm",
        r.status === "PENDING" && "border-amber-300 dark:border-amber-800",
        done && "bg-muted/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex w-16 shrink-0 flex-col items-center justify-center rounded-xl py-2 text-center",
            done
              ? "bg-muted text-muted-foreground"
              : "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
          )}
        >
          <span className="tabular text-lg leading-tight font-bold">{formatResTime(r.starts_at, timeZone)}</span>
          <span className="mt-0.5 flex items-center gap-1 text-xs font-medium" aria-label={`${r.party_size} personnes`}>
            <Users className="size-3.5" aria-hidden />
            {r.party_size}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h3 className={cn("min-w-0 font-semibold break-words", done && "text-muted-foreground line-through")}>
              {r.customer_name}
            </h3>
            <ReservationStatusBadge status={r.status} className="shrink-0" />
          </div>
          {showDay && (
            <p className="text-xs font-medium text-muted-foreground first-letter:uppercase">
              {formatDayLabel(reservationDay(r.starts_at, timeZone))}
            </p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <a
              href={phoneHref}
              className="inline-flex min-h-8 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
            >
              <Phone className="size-3.5" aria-hidden />
              {r.customer_phone}
            </a>
            {r.customer_email && (
              <a
                href={`mailto:${r.customer_email}`}
                className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground hover:underline"
              >
                <Mail className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{r.customer_email}</span>
              </a>
            )}
          </p>
        </div>
      </div>

      {r.note && (
        <p className="flex gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 break-words whitespace-pre-line">{r.note}</span>
        </p>
      )}
      {r.staff_note && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Note du restaurant :</span> {r.staff_note}
        </p>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Button
                key={a.status}
                type="button"
                variant={a.variant}
                size={touch ? "lg" : "sm"}
                className={cn(touch && "h-12 min-w-12 px-4 text-base", a.className)}
                disabled={setStatus.isPending}
                onClick={() => run(a.status)}
              >
                {pending === a.status ? <Loader2 className="animate-spin" /> : <Icon />}
                {a.label}
              </Button>
            );
          })}
        </div>
      )}

      <ReasonDialog
        open={declineOpen}
        onOpenChange={setDeclineOpen}
        title={`Refuser la réservation de ${r.customer_name} ?`}
        description="Le motif est communiqué au client (ex. : complet ce soir-là)."
        confirmLabel="Refuser"
        minLength={2}
        onConfirm={async (reason) => {
          await setStatus.mutateAsync({ r, status: "DECLINED", staff_note: reason });
        }}
      />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler cette réservation ?</AlertDialogTitle>
            <AlertDialogDescription>
              {r.customer_name}, {r.party_size} pers. — {formatDayLabel(reservationDay(r.starts_at, timeZone))} à{" "}
              {formatResTime(r.starts_at, timeZone)}. Pensez à prévenir le client.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => setStatus.mutate({ r, status: "CANCELLED" })}>
              Annuler la réservation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
