import type { Schemas } from "@/lib/api/client";
import type { User } from "@/lib/auth";

/**
 * Permissions RBAC d'un rôle de restaurant (miroir de backend/app/core/permissions.py).
 * L'API renvoie les permissions effectives de chaque adhésion (`memberships[].permissions`).
 */
export type Perm = Schemas["Perm"];

/**
 * L'utilisateur dispose-t-il de `perm` dans ce restaurant ? Le super admin a toutes les permissions.
 * Confort d'affichage uniquement : le backend revérifie chaque action.
 */
export function can(user: User | null | undefined, restaurantId: string | null | undefined, perm: Perm): boolean {
  if (!user) return false;
  if (user.is_superadmin) return true;
  if (!restaurantId) return false;
  const m = user.memberships.find((x) => x.restaurant_id === restaurantId);
  return !!m && m.permissions.includes(perm);
}
