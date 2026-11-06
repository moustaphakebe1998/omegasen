"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage, type Schemas } from "@/lib/api/client";
import { ROLE } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type UserStatus = Schemas["UserStatus"];
export type RestaurantStatus = Schemas["RestaurantStatus"];
export type MemberRole = Schemas["MemberRole"];

export const ROLES: MemberRole[] = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "STAFF"];

export const roleLabel = (r: MemberRole) => ROLE[r] ?? r;

export const USER_STATUS: Record<UserStatus, { label: string; className: string }> = {
  PENDING: {
    label: "En attente d'activation",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  ACTIVE: { label: "Actif", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  DISABLED: {
    label: "Désactivé",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
};

export const RESTAURANT_STATUS: Record<RestaurantStatus, { label: string; className: string; dot: string }> = {
  PENDING: {
    label: "En préparation",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  ACTIVE: {
    label: "Actif",
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
    dot: "bg-green-500",
  },
  SUSPENDED: {
    label: "Suspendu",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    dot: "bg-red-500",
  },
  CLOSED: {
    label: "Fermé",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    dot: "bg-neutral-500",
  },
};

export const RESTAURANT_STATUSES: RestaurantStatus[] = ["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"];

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const s = USER_STATUS[status];
  return <Badge className={cn("border-transparent", s.className)}>{s.label}</Badge>;
}

export function RestaurantStatusBadge({ status }: { status: RestaurantStatus }) {
  const s = RESTAURANT_STATUS[status];
  return <Badge className={cn("border-transparent", s.className)}>{s.label}</Badge>;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

const AVATAR_TONES = [
  "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
];

export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const tone = AVATAR_TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
        tone,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Messages d'erreur API traduits pour les cas métier du super admin. */
export function adminErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "self_demotion":
        return "Vous ne pouvez pas désactiver votre propre compte ni retirer vos propres droits super admin.";
      case "last_owner":
        return "Le restaurant doit garder au moins un propriétaire actif : désignez d'abord un autre propriétaire.";
      case "email_taken":
        return "Un compte existe déjà avec cet email.";
      case "already_member":
        return "Cet utilisateur est déjà rattaché à ce restaurant.";
      case "already_activated":
        return "Ce compte est déjà activé : il n'y a pas de lien à renvoyer.";
      case "membership_incomplete":
        return "Choisissez à la fois le restaurant et le rôle.";
      case "last_superadmin":
        return "La plateforme doit garder au moins un super admin actif.";
      case "superadmin_no_membership":
        return "Un super admin administre tous les restaurants : il n'est membre d'aucun restaurant.";
      case "reason_required":
        return "Indiquez le motif de la suspension ou de la fermeture.";
      case "must_be_closed":
        return "Fermez d'abord le restaurant avant de le supprimer.";
      case "confirmation_mismatch":
        return "La confirmation saisie ne correspond pas.";
      case "self_delete":
        return "Vous ne pouvez pas supprimer votre propre compte.";
      case "not_activated":
        return "Ce compte n'est pas encore activé : renvoyez plutôt le lien d'activation.";
    }
  }
  return errorMessage(e);
}

/** Carte d'indicateur avec pastille d'icône colorée. */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "bg-primary/10 text-primary",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-4 shadow-xs sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="tabular truncate text-2xl font-bold">{value}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const STATUS_CONFIRM: Record<
  RestaurantStatus,
  { title: string; body: string; action: string; reason: boolean; destructive: boolean }
> = {
  SUSPENDED: {
    title: "Suspendre",
    body: "Le restaurant disparaît du public et ne reçoit plus de commandes. Toute son équipe (propriétaires compris) perd immédiatement l'accès : sessions fermées, connexion refusée avec un message explicite. Aucun compte n'est modifié : la réactivation rétablit les accès.",
    action: "Suspendre",
    reason: true,
    destructive: true,
  },
  CLOSED: {
    title: "Fermer",
    body: "Le restaurant est fermé : il disparaît du public et toute son équipe perd l'accès. Ses données restent conservées et consultables par la plateforme.",
    action: "Fermer le restaurant",
    reason: true,
    destructive: true,
  },
  PENDING: {
    title: "Mettre en attente",
    body: "Le restaurant n'est plus public. Seuls ses propriétaires et administrateurs peuvent encore le préparer ; le reste de l'équipe est bloqué jusqu'à l'activation.",
    action: "Mettre en attente",
    reason: false,
    destructive: false,
  },
  ACTIVE: {
    title: "Activer",
    body: "Le restaurant redevient public. Les comptes encore actifs retrouvent leurs accès, rôles et permissions ; les comptes désactivés individuellement restent bloqués.",
    action: "Activer",
    reason: false,
    destructive: false,
  },
};

/**
 * Sélecteur de statut d'un restaurant (4 statuts) : chaque changement est confirmé ; suspension et
 * fermeture exigent un motif (journal d'activité).
 */
export function RestaurantStatusSelect({
  name,
  value,
  onChange,
  pending,
  className,
}: {
  name: string;
  value: RestaurantStatus;
  onChange: (s: RestaurantStatus, reason?: string) => void;
  pending?: boolean;
  className?: string;
}) {
  const [confirm, setConfirm] = useState<RestaurantStatus | null>(null);
  const [reason, setReason] = useState("");
  const c = confirm ? STATUS_CONFIRM[confirm] : undefined;
  const reasonOk = !c?.reason || reason.trim().length >= 3;
  return (
    <>
      <Select
        value={value}
        disabled={pending}
        onValueChange={(v) => {
          const s = v as RestaurantStatus;
          if (s === value) return;
          setReason("");
          setConfirm(s);
        }}
      >
        <SelectTrigger className={cn("w-44", className)} aria-label={`Statut de ${name}`}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RESTAURANT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              <span className={cn("size-2 rounded-full", RESTAURANT_STATUS[s].dot)} aria-hidden />
              {RESTAURANT_STATUS[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          {c && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {c.title} {name} ?
                </AlertDialogTitle>
                <AlertDialogDescription>{c.body}</AlertDialogDescription>
              </AlertDialogHeader>
              {c.reason && (
                <div className="space-y-1.5">
                  <Label htmlFor="status-reason">Motif (obligatoire, visible dans le journal)</Label>
                  <Textarea
                    id="status-reason"
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="ex. Impayés, contrôle sanitaire, demande du restaurateur…"
                  />
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <Button
                  variant={c.destructive ? "destructive" : "default"}
                  disabled={!reasonOk}
                  onClick={() => {
                    onChange(confirm!, c.reason ? reason.trim() : undefined);
                    setConfirm(null);
                  }}
                >
                  {c.action}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Dialogue de confirmation générique. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  confirmDisabled,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  /** Confirmation incomplète (ex. saisie de vérification) : seul le bouton d'action est désactivé. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || confirmDisabled}
            onClick={onConfirm}
          >
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
