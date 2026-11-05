"use client";

import { ChevronRight, Clock, Loader2, MoreHorizontal, Pencil, Power, RefreshCw, Trash2, X } from "lucide-react";
import Link from "next/link";

import { InitialsAvatar } from "@/components/admin/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { Member } from "./team-data";
import { MemberBadges } from "./team-ui";

type CardProps = {
  member: Member;
  href: string;
  self: boolean;
  /** Actions autorisées pour l'utilisateur courant sur ce collaborateur. */
  manageable: boolean;
  onToggleActive?: () => void;
  onRemove?: () => void;
};

function Identity({ member: m, href, self }: { member: Member; href: string; self: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          href={href}
          className="truncate font-semibold after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none after:focus-visible:ring-2 after:focus-visible:ring-ring"
        >
          {m.full_name}
        </Link>
        {self && <Badge variant="secondary">Vous</Badge>}
      </div>
      <p className="truncate text-sm text-muted-foreground">{m.email}</p>
    </div>
  );
}

/** Carte d'un collaborateur (compte activé). Toute la carte mène à la fiche. */
export function MemberCard({ member: m, href, self, manageable, onToggleActive, onRemove }: CardProps) {
  return (
    <li
      className={cn(
        "relative flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-colors hover:bg-muted/40 sm:items-center sm:gap-4",
        !m.is_active && "bg-muted/30",
      )}
      aria-label={`${m.full_name} (${m.email})`}
    >
      <InitialsAvatar name={m.full_name} className={cn(!m.is_active && "opacity-50")} />
      <div className="min-w-0 flex-1 space-y-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_11rem] lg:items-center lg:gap-4 lg:space-y-0">
        <Identity member={m} href={href} self={self} />
        <MemberBadges member={m} />
        <p className="text-xs text-muted-foreground lg:text-right">
          {m.last_login_at ? `Dernière connexion le ${formatDateTime(m.last_login_at)}` : "Jamais connecté·e"}
        </p>
      </div>
      {manageable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative z-10 shrink-0"
              aria-label={`Actions pour ${m.full_name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href={href}>
                <Pencil />
                Modifier
              </Link>
            </DropdownMenuItem>
            {!self && (
              <>
                <DropdownMenuItem onSelect={onToggleActive}>
                  <Power />
                  {m.is_active ? "Désactiver" : "Réactiver"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                  <Trash2 />
                  Retirer de l&apos;équipe
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <ChevronRight className="mt-2 size-5 shrink-0 text-muted-foreground sm:mt-0" aria-hidden />
      )}
    </li>
  );
}

/** Carte d'une invitation (compte pas encore activé). */
export function InvitationCard({
  member: m,
  href,
  self,
  manageable,
  resending,
  onResend,
  onCancel,
}: Omit<CardProps, "onToggleActive" | "onRemove"> & {
  resending?: boolean;
  onResend: () => void;
  onCancel: () => void;
}) {
  const expired = m.invite_status === "EXPIRED";
  return (
    <li
      className="relative flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs transition-colors hover:bg-muted/40 md:flex-row md:items-center md:gap-4"
      aria-label={`Invitation de ${m.full_name} (${m.email})`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 md:items-center md:gap-4">
        <InitialsAvatar name={m.full_name} />
        <div className="min-w-0 flex-1 space-y-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center lg:gap-4 lg:space-y-0">
          <Identity member={m} href={href} self={self} />
          <div className="space-y-1.5">
            <MemberBadges member={m} />
            <p className={cn("flex items-center gap-1.5 text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
              <Clock className="size-3.5 shrink-0" aria-hidden />
              {m.invite_expires_at
                ? `${expired ? "Expirée le" : "Expire le"} ${formatDateTime(m.invite_expires_at)}`
                : "Aucun lien valide"}
            </p>
          </div>
        </div>
      </div>
      {manageable && (
        <div className="relative z-10 flex shrink-0 gap-2 max-md:pl-13">
          <Button variant="outline" size="sm" onClick={onResend} disabled={resending}>
            {resending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Renvoyer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={onCancel}
          >
            <X />
            Annuler l&apos;invitation
          </Button>
        </div>
      )}
    </li>
  );
}
