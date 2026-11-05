"use client";

import { KeyRound, Lock, MapPin, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SelectItem } from "@/components/ui/select";
import { ROLE, type MemberRole } from "@/lib/labels";
import { cn } from "@/lib/utils";

import {
  hasOverrides,
  type Member,
  memberStatus,
  passwordStrength,
  ROLE_DESCRIPTION,
  ROLE_TONE,
  STATUS_META,
} from "./team-data";

export function RoleBadge({ role }: { role: MemberRole }) {
  return <Badge className={cn("border-transparent", ROLE_TONE[role])}>{ROLE[role]}</Badge>;
}

/** Badges d'un collaborateur : rôle, statut, mot de passe à changer, poste, permissions personnalisées. */
export function MemberBadges({ member: m, className }: { member: Member; className?: string }) {
  const status = STATUS_META[memberStatus(m)];
  return (
    <div className={cn("flex min-w-0 flex-wrap gap-1.5", className)}>
      <RoleBadge role={m.role} />
      <Badge className={cn("border-transparent", status.className)}>{status.label}</Badge>
      {m.must_change_password && (
        <Badge className="border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200">
          <KeyRound aria-hidden />
          Mot de passe à changer
        </Badge>
      )}
      {m.station_name && (
        <Badge variant="outline" className="max-w-full">
          <MapPin aria-hidden />
          <span className="truncate">{m.station_name}</span>
        </Badge>
      )}
      {hasOverrides(m) && (
        <Badge variant="outline" className="border-violet-300 text-violet-800 dark:border-violet-800 dark:text-violet-200">
          <SlidersHorizontal aria-hidden />
          permissions personnalisées
        </Badge>
      )}
    </div>
  );
}

/** Options d'un sélecteur de rôle, avec une courte description. */
export function RoleOptions({ roles }: { roles: MemberRole[] }) {
  return (
    <>
      {roles.map((r) => (
        <SelectItem key={r} value={r} textValue={ROLE[r]} className="items-start py-2">
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{ROLE[r]}</span>
            <span className="text-xs whitespace-normal text-muted-foreground">{ROLE_DESCRIPTION[r]}</span>
          </span>
        </SelectItem>
      ))}
    </>
  );
}

/** Explication d'un contrôle verrouillé. */
export function LockNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground", className)}>
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const STRENGTH_TONE = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-lime-500", "bg-green-600"];

export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const { score, label } = passwordStrength(password);
  if (!password) {
    return (
      <p id={id} className="text-xs text-muted-foreground">
        10 caractères minimum. Mélangez majuscules, minuscules, chiffres et symboles.
      </p>
    );
  }
  return (
    <div id={id} className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= score ? STRENGTH_TONE[score] : "bg-muted")} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Robustesse : {label}</p>
    </div>
  );
}
