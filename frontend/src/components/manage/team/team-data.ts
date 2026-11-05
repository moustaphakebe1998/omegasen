"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { api, ApiError, errorMessage, unwrap, type Schemas } from "@/lib/api/client";
import { useAuth, type User } from "@/lib/auth";
import type { MemberRole } from "@/lib/labels";
import { can, type Perm } from "@/lib/permissions";

export type Member = Schemas["MemberOut"];
export type Catalog = Schemas["PermissionCatalog"];
export type Station = Schemas["StationOut"];
export type { Perm };

export const ALL_ROLES: MemberRole[] = ["OWNER", "MANAGER", "CASHIER", "KITCHEN"];

/** Description courte de chaque rôle (sélecteurs de rôle). */
export const ROLE_DESCRIPTION: Record<MemberRole, string> = {
  OWNER: "Tous les droits, toujours, y compris la gestion des administrateurs.",
  MANAGER: "Gère le restaurant au quotidien : menu, commandes, réservations, équipe.",
  CASHIER: "Prend les commandes au guichet, encaisse et suit les réservations.",
  KITCHEN: "Prépare les commandes sur l'écran cuisine et signale les ruptures.",
};

export const ROLE_TONE: Record<MemberRole, string> = {
  OWNER: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  MANAGER: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  CASHIER: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  KITCHEN: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
};

export type MemberStatus = "ACTIVE" | "DISABLED" | "PENDING" | "EXPIRED";

/** Statut principal d'un collaborateur (invitation non acceptée > désactivé > actif). */
export function memberStatus(m: Member): MemberStatus {
  if (!m.activated) return m.invite_status === "EXPIRED" ? "EXPIRED" : "PENDING";
  return m.is_active ? "ACTIVE" : "DISABLED";
}

export const STATUS_META: Record<MemberStatus, { label: string; className: string }> = {
  ACTIVE: { label: "Actif", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  DISABLED: {
    label: "Désactivé",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  },
  PENDING: {
    label: "Invitation en attente",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  EXPIRED: { label: "Invitation expirée", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
};

export const hasOverrides = (m: Member) => m.role !== "OWNER" && Object.keys(m.permission_overrides ?? {}).length > 0;

export const membersKey = (rid: string) => ["members", rid] as const;

export function useMembers(rid: string, enabled = true) {
  return useQuery({
    queryKey: membersKey(rid),
    queryFn: () =>
      unwrap(api.GET("/api/restaurants/{restaurant_id}/members", { params: { path: { restaurant_id: rid } } })),
    enabled,
  });
}

export function useCatalog(rid: string) {
  return useQuery({
    queryKey: ["permissions-catalog", rid],
    queryFn: () =>
      unwrap(
        api.GET("/api/restaurants/{restaurant_id}/permissions/catalog", {
          params: { path: { restaurant_id: rid } },
        }),
      ),
    staleTime: Infinity,
  });
}

export function useStations(rid: string) {
  return useQuery({
    queryKey: ["stations", rid],
    queryFn: () =>
      unwrap(api.GET("/api/restaurants/{restaurant_id}/stations", { params: { path: { restaurant_id: rid } } })),
  });
}

/** Rafraîchit la liste de l'équipe (et l'utilisateur courant s'il est concerné). */
export function useInvalidateMembers(rid: string) {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: membersKey(rid) }), [qc, rid]);
}

/** Droits de l'utilisateur courant sur l'équipe du restaurant. */
export function useTeamAccess(rid: string) {
  const { user, roleIn } = useAuth();
  return teamAccess(user, rid, roleIn(rid));
}

export function teamAccess(user: User | null, rid: string, role: MemberRole | null) {
  const isOwner = !!user?.is_superadmin || role === "OWNER";
  const myPerms = new Set<Perm>(user?.memberships.find((m) => m.restaurant_id === rid)?.permissions ?? []);
  return {
    user,
    isOwner,
    canView: can(user, rid, "team.view"),
    canManage: can(user, rid, "team.manage"),
    /** Un propriétaire accorde tout ; les autres seulement ce qu'ils ont eux-mêmes. */
    canGrant: (p: Perm) => isOwner || myPerms.has(p),
    grantableRoles: isOwner ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "OWNER"),
  };
}

export function permLabel(catalog: Catalog | undefined, key: string): string {
  for (const g of catalog?.groups ?? []) {
    const it = g.items.find((i) => i.key === key);
    if (it) return it.label;
  }
  return key;
}

export function allPerms(catalog: Catalog | undefined): Perm[] {
  return (catalog?.groups ?? []).flatMap((g) => g.items.map((i) => i.key));
}

export function roleDefaults(catalog: Catalog | undefined, role: MemberRole): Set<Perm> {
  if (role === "OWNER") return new Set(allPerms(catalog));
  return new Set(catalog?.role_defaults[role] ?? []);
}

export const sameSet = <T>(a: Set<T>, b: Set<T>) => a.size === b.size && [...a].every((x) => b.has(x));

/** Messages d'erreur métier de l'équipe, en français. */
export function teamErrorMessage(e: unknown, catalog?: Catalog): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "last_owner":
        return "Le restaurant doit garder au moins un administrateur actif : nommez-en d'abord un autre.";
      case "owner_only":
        return "Seul un administrateur du restaurant peut nommer, modifier ou retirer un administrateur.";
      case "self_edit":
        return "Vous ne pouvez pas modifier votre propre rôle, vos permissions ou votre statut, ni vous retirer de l'équipe.";
      case "grant_exceeds": {
        const keys = Array.isArray(e.details) ? (e.details as string[]) : [];
        const labels = keys.map((k) => `« ${permLabel(catalog, k)} »`).join(", ");
        return `Vous ne pouvez pas accorder des permissions que vous n'avez pas${labels ? ` : ${labels}` : ""}.`;
      }
      case "shared_account":
        return "Ce compte est aussi utilisé dans un autre établissement : seul son titulaire peut modifier son nom et son téléphone.";
      case "already_member":
        return "Cette personne fait déjà partie de l'équipe.";
      case "already_activated":
        return "Ce compte est déjà activé : il n'y a plus d'invitation à renvoyer.";
      case "station_not_found":
        return "Ce poste n'existe plus. Rechargez la page et choisissez-en un autre.";
    }
  }
  return errorMessage(e);
}

/** Indication de robustesse d'un mot de passe (0 à 4). */
export function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 10) score = Math.min(score, 1);
  const labels = ["Trop court", "Faible", "Moyen", "Bon", "Excellent"];
  return { score, label: pw.length < 10 ? "Trop court (10 caractères minimum)" : labels[score] };
}
