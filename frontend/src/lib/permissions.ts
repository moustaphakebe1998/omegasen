import { ApiError, errorMessage, type Schemas } from "@/lib/api/client";
import type { User } from "@/lib/auth";

/**
 * Permissions granulaires d'un collaborateur (miroir de backend/app/core/permissions.py).
 * L'API renvoie les permissions effectives de chaque adhésion (`memberships[].permissions`) :
 * préréglage du rôle + ajustements du propriétaire.
 */
export type Perm = Schemas["Perm"];

export const PERMISSION_DENIED_MESSAGE = "Vous n'avez pas la permission pour cette action";

/** Adhésion de l'utilisateur au restaurant (null si aucune). */
export function membershipIn(user: User | null | undefined, restaurantId: string | null | undefined) {
  if (!user || !restaurantId) return null;
  return user.memberships.find((x) => x.restaurant_id === restaurantId) ?? null;
}

/**
 * L'utilisateur dispose-t-il de `perm` dans ce restaurant ? Le super admin a toutes les permissions.
 * Confort d'affichage uniquement : le backend revérifie chaque action.
 */
export function can(user: User | null | undefined, restaurantId: string | null | undefined, perm: Perm): boolean {
  if (!user) return false;
  if (user.is_superadmin) return true;
  const m = membershipIn(user, restaurantId);
  return !!m && m.permissions.includes(perm);
}

/** Toutes les permissions demandées. */
export function canAll(user: User | null | undefined, restaurantId: string | null | undefined, perms: Perm[]): boolean {
  return perms.every((p) => can(user, restaurantId, p));
}

/** Erreur 403 « permission_denied » renvoyée par l'API. */
export function isPermissionDenied(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403 && e.code === "permission_denied";
}

/**
 * Message d'erreur d'une action : le refus de permission a toujours le même libellé,
 * les autres erreurs gardent le message (en français) de l'API.
 */
export function actionErrorMessage(e: unknown): string {
  return isPermissionDenied(e) ? PERMISSION_DENIED_MESSAGE : errorMessage(e);
}
