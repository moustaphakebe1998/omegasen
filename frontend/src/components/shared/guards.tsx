"use client";

import { Ban, Loader2, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { type Role, useAuth } from "@/lib/auth";
import { can, membershipIn, type Perm } from "@/lib/permissions";

export function FullPageSpinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center gap-3 text-muted-foreground" role="status">
      <Loader2 className="size-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function Forbidden({ message = "Vous n'avez pas accès à cet espace." }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Accès refusé</h1>
      <p className="text-muted-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link href="/manage">Retour</Link>
      </Button>
    </div>
  );
}

const BLOCK_TITLE: Record<string, string> = {
  restaurant_suspended: "Restaurant suspendu",
  restaurant_closed: "Restaurant fermé",
  restaurant_pending: "Restaurant en attente d'activation",
};

/**
 * Restaurant inaccessible (suspendu, fermé, en attente) : écran explicite à la place de l'espace.
 * Le backend refuse déjà toutes les opérations ; cet écran évite une interface faite d'erreurs.
 */
export function RestaurantBlocked({ code, message, name }: { code: string; message: string; name?: string }) {
  const { user, logout } = useAuth();
  const others = (user?.memberships ?? []).filter((m) => !m.access_blocked).length;
  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Ban className="size-10 text-destructive" aria-hidden />
      <h1 className="text-2xl font-semibold">{BLOCK_TITLE[code] ?? "Accès suspendu"}</h1>
      {name && <p className="font-medium">{name}</p>}
      <p className="max-w-md text-muted-foreground">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {others > 0 && (
          <Button asChild variant="outline">
            <Link href="/manage">Mes autres restaurants</Link>
          </Button>
        )}
        <Button variant="outline" onClick={() => void logout()}>
          <LogOut aria-hidden /> Se déconnecter
        </Button>
      </div>
    </div>
  );
}

/** Motif de blocage du restaurant pour l'utilisateur connecté (jamais pour le super admin). */
function useRestaurantBlock(restaurantId: string) {
  const { user } = useAuth();
  if (!user || user.is_superadmin) return null;
  const m = membershipIn(user, restaurantId);
  return m?.access_blocked
    ? { code: m.access_blocked, message: m.access_message ?? "", name: m.restaurant_name }
    : null;
}

/** Exige une session ; redirige vers /login?next=… sinon. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);
  if (loading || !user) return <FullPageSpinner />;
  return <>{children}</>;
}

/**
 * Exige un rôle dans le restaurant donné (le super admin passe toujours).
 * Le backend revérifie systématiquement : ce garde n'est qu'un confort d'interface.
 */
export function RequireRestaurantRole({
  restaurantId,
  roles,
  children,
}: {
  restaurantId: string;
  roles: Role[];
  children: React.ReactNode;
}) {
  const { user, roleIn } = useAuth();
  const block = useRestaurantBlock(restaurantId);
  return (
    <RequireAuth>
      {block ? (
        <RestaurantBlocked {...block} />
      ) : user && (user.is_superadmin || (roleIn(restaurantId) && roles.includes(roleIn(restaurantId)!))) ? (
        children
      ) : (
        <Forbidden />
      )}
    </RequireAuth>
  );
}

/**
 * Exige une permission dans le restaurant donné (permissions effectives de l'adhésion ;
 * le super admin passe toujours). Confort d'interface : le backend revérifie chaque route.
 */
export function RequireRestaurantPerm({
  restaurantId,
  perm,
  message,
  children,
}: {
  restaurantId: string;
  perm: Perm;
  message?: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const block = useRestaurantBlock(restaurantId);
  return (
    <RequireAuth>
      {block ? (
        <RestaurantBlocked {...block} />
      ) : can(user, restaurantId, perm) ? (
        children
      ) : (
        <Forbidden message={message} />
      )}
    </RequireAuth>
  );
}

export function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <RequireAuth>{user?.is_superadmin ? children : <Forbidden />}</RequireAuth>;
}
